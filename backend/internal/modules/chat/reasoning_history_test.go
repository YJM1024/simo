package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/core/store"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
)

// strictReasoningStep 是假上游一次回复的脚本。
type strictReasoningStep struct {
	reasoning string
	content   string
}

// strictReasoningFake 复刻真实上游的严格校验：请求里任何 assistant 消息缺少
// reasoning_content、或字段值为空白，都按真机报文返回 400。真实上游对“字段被
// omitempty 省略”的拒绝已由 2026-11-26 的真机证据确认（request_id
// df65e642-b265-437a-8f3c-1c9b9b59d5db）。
type strictReasoningFake struct {
	t      *testing.T
	mu     sync.Mutex
	steps  []strictReasoningStep
	reqs   []capturedChatRequest
	next   int
	bad    []string
	server *httptest.Server
}

func newStrictReasoningFake(t *testing.T, steps ...strictReasoningStep) *strictReasoningFake {
	t.Helper()
	f := &strictReasoningFake{t: t, steps: steps}
	f.server = httptest.NewServer(http.HandlerFunc(f.handle))
	t.Cleanup(f.server.Close)
	return f
}

func (f *strictReasoningFake) handle(w http.ResponseWriter, r *http.Request) {
	if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
		http.NotFound(w, r)
		return
	}
	var got capturedChatRequest
	if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
		http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	f.reqs = append(f.reqs, got)
	step := f.next
	f.next++
	f.mu.Unlock()

	for _, msg := range got.Messages {
		if msg.Role != "assistant" {
			continue
		}
		if msg.ReasoningContent == nil || strings.TrimSpace(*msg.ReasoningContent) == "" {
			f.mu.Lock()
			f.bad = append(f.bad, "assistant 消息缺少非空 reasoning_content")
			f.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, `{"error":{"message":"The reasoning_content in the thinking mode must be passed back to the API.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}`)
			return
		}
	}

	reply := strictReasoningStep{content: "@@CATEGORY: consultation\n\n收到。"}
	if len(f.steps) > 0 {
		if step < len(f.steps) {
			reply = f.steps[step]
		} else {
			reply = f.steps[len(f.steps)-1]
		}
	}
	writeStrictSSE(f.t, w, reply.reasoning, reply.content)
}

func (f *strictReasoningFake) request(i int) capturedChatRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	if i >= len(f.reqs) {
		f.t.Fatalf("期望至少 %d 次上游请求，实际 %d 次", i+1, len(f.reqs))
	}
	return f.reqs[i]
}

func (f *strictReasoningFake) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.reqs)
}

func (f *strictReasoningFake) violations() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.bad...)
}

func writeStrictSSE(t *testing.T, w http.ResponseWriter, reasoning, content string) {
	t.Helper()
	writeSSEHeaders(t, w)
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "response writer 不支持 Flush", http.StatusInternalServerError)
		return
	}
	if reasoning != "" {
		frame, _ := json.Marshal(map[string]any{
			"model":   "fake-upstream",
			"choices": []any{map[string]any{"delta": map[string]any{"reasoning_content": reasoning}}},
		})
		fmt.Fprintf(w, "data: %s\n\n", frame)
		flusher.Flush()
	}
	frame, _ := json.Marshal(map[string]any{
		"model":   "fake-upstream",
		"choices": []any{map[string]any{"delta": map[string]any{"content": content}}},
	})
	fmt.Fprintf(w, "data: %s\n\n", frame)
	fmt.Fprint(w, "data: [DONE]\n\n")
	flusher.Flush()
}

func newStrictProvider(t *testing.T, f *strictReasoningFake) llm.Provider {
	t.Helper()
	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: f.server.URL,
		APIKey:  "test-key-not-a-real-token",
		Model:   "fake-model",
	})
	if err != nil {
		t.Fatalf("构造 provider 失败: %v", err)
	}
	return provider
}

// openReasoningTestModule 在指定库路径上建/复用 chat 库；用同一路径重开即模拟
// 进程重启（迁移已记录版本，重开不会重复执行）。
func openReasoningTestModule(t *testing.T, dbPath string, provider llm.Provider) (*Module, *sqlite.DB, *eventlog.Logger) {
	t.Helper()
	db, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		_ = db.Close()
		t.Fatalf("建 events 表失败: %v", err)
	}
	if err := db.Migrate(ctx, "chat", migrations()); err != nil {
		_ = db.Close()
		t.Fatalf("建 chat 表失败: %v", err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			parent_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL DEFAULT 0,
			archived INTEGER NOT NULL DEFAULT 0,
			pinned INTEGER NOT NULL DEFAULT 0,
			owner_agent_id TEXT NOT NULL DEFAULT ''
		)`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO sessions(id, parent_id, title, created_at)
			VALUES (?, ?, ?, ?)`, "sess-replay", "main", "会话-sess-replay", 1)
		return err
	}); err != nil {
		_ = db.Close()
		t.Fatalf("建 sessions 表失败: %v", err)
	}
	events := eventlog.New(store.New(db))
	mod := New(store.New(db), events, provider, nil, nil, nil, platformlog.Discard(), Options{})
	return mod, db, events
}

