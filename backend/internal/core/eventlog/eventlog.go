// Package eventlog 是内核的事件日志：定义事件类型、append、回放、进程内广播。
//
// 纪律（design/19 §3/§7、design/18 v0.2）：
//   - 事件先落库，再推送（Append 内先事务写入 + Flush，再 Broker.Publish）；
//   - 事件 id 由 SQLite AUTOINCREMENT 单调递增，WebSocket 的 since 续接直接复用；
//   - 回放按 id 升序，支持 afterID（since）续接；
//   - hello 是连接级 WS 帧，不落库（chat 模块直接发）。
package eventlog

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"simo/internal/core/store"
	"simo/internal/platform/sqlite"
)

// 契约事件名；除连接级 hello 外都必须落库。
const (
	// M1 兼容事件（用户消息 + 旧客户端）。
	TypeMessageCreated = "message.created"
	TypeMessageDelta   = "message.delta"
	TypeMessageDone    = "message.done"
	TypeStatus         = "status"

	// M2 对话/任务/推理事件（docs/m2-contract.md §5）。
	TypeReplyCreated   = "reply.created"
	TypeReplyDelta     = "reply.delta"
	TypeReplyDone      = "reply.done"
	TypeReplyRetracted = "reply.retracted"
	TypeTaskCreated    = "task.created"
	TypeTaskUpdated    = "task.updated"
	TypeTaskReport     = "task.report"
	TypeTraceReasoning = "trace.reasoning"

	TypeWorkflowCreated = "workflow.created"
	TypeWorkflowUpdated = "workflow.updated"
	TypeWorkflowDone    = "workflow.done"

	// 内部 Loop 事件：持久化、但不广播到 WS（客户端看不到实现细节）。
	TypeIntentFrame    = "intent.frame"
	TypeTurnStep       = "turn.step"
	TypeDecisionRecord = "decision.recorded"
	TypeUsageRecorded  = "usage.recorded"

	// M9 审计（log-only；不广播到 WS）。
	TypeToolCall         = "tool.call"
	TypePermissionChange = "permission.changed"

	// M26 视图（广播到 WS）。
	TypeViewUpdated       = "view.updated"
	TypeViewRender        = "view.render"
	TypeViewBindingFailed = "view.binding.failed"
	TypeViewRendererError = "view.renderer.error"

	// M41 交互卡片（广播到 WS）。
	TypeCardUpdated = "card.updated"
	TypeCardAction  = "card.action"

	// M43 消息自动路由（审计）。
	TypeMessageRouted = "message.routed"

	// M30 记忆巩固（审计，不广播用户 WS）。
	TypeMemoryConsolidated = "memory.consolidated"

	// 团队内部事件：落库审计，不广播到用户 WS。
	TypeTeamCreated          = "team.created"
	TypeTeamArchived         = "team.archived"
	TypeTeamTemplateApplied  = "team.template.applied"
	TypeTeamMemberAdded      = "team.member.added"
	TypeTeamMemberStatus     = "team.member.status_changed"
	TypeTeamOwnerChanged     = "team.owner.changed"
	TypeTeamMessageQueued    = "team.message.queued"
	TypeTeamMessageDelivered = "team.message.delivered"
	TypeTeamMessageFailed    = "team.message.failed"
	TypeTeamTriggerFired     = "team.trigger.fired"
	TypeTeamTriggerFailed    = "team.trigger.failed"
	TypeTeamDeliverableReady = "team.deliverable.ready"
)

var persistedTypes = map[string]struct{}{
	TypeMessageCreated: {},
	TypeMessageDelta:   {},
	TypeMessageDone:    {},
	TypeStatus:         {},

	TypeReplyCreated:    {},
	TypeReplyDelta:      {},
	TypeReplyDone:       {},
	TypeReplyRetracted:  {},
	TypeTaskCreated:     {},
	TypeTaskUpdated:     {},
	TypeTaskReport:      {},
	TypeTraceReasoning:  {},
	TypeWorkflowCreated: {},
	TypeWorkflowUpdated: {},
	TypeWorkflowDone:    {},

	TypeIntentFrame:    {},
	TypeTurnStep:       {},
	TypeDecisionRecord: {},
	TypeUsageRecorded:  {},

	TypeToolCall:         {},
	TypePermissionChange: {},

	TypeViewUpdated:        {},
	TypeViewRender:         {},
	TypeViewBindingFailed:  {},
	TypeViewRendererError:  {},
	TypeMemoryConsolidated: {},
	TypeCardUpdated:        {},
	TypeCardAction:         {},
	TypeMessageRouted:      {},

	TypeTeamCreated:          {},
	TypeTeamArchived:         {},
	TypeTeamTemplateApplied:  {},
	TypeTeamMemberAdded:      {},
	TypeTeamMemberStatus:     {},
	TypeTeamOwnerChanged:     {},
	TypeTeamMessageQueued:    {},
	TypeTeamMessageDelivered: {},
	TypeTeamMessageFailed:    {},
	TypeTeamTriggerFired:     {},
	TypeTeamTriggerFailed:    {},
	TypeTeamDeliverableReady: {},
}

// ErrUnknownEventType 表示事件类型不在契约内。
var ErrUnknownEventType = errors.New("未知事件类型")

