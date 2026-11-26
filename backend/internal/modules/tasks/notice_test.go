package tasks

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	coretask "simo/internal/core/task"
	"simo/internal/platform/sqlite"
)

// 任务模块会向 chat 域的 messages 表写开始/结束消息；只跑任务模块的单测需要这张表。
func createMessagesTable(t *testing.T, db *sqlite.DB) {
	t.Helper()
	ctx := context.Background()
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL,
		role TEXT NOT NULL,
		text TEXT NOT NULL,
		at INTEGER NOT NULL,
		status TEXT NOT NULL,
		task_id TEXT NOT NULL DEFAULT '',
		workflow_id TEXT NOT NULL DEFAULT '',
		tool TEXT NOT NULL DEFAULT '',
		approval_id TEXT NOT NULL DEFAULT '',
		category TEXT NOT NULL DEFAULT '',
		reply_to_id TEXT NOT NULL DEFAULT '',
		finished_at INTEGER NOT NULL DEFAULT 0,
		internal INTEGER NOT NULL DEFAULT 0,
		batch_id TEXT NOT NULL DEFAULT ''
	)`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

// PRD-TASK-003：开始/结束消息写在任务模块内部，绕开 chat 模块也能读出同样字段。

func createNoticeTask(t *testing.T, mod *Module, ctx context.Context, title string) coretask.Task {
	t.Helper()
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Mode: "plan", Goal: "写季度总结",
		Tasks: []BatchTaskInput{{Key: "a", Title: title, Steps: []string{"读表", "汇总"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	task, err := mod.getTask(ctx, result.Tasks[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func countProgressMessages(t *testing.T, mod *Module, ctx context.Context, taskID string) int {
	t.Helper()
	var count int
	if err := mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE task_id=? AND category='progress'`, taskID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestTaskStartNoticeOnce(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	task := createNoticeTask(t, mod, ctx, "写季度总结")
	stale := task // 模拟另一个尚未推进的调用方拿着旧状态
	if !mod.beginTaskNotice(ctx, &task, 2) {
		t.Fatal("queued/pending 任务应能写开始消息")
	}
	if count := countProgressMessages(t, mod, ctx, task.ID); count != 1 {
		t.Fatalf("开始消息应恰好 1 条，got %d", count)
	}
	var messageID, role, text, batchID, workflowID string
	if err := mod.store.QueryRow(ctx, `SELECT id, role, text, batch_id, workflow_id FROM messages
		WHERE task_id=? AND category='progress'`, task.ID).Scan(&messageID, &role, &text, &batchID, &workflowID); err != nil {
		t.Fatal(err)
	}
	if role != "agent" || !strings.Contains(text, "任务开始：写季度总结") {
		t.Fatalf("开始消息字段不对: role=%s text=%s", role, text)
	}
	if batchID != "" || workflowID != "" {
		t.Fatalf("单任务开始消息不应带 batchId/workflowId: batch=%q workflow=%q", batchID, workflowID)
	}
	got, err := mod.getTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != coretask.StatusRunning {
		t.Fatalf("写开始消息应与 queued→running 同事务，got %s", got.Status)
	}
	if got.ReportMessageID != messageID {
		t.Fatalf("reportMessageId 应指向开始消息: want %s got %s", messageID, got.ReportMessageID)
	}
	if got.EndMessageID != "" {
		t.Fatalf("运行中不应有 endMessageId，got %s", got.EndMessageID)
	}
	// 旧状态副本再调用一次：CAS 不命中，不产生第二条。
	if mod.beginTaskNotice(ctx, &stale, 2) {
		t.Fatal("状态已推进的旧副本不应再写开始消息")
	}
	if count := countProgressMessages(t, mod, ctx, task.ID); count != 1 {
		t.Fatalf("重复调用后开始消息仍应为 1 条，got %d", count)
	}
}

