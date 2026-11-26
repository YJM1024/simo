package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"simo/internal/platform/sqlite"
)

// 任务卡片消息的批次数量来自 task_batches.task_count：列表 DTO 必须带 batchId 与 taskCount，
// 否则前端 library.tsx 的 `batchId && taskCount > 1` 判定永远不成立（AC-CONV-009-02、§17.5）。

func createTestTaskBatches(t *testing.T, db *sqlite.DB, ctx context.Context) {
	t.Helper()
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS task_batches (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			client_mutation_id TEXT NOT NULL DEFAULT '',
			task_count INTEGER NOT NULL,
			message_id TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL DEFAULT 0
		)`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func insertTestBatch(t *testing.T, db *sqlite.DB, ctx context.Context, id, sessionID string, taskCount int) {
	t.Helper()
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO task_batches(id, session_id, task_count, created_at)
			VALUES (?, ?, ?, 1)`, id, sessionID, taskCount)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func insertTestCardMessage(t *testing.T, db *sqlite.DB, ctx context.Context, id, sessionID, taskID, batchID string, at int64) {
	t.Helper()
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO messages(id, session_id, role, text, at, status, task_id, category, batch_id)
			VALUES (?, ?, 'agent', ?, ?, 'done', ?, 'task', ?)`,
			id, sessionID, "已创建 12 个任务", at, taskID, batchID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

// 三个列表入口（单会话、分页、多会话聚合）都要补齐 batchId 与 taskCount。
func TestMessageListFillsBatchTaskCount(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	createTestTaskBatches(t, db, ctx)
	insertTestSession(t, db, ctx, "main")
	insertTestBatch(t, db, ctx, "batch-12", "main", 12)
	insertTestBatch(t, db, ctx, "batch-1", "main", 1)
	insertTestCardMessage(t, db, ctx, "m-batch12", "main", "task-1", "batch-12", 10)
	insertTestCardMessage(t, db, ctx, "m-batch1", "main", "task-1", "batch-1", 11)
	insertTestMessage(t, db, ctx, "m-plain", "main", "assistant", 12, 0)

	check := func(name string, list []Message) {
		t.Helper()
		byID := make(map[string]Message, len(list))
		for _, msg := range list {
			byID[msg.ID] = msg
		}
		card, ok := byID["m-batch12"]
		if !ok {
			t.Fatalf("%s: 缺少批量消息 m-batch12，got %d 条", name, len(list))
		}
		if card.BatchID != "batch-12" || card.TaskCount != 12 {
			t.Fatalf("%s: 批量 12 条应带 batchId=batch-12 taskCount=12，got batchId=%q taskCount=%d",
				name, card.BatchID, card.TaskCount)
		}
		if got := byID["m-batch1"]; got.BatchID != "batch-1" || got.TaskCount != 1 {
			t.Fatalf("%s: 单任务批次应带 batchId=batch-1 taskCount=1，got batchId=%q taskCount=%d",
				name, got.BatchID, got.TaskCount)
		}
		plain := byID["m-plain"]
		if plain.BatchID != "" || plain.TaskCount != 0 {
			t.Fatalf("%s: 普通消息不应带批次字段，got batchId=%q taskCount=%d", name, plain.BatchID, plain.TaskCount)
		}
	}

	single, err := mod.listMessages(ctx, "main")
	if err != nil {
		t.Fatal(err)
	}
	check("listMessages", single)

	page, err := mod.listMessagesPage(ctx, []string{"main"}, "", 10)
	if err != nil {
		t.Fatal(err)
	}
	check("listMessagesPage", page)

	merged, err := mod.listMessagesForSessions(ctx, []string{"main"})
	if err != nil {
		t.Fatal(err)
	}
	check("listMessagesForSessions", merged)
}

// 契约字段名按前端 camelCase：batchId 与 taskCount；普通消息不输出这两个键。
func TestMessageJSONCarriesBatchTaskCount(t *testing.T) {
	card := Message{ID: "m1", SessionID: "main", Role: RoleAgent, Text: "已创建 12 个任务",
		Category: "task", TaskID: "task-1", BatchID: "batch-12", TaskCount: 12}
	raw, err := json.Marshal(card)
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	for _, want := range []string{`"batchId":"batch-12"`, `"taskCount":12`} {
		if !strings.Contains(body, want) {
			t.Fatalf("批量卡片消息 JSON 应含 %s，got %s", want, body)
		}
	}

	plain := Message{ID: "m2", SessionID: "main", Role: "assistant", Text: "普通回复"}
	rawPlain, err := json.Marshal(plain)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(rawPlain); strings.Contains(got, "taskCount") || strings.Contains(got, "batchId") {
		t.Fatalf("普通消息不应带批次字段，got %s", got)
	}
}

// 没有批次消息时不应去查 task_batches：chat 单独部署/测试的库可以没有这张表。
func TestMessageListWithoutBatchSkipsTaskBatchQuery(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	insertTestSession(t, db, ctx, "main")
	insertTestMessage(t, db, ctx, "m1", "main", "assistant", 1, 0)
	list, err := mod.listMessagesForSessions(ctx, []string{"main"})
	if err != nil {
		t.Fatalf("无批次消息时不应因缺少 task_batches 表失败: %v", err)
	}
	if len(list) != 1 || list[0].TaskCount != 0 {
		t.Fatalf("普通消息列表不应被批次逻辑改动，got %+v", list)
	}
}

// HTTP 层：GET /api/messages 的 JSON 必须带 batchId 与 taskCount（前端读 message.taskCount）。
func TestHandleMessagesCarriesTaskCountJSON(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	createTestTaskBatches(t, db, ctx)
	insertTestSession(t, db, ctx, "main")
	insertTestBatch(t, db, ctx, "batch-12", "main", 12)
	insertTestCardMessage(t, db, ctx, "m-batch12", "main", "task-1", "batch-12", 10)

	mux := http.NewServeMux()
	mod.Register(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/messages?sessionId=main&limit=10", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/messages 期望 200，got %d: %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Messages []Message `json:"messages"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("响应不是合法 JSON: %v (%s)", err, rec.Body.String())
	}
	if len(payload.Messages) != 1 {
		t.Fatalf("期望 1 条消息，got %d", len(payload.Messages))
	}
	msg := payload.Messages[0]
	if msg.BatchID != "batch-12" || msg.TaskCount != 12 {
		t.Fatalf("消息体应带 batchId=batch-12 taskCount=12，got batchId=%q taskCount=%d",
			msg.BatchID, msg.TaskCount)
	}
	if !strings.Contains(rec.Body.String(), `"taskCount":12`) {
		t.Fatalf("消息 JSON 缺 taskCount 字段: %s", rec.Body.String())
	}
}
