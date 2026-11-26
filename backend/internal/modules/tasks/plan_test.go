package tasks

import (
	"net/http"
	"testing"
)

func (e *convHTTPEnv) count(t *testing.T, query string, args ...any) int {
	t.Helper()
	var n int
	if err := e.mod.store.QueryRow(e.ctx, query, args...).Scan(&n); err != nil {
		t.Fatalf("计数失败 %s: %v", query, err)
	}
	return n
}

func TestTaskPlanCreateC0C1HasNoSideEffects(t *testing.T) {
	env := newConvHTTPEnv(t)
	cases := []struct {
		name string
		body map[string]any
		want string
	}{
		{"C0", map[string]any{"requestText": "查一下现在几点", "steps": []string{"回答"}}, "C0"},
		{"C1", map[string]any{"requestText": "改一个错别字", "steps": []string{"定位", "修改"}}, "C1"},
	}
	for _, tc := range cases {
		status, payload := env.json(t, http.MethodPost, "/api/sessions/plan-s1/task-plans", tc.body)
		if status != http.StatusCreated {
			t.Fatalf("%s 分级应 201，got %d body=%v", tc.name, status, payload)
		}
		if got := payload["complexity"]; got != tc.want {
			t.Fatalf("%s 等级应为 %s，got %v", tc.name, tc.want, got)
		}
		if payload["plan"] != nil {
			t.Fatalf("%s 不应生成方案卡: %v", tc.name, payload["plan"])
		}
		if ok, _ := payload["requiresConfirmation"].(bool); ok {
			t.Fatalf("%s 不应要求确认", tc.name)
		}
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks`); n != 0 {
		t.Fatalf("C0/C1 不应建任务，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM task_plans`); n != 0 {
		t.Fatalf("C0/C1 不应建方案，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM sessions`); n != 0 {
		t.Fatalf("C0/C1 不应建会话，got %d", n)
	}
}

func TestTaskPlanC3ConfirmCreatesChildSessionAndTask(t *testing.T) {
	env := newConvHTTPEnv(t)
	status, payload := env.json(t, http.MethodPost, "/api/sessions/plan-p3/task-plans", map[string]any{
		"requestText": "重构导出流程", "multiRound": true,
		"steps": []string{"梳理现状", "设计接口", "实现", "回归"},
	})
	if status != http.StatusCreated {
		t.Fatalf("C3 分级应 201，got %d body=%v", status, payload)
	}
	if payload["complexity"] != "C3" {
		t.Fatalf("应为 C3，got %v", payload["complexity"])
	}
	planID, _ := payload["planId"].(string)
	if planID == "" {
		t.Fatalf("C3 应返回 planId: %v", payload)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks`); n != 0 {
		t.Fatalf("确认前不应建任务，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM sessions WHERE parent_id = 'plan-p3'`); n != 0 {
		t.Fatalf("确认前不应建子会话，got %d", n)
	}
	var attempt int
	if err := env.mod.store.QueryRow(env.ctx, `SELECT attempt FROM task_plans WHERE id = ?`, planID).Scan(&attempt); err != nil {
		t.Fatal(err)
	}
	if attempt != 0 {
		t.Fatalf("确认前 attempt 应为 0，got %d", attempt)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM messages WHERE session_id = 'plan-p3' AND category = 'confirmation' AND id = (SELECT plan_message_id FROM task_plans WHERE id = ?)`, planID); n != 1 {
		t.Fatalf("确认前应有 1 张方案卡，got %d", n)
	}

	status, confirmed := env.json(t, http.MethodPost, "/api/sessions/plan-p3/task-plans/"+planID+"/confirm", nil)
	if status != http.StatusOK {
		t.Fatalf("确认应 200，got %d body=%v", status, confirmed)
	}
	tasks, _ := confirmed["tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("C3 确认后应 1 个任务，got %d", len(tasks))
	}
	children, _ := confirmed["childSessionIds"].([]any)
	if len(children) != 1 {
		t.Fatalf("C3 确认后应 1 个子会话，got %d", len(children))
	}
	childID, _ := children[0].(string)
	if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE session_id = 'plan-p3'`); n != 0 {
		t.Fatalf("C3 父级任务应为 0，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE session_id = ?`, childID); n != 1 {
		t.Fatalf("C3 子会话任务应为 1，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE complexity = 'C3'`); n != 1 {
		t.Fatalf("任务应带 C3 等级，got %d", n)
	}

	// 重复确认幂等：不再建子会话/任务，返回同一结果。
	status, again := env.json(t, http.MethodPost, "/api/sessions/plan-p3/task-plans/"+planID+"/confirm", nil)
	if status != http.StatusOK {
		t.Fatalf("重复确认应 200，got %d body=%v", status, again)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM sessions WHERE parent_id = 'plan-p3'`); n != 1 {
		t.Fatalf("重复确认后子会话仍应为 1，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks`); n != 1 {
		t.Fatalf("重复确认后任务仍应为 1，got %d", n)
	}
	if tasks, _ := again["tasks"].([]any); len(tasks) != 1 {
		t.Fatalf("重复确认应返回原任务，got %d", len(tasks))
	}
}

func TestTaskPlanRejectLeavesNoSideEffects(t *testing.T) {
	env := newConvHTTPEnv(t)
	status, payload := env.json(t, http.MethodPost, "/api/sessions/plan-r3/task-plans", map[string]any{
		"requestText": "拆成子会话处理", "multiRound": true, "steps": []string{"一", "二", "三"},
	})
	if status != http.StatusCreated {
		t.Fatalf("分级应 201，got %d body=%v", status, payload)
	}
	planID, _ := payload["planId"].(string)
	status, rejected := env.json(t, http.MethodPost, "/api/sessions/plan-r3/task-plans/"+planID+"/reject",
		map[string]any{"reason": "不需要了"})
	if status != http.StatusOK {
		t.Fatalf("拒绝应 200，got %d body=%v", status, rejected)
	}
	plan, _ := rejected["plan"].(map[string]any)
	if plan["status"] != "rejected" {
		t.Fatalf("方案应标记 rejected，got %v", plan["status"])
	}
	if plan["rejectedReason"] != "不需要了" {
		t.Fatalf("应记录拒绝原因，got %v", plan["rejectedReason"])
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks`); n != 0 {
		t.Fatalf("拒绝后任务应为 0，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM sessions`); n != 0 {
		t.Fatalf("拒绝后子会话应为 0，got %d", n)
	}
	status, conflict := env.json(t, http.MethodPost, "/api/sessions/plan-r3/task-plans/"+planID+"/confirm", nil)
	if status != http.StatusConflict {
		t.Fatalf("已拒绝再确认应 409，got %d body=%v", status, conflict)
	}
}

func TestTaskPlanC2ConfirmCreatesTaskInCurrentSession(t *testing.T) {
	env := newConvHTTPEnv(t)
	status, payload := env.json(t, http.MethodPost, "/api/sessions/plan-c2/task-plans", map[string]any{
		"requestText": "整理季度数据", "steps": []string{"取数", "清洗", "出表"},
	})
	if status != http.StatusCreated {
		t.Fatalf("C2 分级应 201，got %d body=%v", status, payload)
	}
	if payload["complexity"] != "C2" {
		t.Fatalf("应为 C2，got %v", payload["complexity"])
	}
	planID, _ := payload["planId"].(string)
	status, confirmed := env.json(t, http.MethodPost, "/api/sessions/plan-c2/task-plans/"+planID+"/confirm", nil)
	if status != http.StatusOK {
		t.Fatalf("确认应 200，got %d body=%v", status, confirmed)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE session_id = 'plan-c2'`); n != 1 {
		t.Fatalf("C2 当前会话任务应为 1，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM sessions WHERE parent_id = 'plan-c2'`); n != 0 {
		t.Fatalf("C2 不应建子会话，got %d", n)
	}
}

func TestTaskPlanC4ConfirmCreatesThreeChildSessions(t *testing.T) {
	env := newConvHTTPEnv(t)
	status, payload := env.json(t, http.MethodPost, "/api/sessions/plan-c4/task-plans", map[string]any{
		"requestText": "并行做三块", "crossDomain": true, "steps": []string{"一", "二", "三"},
	})
	if status != http.StatusCreated {
		t.Fatalf("C4 分级应 201，got %d body=%v", status, payload)
	}
	if payload["complexity"] != "C4" {
		t.Fatalf("应为 C4，got %v", payload["complexity"])
	}
	if n, _ := payload["childSessionCount"].(float64); n != 3 {
		t.Fatalf("C4 应计划 3 个子会话，got %v", payload["childSessionCount"])
	}
	planID, _ := payload["planId"].(string)
	status, confirmed := env.json(t, http.MethodPost, "/api/sessions/plan-c4/task-plans/"+planID+"/confirm", nil)
	if status != http.StatusOK {
		t.Fatalf("确认应 200，got %d body=%v", status, confirmed)
	}
	children, _ := confirmed["childSessionIds"].([]any)
	if len(children) != 3 {
		t.Fatalf("C4 应建 3 个子会话，got %d", len(children))
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE session_id = 'plan-c4'`); n != 0 {
		t.Fatalf("C4 父级任务应为 0，got %d", n)
	}
	if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE complexity = 'C4'`); n != 3 {
		t.Fatalf("C4 应建 3 个任务，got %d", n)
	}
	for _, raw := range children {
		id, _ := raw.(string)
		if n := env.count(t, `SELECT COUNT(*) FROM tasks WHERE session_id = ?`, id); n != 1 {
			t.Fatalf("子会话 %s 应有 1 个任务，got %d", id, n)
		}
	}
}
