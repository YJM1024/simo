package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"simo/internal/core/eventlog"
)

const (
	// wsFrameSessionUnread 是"某会话出现新的未读 agent 消息"的进程内全局广播帧。
	//
	// 它只走 WS、不落事件日志：未读是"游标 + 消息时间"判定的派生状态，重连后由
	// 会话列表的 hasUnread 重建，不需要回放；把它写进 events 表只会放大历史。
	wsFrameSessionUnread = "session_unread"

	// unreadBroadcastWindow 是同一会话未读帧的去抖窗口：窗口内多条 agent 消息
	// 只提示一次，避免流式/批量写入把侧栏刷屏。
	unreadBroadcastWindow = 200 * time.Millisecond
)

// sessionUnreadEvent 是 session_unread 帧载荷；前端只按 sessionId 点亮红点。
type sessionUnreadEvent struct {
	SessionID string `json:"sessionId"`
}

// unreadHub 持有本进程内所有已连接 WS 客户端的发送通道，与"是否订阅某会话"无关。
//
// 为什么单独做一层而不是复用 eventlog 广播：eventlog 的 message.created 已经发给所有
// 订阅者，但它是"消息本体"事件，不携带"该会话现在变为未读"的判定；前端订阅连接也只在
// 打开某会话后才建立。这里在消息落库后按游标判定未读，再推一条与订阅无关的提示帧。
type unreadHub struct {
	mu       sync.Mutex
	nextID   int
	subs     map[int]chan<- wsEnvelope
	lastSent map[string]time.Time
	window   time.Duration
	now      func() time.Time
}

func newUnreadHub() *unreadHub {
	return &unreadHub{
		subs:     make(map[int]chan<- wsEnvelope),
		lastSent: make(map[string]time.Time),
		window:   unreadBroadcastWindow,
		now:      time.Now,
	}
}

// register 把一个 WS 连接的发送通道挂到广播集合上，返回可用于 unregister 的 id。
func (h *unreadHub) register(out chan<- wsEnvelope) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.nextID++
	id := h.nextID
	h.subs[id] = out
	return id
}

func (h *unreadHub) unregister(id int) {
	h.mu.Lock()
	delete(h.subs, id)
	h.mu.Unlock()
}

// broadcast 向所有连接非阻塞投递 session_unread；同一会话窗口内的重复帧被丢弃。
// 返回是否真的广播（false 表示被去抖窗口合并）。
func (h *unreadHub) broadcast(sessionID string) bool {
	if sessionID == "" {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.now()
	if last, ok := h.lastSent[sessionID]; ok && now.Sub(last) < h.window {
		return false
	}
	// 顺带清掉过期条目，长时间运行时会话数增长也不会让 map 无限膨胀。
	for id, at := range h.lastSent {
		if now.Sub(at) >= h.window {
			delete(h.lastSent, id)
		}
	}
	h.lastSent[sessionID] = now
	env := wsEnvelope{Type: wsFrameSessionUnread, Data: sessionUnreadEvent{SessionID: sessionID}}
	for _, out := range h.subs {
		select {
		case out <- env:
		default:
			// 发送缓冲已满（慢连接）：丢这一帧提示即可，客户端刷新列表仍能恢复；
			// 不能让一个慢客户端阻塞广播或其它连接的 turn。
		}
	}
	return true
}

// consumeUnreadEvents 监听落库事件：可见 agent 消息一旦使会话变为未读，就广播提示帧。
//
// 只看 role=agent 且 internal=0，与 UnreadSessionIDs 的判定口径一致；用户自己发的消息
// 永不产生未读。
func (m *Module) consumeUnreadEvents(ch <-chan eventlog.Event) {
	defer m.eventWG.Done()
	for ev := range ch {
		if ev.Type != eventlog.TypeMessageCreated {
			continue
		}
		var msg struct {
			SessionID string `json:"sessionId"`
			Role      string `json:"role"`
			At        int64  `json:"at"`
			Internal  bool   `json:"internal"`
		}
		if err := json.Unmarshal(ev.Payload, &msg); err != nil {
			continue
		}
		if msg.Role != RoleAgent || msg.Internal || msg.SessionID == "" {
			continue
		}
		unread, err := m.sessionUnreadAt(context.Background(), msg.SessionID, msg.At)
		if err != nil {
			m.log.Warn("判定会话未读失败", "err", err, "sessionId", msg.SessionID)
			continue
		}
		if unread {
			m.unread.broadcast(msg.SessionID)
		}
	}
}

// sessionUnreadAt 判定某条消息（at 为该消息时间）是否严格晚于会话已读游标。
//
// 与 UnreadSessionIDs 的 SQL 口径一致：没有游标行即未读；游标 >= 消息时间即已读。
// 用单行查询而不是扫全表，因为它在每条可见 agent 消息落库后都会走一次。
func (m *Module) sessionUnreadAt(ctx context.Context, sessionID string, at int64) (bool, error) {
	var readAt int64
	err := m.store.QueryRow(ctx,
		`SELECT last_read_at FROM session_read_cursors WHERE session_id = ?`, sessionID).Scan(&readAt)
	if errors.Is(err, sql.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return readAt < at, nil
}