// assistantMessageWith 在请求里找正文包含 want 的 assistant 消息。
func assistantMessageWith(t *testing.T, req capturedChatRequest, want string) capturedMessage {
	t.Helper()
	for _, msg := range req.Messages {
		if msg.Role == "assistant" && strings.Contains(msg.Content, want) {
			return msg
		}
	}
	t.Fatalf("请求里没有正文包含 %q 的 assistant 消息: %+v", want, req.Messages)
	return capturedMessage{}
}

// TestReasoningContentPersistedAndReplayedNextTurn 覆盖“多轮会话”：
// 第一回合的思考原文要落库，第二回合重建历史时必须把它原样带回请求体。
func TestReasoningContentPersistedAndReplayedNextTurn(t *testing.T) {
	fake := newStrictReasoningFake(t,
		strictReasoningStep{reasoning: "先读取规格要求", content: "@@CATEGORY: consultation\n\n收到，先看规格。"},
		strictReasoningStep{reasoning: "延续上文语境", content: "@@CATEGORY: consultation\n\n好的，接着看。"},
	)
	mod, db, events := openReasoningTestModule(t, filepath.Join(t.TempDir(), "simo.db"), newStrictProvider(t, fake))
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	if _, err := mod.startTurn(ctx, "sess-replay", "帮我看看规格", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动第一回合失败: %v", err)
	}
	replyID := waitForReplyCreated(t, events, "sess-replay", 3*time.Second)
	doneID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyDone, 5*time.Second)
	waitForIdleAfter(t, events, doneID, 3*time.Second)

	var reasoning, text, status string
	if err := db.QueryRow(ctx, `SELECT reasoning_content, text, status FROM messages WHERE id = ?`, replyID).
		Scan(&reasoning, &text, &status); err != nil {
		t.Fatalf("读取第一回合回复失败: %v", err)
	}
	if reasoning != "先读取规格要求" {
		t.Fatalf("第一回合的思考原文没有落库，期望 %q，实际 %q", "先读取规格要求", reasoning)
	}
	if status != StatusDone || strings.TrimSpace(text) == "" {
		t.Fatalf("第一回合回复未正常落库: status=%q text=%q", status, text)
	}

	if _, err := mod.startTurn(ctx, "sess-replay", "继续", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动第二回合失败: %v", err)
	}
	secondReplyID := waitForAgentReplyDone(t, db, ctx, "sess-replay", replyID, 5*time.Second)

	if bad := fake.violations(); len(bad) > 0 {
		t.Fatalf("严格上游拒绝了请求: %v", bad)
	}
	if fake.count() < 2 {
		t.Fatalf("期望至少两次上游请求，实际 %d 次", fake.count())
	}
	replayed := assistantMessageWith(t, fake.request(1), "收到，先看规格。")
	if replayed.ReasoningContent == nil {
		t.Fatal("第二回合请求里的历史 assistant 消息缺少 reasoning_content")
	}
	if *replayed.ReasoningContent != "先读取规格要求" {
		t.Fatalf("历史重放的思考原文期望 %q，实际 %q", "先读取规格要求", *replayed.ReasoningContent)
	}
	var secondText, secondStatus string
	if err := db.QueryRow(ctx, `SELECT text, status FROM messages WHERE id = ?`, secondReplyID).
		Scan(&secondText, &secondStatus); err != nil {
		t.Fatalf("读取第二回合回复失败: %v", err)
	}
	if secondStatus != StatusDone || strings.TrimSpace(secondText) == "" {
		t.Fatalf("第二回合回复未正常落库: status=%q text=%q", secondStatus, secondText)
	}
}