// IsPersistedType 判断事件是否应落库（hello 是 WS 连接帧，不经过这里）。
func IsPersistedType(typ string) bool {
	_, ok := persistedTypes[typ]
	return ok
}

// Event 是事件日志中的一条事件。
type Event struct {
	ID      int64           `json:"id"`
	At      int64           `json:"at"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Migrations 是事件日志的表结构（按 core/eventlog 命名空间执行）。
func Migrations() []sqlite.Migration {
	return []sqlite.Migration{{
		Version: 1,
		Name:    "create events",
		Up: func(ctx context.Context, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				at INTEGER NOT NULL,
				type TEXT NOT NULL,
				payload TEXT NOT NULL
			)`)
			return err
		},
	}}
}

// Logger 负责事件落库与广播。
type Logger struct {
	store  *store.Store
	broker *Broker
	mu     sync.Mutex // 保证 db id 顺序与广播顺序一致
	now    func() int64
}

// New 创建事件日志器。
func New(st *store.Store) *Logger {
	return &Logger{
		store:  st,
		broker: NewBroker(),
		now:    func() int64 { return time.Now().UnixMilli() },
	}
}

// Append 校验类型、落库、Flush、广播，返回带 id 的事件。
func (l *Logger) Append(ctx context.Context, typ string, payload any) (Event, error) {
	if !IsPersistedType(typ) {
		return Event{}, fmt.Errorf("%w: %q", ErrUnknownEventType, typ)
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return Event{}, fmt.Errorf("序列化事件 payload 失败: %w", err)
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	at := l.now()
	var id int64
	if err := l.store.Write(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `INSERT INTO events(at, type, payload) VALUES (?, ?, ?)`, at, typ, string(data))
		if err != nil {
			return err
		}
		id, err = res.LastInsertId()
		return err
	}); err != nil {
		return Event{}, fmt.Errorf("写事件 %s 失败: %w", typ, err)
	}

	// 三屏障检查点 M1 版：事件落库后再显式 Flush，然后才允许 WebSocket 推送。
	if err := l.store.Flush(ctx); err != nil {
		return Event{}, err
	}

	ev := Event{ID: id, At: at, Type: typ, Payload: data}
	l.broker.Publish(ev)
	return ev, nil
}

// Replay 返回 id > afterID 的持久化事件（按 id 升序）。
func (l *Logger) Replay(ctx context.Context, afterID int64) ([]Event, error) {
	rows, err := l.store.Query(ctx, `SELECT id, at, type, payload FROM events WHERE id > ? ORDER BY id ASC`, afterID)
	if err != nil {
		return nil, fmt.Errorf("查询事件失败: %w", err)
	}
	defer rows.Close()

	events := make([]Event, 0, 32)
	for rows.Next() {
		var ev Event
		var payload []byte
		if err := rows.Scan(&ev.ID, &ev.At, &ev.Type, &payload); err != nil {
			return nil, fmt.Errorf("扫描事件失败: %w", err)
		}
		ev.Payload = append(json.RawMessage(nil), payload...)
		events = append(events, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历事件失败: %w", err)
	}
	return events, nil
}

// Subscribe 订阅实时事件；返回的 cancel 必须调用（或由 ctx 结束触发）。
func (l *Logger) Subscribe(ctx context.Context) (<-chan Event, func()) {
	return l.broker.Subscribe(ctx)
}

// LatestID 返回当前最大事件 id（无事件为 0）。
func (l *Logger) LatestID(ctx context.Context) (int64, error) {
	var id int64
	if err := l.store.QueryRow(ctx, `SELECT COALESCE(MAX(id), 0) FROM events`).Scan(&id); err != nil {
		return 0, fmt.Errorf("读取最新事件 id 失败: %w", err)
	}
	return id, nil
}

// Close 关闭广播（WebSocket 连接会收到 channel 关闭）。
func (l *Logger) Close() { l.broker.Close() }

// Broker 是进程内事件广播；慢客户端会被断开，由客户端带 since 重连补齐。
type Broker struct {
	mu     sync.Mutex
	closed bool
	next   int
	subs   map[int]chan Event
}

// NewBroker 创建广播器。
func NewBroker() *Broker {
	return &Broker{subs: make(map[int]chan Event)}
}

// Subscribe 注册订阅者。
func (b *Broker) Subscribe(ctx context.Context) (<-chan Event, func()) {
	b.mu.Lock()
	if b.closed {
		ch := make(chan Event)
		close(ch)
		b.mu.Unlock()
		return ch, func() {}
	}
	id := b.next
	b.next++
	ch := make(chan Event, 256)
	b.subs[id] = ch
	b.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			if sub, ok := b.subs[id]; ok {
				delete(b.subs, id)
				close(sub)
			}
		})
	}
	if ctx != nil {
		go func() {
			<-ctx.Done()
			cancel()
		}()
	}
	return ch, cancel
}

// Publish 广播事件；channel 满的订阅者会被断开（客户端重连续接）。
func (b *Broker) Publish(ev Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	for id, ch := range b.subs {
		select {
		case ch <- ev:
		default:
			delete(b.subs, id)
			close(ch)
		}
	}
}

// Close 关闭全部订阅。
func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.closed = true
	for id, ch := range b.subs {
		delete(b.subs, id)
		close(ch)
	}
}
