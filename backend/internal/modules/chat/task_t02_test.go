package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
	"simo/internal/modules/tasks"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
	"simo/internal/platform/workspace"
)

func TestTaskPermissionDeniedFromToolResult(t *testing.T) {
	call := llm.ToolCall{Function: llm.FunctionCall{
		Name: "write_file", Arguments: `{"file_path":"../etc/passwd"}`,
	}}
	cases := []struct {
		name   string
		result string
		ok     bool
		tool   string
		path   string
		reason string
	}{
		{name: "路径越界", result: "Error: 路径越出工作区 (code=path_denied)", ok: true,
			tool: "write", path: "../etc/passwd", reason: "路径越出工作区"},
		{name: "沙盒拒绝", result: "Error: denied (code=sandbox_denied)", ok: true,
			tool: "write", path: "../etc/passwd", reason: "沙盒拒绝访问"},
		{name: "工具白名单", result: "Error: 未知工具 (code=denied_tool)", ok: true,
			tool: "write", path: "", reason: "工具不在白名单"},
		{name: "网络未授权", result: "Error: 拒绝内网地址 (code=ssrf_denied)", ok: true,
			tool: "write", path: "", reason: "网络访问未授权"},
		{name: "普通拒绝", result: "Error: never 策略拒绝动作 (code=denied)", ok: true,
			tool: "write", path: "", reason: "未授权操作"},
		{name: "正常结果", result: "ok", ok: false},
		{name: "需审批不算拒绝", result: "PENDING_APPROVAL approvalId=a1", ok: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			denied, ok := permissionDeniedFromToolResult(call, tc.result)
			if ok != tc.ok {
				t.Fatalf("ok 期望 %v，got %v (%+v)", tc.ok, ok, denied)
			}
			if !ok {
				return
			}
			if denied.Tool != tc.tool || denied.Path != tc.path || denied.Reason != tc.reason {
				t.Fatalf("拒绝素材不对: %+v", denied)
			}
		})
	}
}

type fakeBatchTaskService struct {
	legacyCreated bool
	batchSession  string
	batch         coretask.BatchCreateInput
}

func (f *fakeBatchTaskService) Create(context.Context, coretask.NewTask) (coretask.Task, error) {
	f.legacyCreated = true
	return coretask.Task{ID: "legacy"}, nil
}

func (f *fakeBatchTaskService) List(context.Context, string) ([]coretask.Task, error) {
	return nil, nil
}

func (f *fakeBatchTaskService) Get(context.Context, string) (coretask.Task, error) {
	return coretask.Task{}, nil
}

func (f *fakeBatchTaskService) CreateBatch(_ context.Context, sessionID string, input coretask.BatchCreateInput) (coretask.BatchCreateResult, error) {
	f.batchSession = sessionID
	f.batch = input
	return coretask.BatchCreateResult{
		BatchID: "batch-0123456789abcdef",
		Tasks:   []coretask.Task{{ID: "task-1", DisplayStatus: "pending"}},
		Total:   len(input.Tasks),
	}, nil
}