func TestTaskEndNoticeWithArtifact(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	task := createNoticeTask(t, mod, ctx, "写季度总结")
	if !mod.beginTaskNotice(ctx, &task, 5) {
		t.Fatal("开始消息写入失败")
	}
	startID := task.ReportMessageID
	mod.writeArtifact(task)

	task.Status = coretask.StatusDone
	task.Progress = 100
	task.Outcome = "success"
	task.Summary = "季度总结已生成"
	task.FinishedAt = time.Now().UnixMilli()
	if err := mod.saveTask(ctx, task); err != nil {
		t.Fatal(err)
	}
	mod.finalizeTask(ctx, &task)

	if task.EndMessageID == "" {
		t.Fatal("终态后应写 endMessageId")
	}
	var messageID, text string
	if err := mod.store.QueryRow(ctx, `SELECT id, text FROM messages WHERE id=? AND category='progress'`, task.EndMessageID).
		Scan(&messageID, &text); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"任务结束：写季度总结", "状态：已完成", "结论：季度总结已生成", "report-attempt-1.md"} {
		if !strings.Contains(text, want) {
			t.Fatalf("结束消息缺少 %q:\n%s", want, text)
		}
	}
	got, err := mod.getTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.EndMessageID != messageID {
		t.Fatalf("task.endMessageId 应指向结束消息: want %s got %s", messageID, got.EndMessageID)
	}
	if got.ReportMessageID != startID {
		t.Fatalf("reportMessageId 应仍指向开始消息: want %s got %s", startID, got.ReportMessageID)
	}
	// 再次收敛不产生第二条。
	again := got
	mod.finalizeTask(ctx, &again)
	if count := countProgressMessages(t, mod, ctx, task.ID); count != 2 {
		t.Fatalf("一条开始加一条结束应为 2 条，got %d", count)
	}
}

func TestTaskEndNoticeWithoutArtifact(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	task := createNoticeTask(t, mod, ctx, "没有产物的任务")
	if !mod.beginTaskNotice(ctx, &task, 5) {
		t.Fatal("开始消息写入失败")
	}
	task.Status = coretask.StatusFailed
	task.Outcome = "failed"
	task.Summary = "任务执行失败：上游超时"
	task.FinishedAt = time.Now().UnixMilli()
	if err := mod.saveTask(ctx, task); err != nil {
		t.Fatal(err)
	}
	mod.finalizeTask(ctx, &task)
	var text string
	if err := mod.store.QueryRow(ctx, `SELECT text FROM messages WHERE id=?`, task.EndMessageID).Scan(&text); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, "状态：失败") || !strings.Contains(text, "结论：任务执行失败：上游超时") {
		t.Fatalf("失败结束消息文案不对:\n%s", text)
	}
	if !strings.Contains(text, "产物：无") {
		t.Fatalf("无产物时结束消息应写明“产物：无”:\n%s", text)
	}
}