// TestReasoningContentReplayedAfterRestart 覆盖“重启后继续同一会话”：
// 关库重开后，历史里的 assistant 思考原文仍要能回传，上游不返回 400。
func TestReasoningContentReplayedAfterRestart(t *testing.T) {
	fake := newStrictReasoningFake(t,
		strictReasoningStep{reasoning: "重启前想清楚的事", content: "@@CATEGORY: consultation\n\n重启前回复。"},
		strictReasoningStep{reasoning: "重启后继续", content: "@@CATEGORY: consultation\n\n重启后回复。"},
	)
	dbPath := filepath.Join(t.TempDir(), "simo.db")
	provider := newStrictProvider(t, fake)
	ctx := context.Background()

	mod, db, events := openReasoningTestModule(t, dbPath, provider)
	if _, err := mod.startTurn(ctx, "sess-replay", "重启前的问题", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动第一回合失败: %v", err)
	}
	firstReplyID := waitForReplyCreated(t, events, "sess-replay", 3*time.Second)
	firstDone := waitForReplyEvent(t, events, firstReplyID, eventlog.TypeReplyDone, 5*time.Second)
	waitForIdleAfter(t, events, firstDone, 3*time.Second)
	var firstReasoning string
	if err := db.QueryRow(ctx, `SELECT reasoning_content FROM messages WHERE id = ?`, firstReplyID).Scan(&firstReasoning); err != nil {
		t.Fatalf("读取第一回合思考原文失败: %v", err)
	}
	if firstReasoning != "重启前想清楚的事" {
		t.Fatalf("第一回合思考原文期望 %q，实际 %q", "重启前想清楚的事", firstReasoning)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("关闭测试库失败: %v", err)
	}

	mod2, db2, _ := openReasoningTestModule(t, dbPath, provider)
	t.Cleanup(func() { _ = db2.Close() })
	if _, err := mod2.startTurn(ctx, "sess-replay", "重启后的问题", ClassRefine, nil, ""); err != nil {
		t.Fatalf("重启后启动回合失败: %v", err)
	}
	secondReplyID := waitForAgentReplyDone(t, db2, ctx, "sess-replay", firstReplyID, 5*time.Second)
	var secondText string
	if err := db2.QueryRow(ctx, `SELECT text FROM messages WHERE id = ?`, secondReplyID).Scan(&secondText); err != nil {
		t.Fatalf("读取重启后回复失败: %v", err)
	}
	if strings.TrimSpace(secondText) == "" {
		t.Fatal("重启后的回复正文为空")
	}
	if bad := fake.violations(); len(bad) > 0 {
		t.Fatalf("重启后严格上游拒绝了请求: %v", bad)
	}
	replayed := assistantMessageWith(t, fake.request(1), "重启前回复。")
	if replayed.ReasoningContent == nil {
		t.Fatal("重启后请求里的历史 assistant 消息缺少 reasoning_content")
	}
	if *replayed.ReasoningContent != "重启前想清楚的事" {
		t.Fatalf("重启后重放的思考原文期望 %q，实际 %q", "重启前想清楚的事", *replayed.ReasoningContent)
	}
}

// TestSyntheticTaskCardAssistantGetsReasoningField 覆盖真机 400 的原始形态：
// 服务端合成的任务卡（role=agent、category=task）没有思考原文，被当作 assistant
// 历史重放时必须仍带非空 reasoning_content，否则上游拒绝整轮请求。
func TestSyntheticTaskCardAssistantGetsReasoningField(t *testing.T) {
	fake := newStrictReasoningFake(t, strictReasoningStep{reasoning: "看看任务卡", content: "@@CATEGORY: consultation\n\n任务卡已收到。"})
	mod, db, events := openReasoningTestModule(t, filepath.Join(t.TempDir(), "simo.db"), newStrictProvider(t, fake))
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	if err := mod.createMessage(ctx, Message{
		ID: "msg-task-card-1", SessionID: "sess-replay", Role: RoleAgent,
		Text: "帮我创建两个计划任务：读取规格、写摘要", At: time.Now().UnixMilli(),
		Status: StatusDone, Category: CategoryTask,
	}); err != nil {
		t.Fatalf("写入合成任务卡失败: %v", err)
	}

	if _, err := mod.startTurn(ctx, "sess-replay", "接着说", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动回合失败: %v", err)
	}
	replyID := waitForReplyCreated(t, events, "sess-replay", 3*time.Second)
	doneID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyDone, 5*time.Second)
	waitForIdleAfter(t, events, doneID, 3*time.Second)

	if bad := fake.violations(); len(bad) > 0 {
		t.Fatalf("合成任务卡导致上游拒绝了请求: %v", bad)
	}
	if fake.count() < 1 {
		t.Fatal("假上游没有收到请求")
	}
	card := assistantMessageWith(t, fake.request(0), "帮我创建两个计划任务")
	if card.ReasoningContent == nil {
		t.Fatal("任务卡 assistant 消息缺少 reasoning_content 字段")
	}
	if strings.TrimSpace(*card.ReasoningContent) == "" {
		t.Fatal("任务卡 assistant 消息的 reasoning_content 为空")
	}
	if *card.ReasoningContent != llm.ReasoningPlaceholder {
		t.Fatalf("任务卡的 reasoning_content 期望占位 %q，实际 %q", llm.ReasoningPlaceholder, *card.ReasoningContent)
	}
	var text, status string
	if err := db.QueryRow(ctx, `SELECT text, status FROM messages WHERE id = ?`, replyID).Scan(&text, &status); err != nil {
		t.Fatalf("读取回复失败: %v", err)
	}
	if status != StatusDone || strings.TrimSpace(text) == "" {
		t.Fatalf("回合未正常结束: status=%q text=%q", status, text)
	}
}

// waitForAgentReplyDone 轮询库里除 excludeID 外新出现的已完成 agent 回复。
func waitForAgentReplyDone(t *testing.T, db *sqlite.DB, ctx context.Context, sessionID, excludeID string, timeout time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		var id string
		err := db.QueryRow(ctx, `SELECT id FROM messages
			WHERE session_id = ? AND role = ? AND status = ? AND id <> ?
			ORDER BY rowid DESC LIMIT 1`, sessionID, RoleAgent, StatusDone, excludeID).Scan(&id)
		if err == nil && id != "" {
			return id
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待重启后的 agent 回复超时")
	return ""
}