// 没有方案端口时不得回落到建任务：交给普通对话直接回答（DEC-43）。
func TestDelegateWithoutPlanPortCreatesNoTask(t *testing.T) {
	fake := &fakeBatchTaskService{}
	module := &Module{
		taskSvc: fake,
		log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	note, handled := module.delegate(context.Background(), &activeTurn{SessionID: "s1"},
		DecisionEnvelope{Kind: DecisionDelegate, TaskIntent: true, TaskTitle: "整理调研报告"},
		"帮我整理一份调研报告")

	if handled || note != "" {
		t.Fatalf("方案端口缺失时应交给普通对话，got handled=%v note=%q", handled, note)
	}
	if fake.legacyCreated || fake.batchSession != "" {
		t.Fatalf("不得创建任务，legacy=%v batchSession=%q", fake.legacyCreated, fake.batchSession)
	}
}

func TestCategoryTaskNotModelWritable(t *testing.T) {
	category, found, _ := parseCategoryMarker("@@CATEGORY: task\n正文")
	if !found || category == CategoryTask {
		t.Fatalf("模型不得自行声明 task 分类，got %q found=%v", category, found)
	}
	if CategoryTask != "task" {
		t.Fatalf("任务卡片分类常量应为 task，got %q", CategoryTask)
	}
}

// ---- 对话触发方案卡：确认前无副作用、确认后派生、拒绝后仍为 0（DEC-39 / PRD-TASK-004） ----

type fakePlanTaskService struct {
	fakeBatchTaskService
	planCalls   int
	planSession string
	planInput   coretask.PlanRequest
	plan        coretask.PlanDecision
	planErr     error
}

func (f *fakePlanTaskService) PlanTask(_ context.Context, sessionID string, input coretask.PlanRequest) (coretask.PlanDecision, error) {
	f.planCalls++
	f.planSession = sessionID
	f.planInput = input
	return f.plan, f.planErr
}

func TestDelegateComplexIntentPlansBeforeTaskCreation(t *testing.T) {
	fake := &fakePlanTaskService{plan: coretask.PlanDecision{
		Complexity:           coretask.ComplexityC2,
		RequiresConfirmation: true,
		PlanID:               "plan-1",
		PlanMessageID:        "msg-1",
		TaskCount:            1,
	}}
	module := &Module{taskSvc: fake, log: platformlog.Discard()}
	note, handled := module.delegate(context.Background(), &activeTurn{SessionID: "s1"},
		DecisionEnvelope{Kind: DecisionDelegate, TaskIntent: true, TaskTitle: "导出功能"},
		"请把导出功能做完：1. 梳理现有链路 2. 设计接口 3. 实现并补测试")

	if !handled {
		t.Fatal("复杂请求应停在方案卡上，不能让本回合继续调模型")
	}
	if fake.planCalls != 1 || fake.planSession != "s1" {
		t.Fatalf("方案端口调用不对: calls=%d session=%q", fake.planCalls, fake.planSession)
	}
	if len(fake.planInput.Steps) != 3 {
		t.Fatalf("应从原文派生 3 步，got %+v", fake.planInput.Steps)
	}
	if fake.planInput.StepReason.Source != coretask.StepSourceInlineNumbers {
		t.Fatalf("应把行内编号的拆分依据传给方案端口，got %+v", fake.planInput.StepReason)
	}
	if fake.batch.Mode != "" || fake.legacyCreated {
		t.Fatal("等待确认时不得创建任务")
	}
	if !strings.Contains(note, coretask.ComplexityC2) || !strings.Contains(note, "确认前") {
		t.Fatalf("方案说明应指向确认入口，got %q", note)
	}
}

// C0/C1 不建任务、不出方案卡，直接由普通对话回答（DEC-43）。
// 判据只看副作用与答复结果，不要求调用方案端口：步骤派生为空或只有两步的请求本来就该
// 由普通对话回答，是否经过方案端口是实现细节，不是这条判据的验收对象。
func TestDelegateLightweightIntentAnswersDirectly(t *testing.T) {
	cases := []struct {
		level string
		text  string
	}{
		{coretask.ComplexityC0, "整理这份调研报告"},
		{coretask.ComplexityC1, "整理调研报告：1. 收集资料 2. 输出摘要"},
	}
	for _, tc := range cases {
		t.Run(tc.level, func(t *testing.T) {
			env := newChatPlanEnv(t)
			status, _ := env.do("POST", "/api/chat", map[string]any{"sessionId": "s-chat", "text": tc.text})
			if status != http.StatusAccepted {
				t.Fatalf("POST /api/chat 期望 202，got %d", status)
			}

			text, state := env.waitAssistantReply("s-chat")
			if state != StatusDone {
				t.Fatalf("助手消息应以 %s 结束，got %q", StatusDone, state)
			}
			if strings.TrimSpace(text) == "" {
				t.Fatal("助手消息正文不应为空")
			}

			env.assertNoSideEffects("s-chat", tc.level)
			if n := env.count(`SELECT COUNT(*) FROM task_plans WHERE session_id=?`, "s-chat"); n != 0 {
				t.Fatalf("%s 不应写方案表，got %d 行", tc.level, n)
			}
			if n := env.count(`SELECT COUNT(*) FROM messages WHERE session_id=? AND category='confirmation'`, "s-chat"); n != 0 {
				t.Fatalf("%s 不应产生方案卡消息，got %d 条", tc.level, n)
			}
			env.assertNoTaskCreateRequest()
		})
	}
}

func TestDelegatePlanFailureCreatesNothing(t *testing.T) {
	fake := &fakePlanTaskService{planErr: sql.ErrConnDone}
	module := &Module{taskSvc: fake, log: platformlog.Discard()}
	note, handled := module.delegate(context.Background(), &activeTurn{SessionID: "s1"},
		DecisionEnvelope{Kind: DecisionDelegate, TaskIntent: true},
		"请把导出功能做完：1. 梳理现有链路 2. 设计接口 3. 实现并补测试")

	if !handled {
		t.Fatal("方案生成失败也应停在说明上，不能回落到建任务")
	}
	if fake.batch.Mode != "" || fake.legacyCreated {
		t.Fatal("方案失败时不得创建任务")
	}
	if !strings.Contains(note, "没有创建任务") {
		t.Fatalf("失败说明应写清没有创建任务，got %q", note)
	}
}

type planRow struct {
	ID                string
	Complexity        string
	Status            string
	PlanMessageID     string
	TaskCount         int
	ChildSessionCount int
}

type planMessageView struct {
	ID       string             `json:"id"`
	Category string             `json:"category"`
	TaskPlan *coretask.TaskPlan `json:"taskPlan"`
}

type sideEffectCounts struct {
	tasks     int
	children  int
	artifacts int
}

type chatPlanEnv struct {
	t        *testing.T
	db       *sqlite.DB
	ctx      context.Context
	srv      *httptest.Server
	mu       sync.Mutex
	requests []string
}

// newChatPlanEnv 把 chat 与真实 tasks 模块装在同一条 sqlite 上，用 httptest 走生产路由。
func newChatPlanEnv(t *testing.T) *chatPlanEnv {
	t.Helper()
	home := t.TempDir()
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	st := store.New(db)
	events := eventlog.New(st)
	policy, err := workspace.New(home, filepath.Join(home, "workspace"), filepath.Join(home, "artifacts"))
	if err != nil {
		t.Fatal(err)
	}
	tasksMod := tasks.New(st, events, platformlog.Discard(), policy)
	tasksMod.StartDelay = 30 * time.Minute // 确认后也不让执行器推进，产物断言才有意义
	tasksMod.RunDelay = 30 * time.Minute
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "chat", migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "tasks", tasksMod.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY, parent_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
			created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
			pinned INTEGER NOT NULL DEFAULT 0, owner_agent_id TEXT NOT NULL DEFAULT 'simo')`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS specs (
			id TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
			version INTEGER NOT NULL, acceptance_keys TEXT NOT NULL DEFAULT '[]',
			evidence TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO sessions(id, parent_id, title, created_at) VALUES(?, ?, ?, ?)`,
			"s-chat", "root", "对话方案", 1)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := tasksMod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tasksMod.Stop(context.Background()) })

	chatMod := New(st, events, nil, tasksMod, nil, nil, platformlog.Discard(), Options{})
	mux := http.NewServeMux()
	tasksMod.Register(mux)
	chatMod.Register(mux)
	env := &chatPlanEnv{t: t, db: db, ctx: ctx}
	env.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		env.mu.Lock()
		env.requests = append(env.requests, r.Method+" "+r.URL.Path)
		env.mu.Unlock()
		mux.ServeHTTP(w, r)
	}))
	t.Cleanup(env.srv.Close)
	return env
}