func TestTaskRestartKeepsStartOnlyAndRetryAddsSecondStart(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	task := createNoticeTask(t, mod, ctx, "重启恢复任务")
	if !mod.beginTaskNotice(ctx, &task, 2) {
		t.Fatal("开始消息写入失败")
	}
	startID := task.ReportMessageID

	mod.recoverInterrupted()
	got, err := mod.getTask(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != coretask.StatusInterrupted {
		t.Fatalf("running 任务重启后应中断，got %s", got.Status)
	}
	if count := countProgressMessages(t, mod, ctx, task.ID); count != 1 {
		t.Fatalf("重启后开始消息应仍为 1 条，got %d", count)
	}
	if got.EndMessageID != "" {
		t.Fatalf("重启不应写结束消息，got endMessageId=%s", got.EndMessageID)
	}
	if got.ReportMessageID != startID {
		t.Fatalf("重启后 reportMessageId 不应变化: want %s got %s", startID, got.ReportMessageID)
	}

	// 重试后新 attempt 再写一条开始消息；mock 执行器仍停在延迟里，不会写结束消息。
	mod.StartDelay = 0
	retried, attempt, _, err := mod.RetryConv(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if attempt != 2 {
		t.Fatalf("重试后 attempt 应为 2，got %d", attempt)
	}
	if retried.EndMessageID != "" {
		t.Fatalf("重试不应保留 endMessageId，got %s", retried.EndMessageID)
	}
	// 等到新 attempt 的开始消息回写到 tasks.report_message_id；这条写入与消息插入同事务。
	deadline := time.Now().Add(5 * time.Second)
	var after coretask.Task
	for {
		current, err := mod.getTask(ctx, task.ID)
		if err != nil {
			t.Fatal(err)
		}
		after = current
		if current.ReportMessageID != "" && current.ReportMessageID != startID {
			break
		}
		if time.Now().After(deadline) {
			var ids string
			_ = mod.store.QueryRow(ctx, `SELECT group_concat(id, '|') FROM messages WHERE task_id=? AND category='progress'`, task.ID).Scan(&ids)
			t.Fatalf("重试后应写入新的开始消息 id，got %s (start=%s, messages=%s)", current.ReportMessageID, startID, ids)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if count := countProgressMessages(t, mod, ctx, task.ID); count != 2 {
		rows, _ := mod.store.Query(ctx, `SELECT id, text FROM messages WHERE task_id=? AND category='progress' ORDER BY at, id`, task.ID)
		var dump []string
		if rows != nil {
			for rows.Next() {
				var id, text string
				_ = rows.Scan(&id, &text)
				dump = append(dump, id+" => "+text)
			}
			_ = rows.Close()
		}
		t.Fatalf("重试后开始消息应为 2 条，got %d: %s", count, strings.Join(dump, " || "))
	}
	if after.EndMessageID != "" {
		t.Fatalf("重试后运行中不应有 endMessageId，got %s", after.EndMessageID)
	}
	if after.Status != coretask.StatusRunning {
		t.Fatalf("新 attempt 应进入 running，got %s", after.Status)
	}
}

func TestTaskEndNoticeSameFieldsForWorkflowAndSingle(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	workflowTask := createNoticeTask(t, mod, ctx, "工作流任务")
	if !mod.beginTaskNotice(ctx, &workflowTask, 5) {
		t.Fatal("工作流任务开始消息写入失败")
	}
	workflowTask.WorkflowID = "wf-notice-1"
	workflowTask.Status = coretask.StatusDone
	workflowTask.Outcome = "success"
	workflowTask.Summary = "工作流任务完成"
	workflowTask.FinishedAt = time.Now().UnixMilli()
	if err := mod.saveTask(ctx, workflowTask); err != nil {
		t.Fatal(err)
	}
	mod.finalizeTask(ctx, &workflowTask)

	singleTask := createNoticeTask(t, mod, ctx, "单任务")
	if !mod.beginTaskNotice(ctx, &singleTask, 5) {
		t.Fatal("单任务开始消息写入失败")
	}
	singleTask.Status = coretask.StatusDone
	singleTask.Outcome = "success"
	singleTask.Summary = "单任务完成"
	singleTask.FinishedAt = time.Now().UnixMilli()
	if err := mod.saveTask(ctx, singleTask); err != nil {
		t.Fatal(err)
	}
	mod.finalizeTask(ctx, &singleTask)

	read := func(messageID string) (role, category, taskID, workflowID, text string) {
		t.Helper()
		if err := mod.store.QueryRow(ctx, `SELECT role, category, task_id, workflow_id, text FROM messages WHERE id=?`, messageID).
			Scan(&role, &category, &taskID, &workflowID, &text); err != nil {
			t.Fatal(err)
		}
		return
	}
	wRole, wCategory, wTaskID, wWorkflowID, wText := read(workflowTask.EndMessageID)
	sRole, sCategory, sTaskID, sWorkflowID, sText := read(singleTask.EndMessageID)
	if wRole != sRole || wCategory != sCategory || wTaskID == "" || sTaskID == "" {
		t.Fatalf("两条结束消息共有字段不一致: workflow=(%s,%s,%s) single=(%s,%s,%s)", wRole, wCategory, wTaskID, sRole, sCategory, sTaskID)
	}
	if wWorkflowID != "wf-notice-1" || sWorkflowID != "" {
		t.Fatalf("只允许 workflowId 不同: workflow=%q single=%q", wWorkflowID, sWorkflowID)
	}
	if !strings.Contains(wText, "工作流任务完成") || !strings.Contains(sText, "单任务完成") {
		t.Fatal("结束消息应各自带结论")
	}
	if !strings.Contains(wText, "产物：") || !strings.Contains(sText, "产物：") {
		t.Fatal("结束消息都应交代产物")
	}
}