func (e *chatPlanEnv) do(method, path string, body any) (int, map[string]any) {
	e.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			e.t.Fatal(err)
		}
		reader = strings.NewReader(string(raw))
	}
	req, err := http.NewRequest(method, e.srv.URL+path, reader)
	if err != nil {
		e.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	return res.StatusCode, payload
}

func (e *chatPlanEnv) count(query string, args ...any) int {
	e.t.Helper()
	var n int
	if err := e.db.QueryRow(e.ctx, query, args...).Scan(&n); err != nil {
		e.t.Fatalf("查询失败: %v\nSQL: %s", err, query)
	}
	return n
}

// sideEffects 统计当前会话的任务、子会话与产物；三项都应由确认前保持 0。
func (e *chatPlanEnv) sideEffects(sessionID string) sideEffectCounts {
	return sideEffectCounts{
		tasks:     e.count(`SELECT COUNT(*) FROM tasks WHERE session_id=?`, sessionID),
		children:  e.count(`SELECT COUNT(*) FROM sessions WHERE parent_id=?`, sessionID),
		artifacts: e.count(`SELECT COUNT(*) FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)`, sessionID),
	}
}

func (e *chatPlanEnv) assertNoSideEffects(sessionID, phase string) {
	e.t.Helper()
	got := e.sideEffects(sessionID)
	if got.tasks != 0 {
		e.t.Fatalf("%s：tasks 表不应有新行，got %d", phase, got.tasks)
	}
	if got.children != 0 {
		e.t.Fatalf("%s：sessions 不应有子会话，got %d", phase, got.children)
	}
	if got.artifacts != 0 {
		e.t.Fatalf("%s：不应产生产物，got %d", phase, got.artifacts)
	}
}

func (e *chatPlanEnv) assertNoTaskCreateRequest() {
	e.t.Helper()
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, req := range e.requests {
		if req == "POST /api/sessions/s-chat/tasks" {
			e.t.Fatalf("确认前不应出现任务创建请求，实际请求: %v", e.requests)
		}
	}
}

func (e *chatPlanEnv) plan(sessionID string) planRow {
	e.t.Helper()
	var row planRow
	err := e.db.QueryRow(e.ctx, `SELECT id, complexity, status, plan_message_id, task_count, child_session_count
		FROM task_plans WHERE session_id=? ORDER BY created_at DESC LIMIT 1`, sessionID).
		Scan(&row.ID, &row.Complexity, &row.Status, &row.PlanMessageID, &row.TaskCount, &row.ChildSessionCount)
	if err != nil {
		e.t.Fatalf("读取方案失败: %v", err)
	}
	return row
}

func (e *chatPlanEnv) waitPlan(sessionID string) planRow {
	e.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var row planRow
		err := e.db.QueryRow(e.ctx, `SELECT id, complexity, status, plan_message_id, task_count, child_session_count
			FROM task_plans WHERE session_id=? ORDER BY created_at DESC LIMIT 1`, sessionID).
			Scan(&row.ID, &row.Complexity, &row.Status, &row.PlanMessageID, &row.TaskCount, &row.ChildSessionCount)
		if err == nil {
			return row
		}
		if err != sql.ErrNoRows {
			e.t.Fatalf("读取方案失败: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	e.t.Fatal("5s 内没有生成任务方案")
	return planRow{}
}

func (e *chatPlanEnv) waitConfirmationMessage(sessionID, planID string) planMessageView {
	e.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		status, payload := e.do("GET", "/api/sessions/"+sessionID+"/messages", nil)
		if status == http.StatusOK {
			list, _ := payload["messages"].([]any)
			for _, item := range list {
				raw, err := json.Marshal(item)
				if err != nil {
					continue
				}
				var view planMessageView
				if json.Unmarshal(raw, &view) != nil {
					continue
				}
				if view.Category == "confirmation" && view.TaskPlan != nil && view.TaskPlan.ID == planID {
					return view
				}
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	e.t.Fatal("5s 内没有读到方案卡消息")
	return planMessageView{}
}

// waitAssistantReply 等普通对话的助手消息落到 status=done，并返回正文与最终状态。
// 方案卡消息（category='confirmation'）不属于普通回答，查询时排除。
func (e *chatPlanEnv) waitAssistantReply(sessionID string) (string, string) {
	e.t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var text, status string
		err := e.db.QueryRow(e.ctx, `SELECT text, status FROM messages
			WHERE session_id=? AND role='agent' AND category<>'confirmation'
			ORDER BY rowid DESC LIMIT 1`, sessionID).Scan(&text, &status)
		if err == nil && status == StatusDone {
			return text, status
		}
		if err != nil && err != sql.ErrNoRows {
			e.t.Fatalf("读取助手消息失败: %v", err)
		}
		time.Sleep(20 * time.Millisecond)
	}
	e.t.Fatal("5s 内没有读到 status=done 的助手消息")
	return "", ""
}

func TestChatComplexRequestC2PlansBeforeConfirm(t *testing.T) {
	env := newChatPlanEnv(t)
	text := "请把导出功能做完：1. 梳理现有导出链路 2. 设计新的导出接口 3. 实现并补单元测试"
	status, _ := env.do("POST", "/api/chat", map[string]any{"sessionId": "s-chat", "text": text})
	if status != http.StatusAccepted {
		t.Fatalf("POST /api/chat 期望 202，got %d", status)
	}
	plan := env.waitPlan("s-chat")
	if plan.Complexity != coretask.ComplexityC2 {
		t.Fatalf("3 步请求应判为 C2，got %q", plan.Complexity)
	}
	if plan.Status != coretask.PlanStatusPending {
		t.Fatalf("确认前方案应为 pending，got %q", plan.Status)
	}
	if plan.TaskCount != 1 || plan.ChildSessionCount != 0 {
		t.Fatalf("C2 方案应 1 任务 0 子会话，got %+v", plan)
	}
	env.assertNoSideEffects("s-chat", "确认前")
	env.assertNoTaskCreateRequest()

	msg := env.waitConfirmationMessage("s-chat", plan.ID)
	if msg.TaskPlan.Status != coretask.PlanStatusPending || msg.TaskPlan.SessionID != "s-chat" {
		t.Fatalf("方案卡投影不对: %+v", msg.TaskPlan)
	}

	status, payload := env.do("POST", "/api/sessions/s-chat/task-plans/"+plan.ID+"/confirm", nil)
	if status != http.StatusOK {
		t.Fatalf("确认方案期望 200，got %d payload=%v", status, payload)
	}
	if got := env.count(`SELECT COUNT(*) FROM tasks WHERE session_id=?`, "s-chat"); got != 1 {
		t.Fatalf("确认后应在当前会话建 1 个任务，got %d", got)
	}
	if got := env.count(`SELECT COUNT(*) FROM tasks WHERE session_id=? AND complexity=?`, "s-chat", coretask.ComplexityC2); got != 1 {
		t.Fatalf("任务应记录复杂度 C2，got %d", got)
	}
	if got := env.count(`SELECT COUNT(*) FROM sessions WHERE parent_id=?`, "s-chat"); got != 0 {
		t.Fatalf("C2 确认后不应建子会话，got %d", got)
	}
	if got := env.count(`SELECT COUNT(*) FROM task_artifacts WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)`, "s-chat"); got != 0 {
		t.Fatalf("确认后不应立即产生产物，got %d", got)
	}
	if got := env.plan("s-chat"); got.Status != coretask.PlanStatusConfirmed {
		t.Fatalf("方案应更新为 confirmed，got %q", got.Status)
	}
}

func TestChatComplexRequestC3PlansChildSession(t *testing.T) {
	env := newChatPlanEnv(t)
	text := "请多轮迭代完善导出模块：1. 梳理现有链路 2. 设计新接口 3. 实现并自测"
	status, _ := env.do("POST", "/api/chat", map[string]any{"sessionId": "s-chat", "text": text})
	if status != http.StatusAccepted {
		t.Fatalf("POST /api/chat 期望 202，got %d", status)
	}
	plan := env.waitPlan("s-chat")
	if plan.Complexity != coretask.ComplexityC3 {
		t.Fatalf("多轮请求应判为 C3，got %q", plan.Complexity)
	}
	if plan.ChildSessionCount != 1 || plan.TaskCount != 1 {
		t.Fatalf("C3 方案应 1 任务 1 子会话，got %+v", plan)
	}
	env.assertNoSideEffects("s-chat", "确认前")
	env.assertNoTaskCreateRequest()

	status, _ = env.do("POST", "/api/sessions/s-chat/task-plans/"+plan.ID+"/confirm", nil)
	if status != http.StatusOK {
		t.Fatalf("确认方案期望 200，got %d", status)
	}
	if got := env.count(`SELECT COUNT(*) FROM sessions WHERE parent_id=?`, "s-chat"); got != 1 {
		t.Fatalf("C3 确认后应建 1 个子会话，got %d", got)
	}
	if got := env.count(`SELECT COUNT(*) FROM tasks WHERE session_id=?`, "s-chat"); got != 0 {
		t.Fatalf("C3 父会话不应有任务，got %d", got)
	}
	if got := env.count(`SELECT COUNT(*) FROM tasks WHERE session_id=(SELECT id FROM sessions WHERE parent_id=? LIMIT 1)`, "s-chat"); got != 1 {
		t.Fatalf("子会话应有 1 个任务，got %d", got)
	}
	if got := env.count(`SELECT COUNT(*) FROM tasks WHERE complexity=? AND session_id<>?`, coretask.ComplexityC3, "s-chat"); got != 1 {
		t.Fatalf("子会话任务应记录复杂度 C3，got %d", got)
	}
}

func TestChatComplexRequestRejectLeavesNoSideEffects(t *testing.T) {
	env := newChatPlanEnv(t)
	text := "请把报表导出做完：1. 梳理字段 2. 设计导出 3. 实现并自测"
	status, _ := env.do("POST", "/api/chat", map[string]any{"sessionId": "s-chat", "text": text})
	if status != http.StatusAccepted {
		t.Fatalf("POST /api/chat 期望 202，got %d", status)
	}
	plan := env.waitPlan("s-chat")
	env.assertNoSideEffects("s-chat", "拒绝前")

	status, _ = env.do("POST", "/api/sessions/s-chat/task-plans/"+plan.ID+"/reject", map[string]any{"reason": "先不做"})
	if status != http.StatusOK {
		t.Fatalf("拒绝方案期望 200，got %d", status)
	}
	env.assertNoSideEffects("s-chat", "拒绝后")
	if got := env.plan("s-chat"); got.Status != coretask.PlanStatusRejected {
		t.Fatalf("方案应更新为 rejected，got %q", got.Status)
	}
	status, _ = env.do("POST", "/api/sessions/s-chat/task-plans/"+plan.ID+"/confirm", nil)
	if status != http.StatusConflict {
		t.Fatalf("拒绝后再确认应 409，got %d", status)
	}
}

