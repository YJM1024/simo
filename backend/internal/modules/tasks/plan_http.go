package tasks

import (
	"net/http"
	"strings"

	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

// 任务方案接口（PRD-TASK-004）：分级创建、查询、确认、拒绝。
// 确认/拒绝都以方案状态为准做幂等：重复确认 200；已拒绝再确认 409；重复拒绝 200。
func (m *Module) registerPlanHTTP(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/sessions/{id}/task-plans", m.handlePlanCreate)
	mux.HandleFunc("GET /api/sessions/{id}/task-plans", m.handlePlanList)
	mux.HandleFunc("GET /api/sessions/{id}/task-plans/{planId}", m.handlePlanGet)
	mux.HandleFunc("POST /api/sessions/{id}/task-plans/{planId}/confirm", m.handlePlanConfirm)
	mux.HandleFunc("POST /api/sessions/{id}/task-plans/{planId}/reject", m.handlePlanReject)
}

func (m *Module) handlePlanCreate(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	var input coretask.TaskPlanInput
	if err := m.readJSON(r, &input); err != nil {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_task_mode", "请求体不是合法 JSON")
		return
	}
	result, err := m.CreateTaskPlan(r.Context(), sessionID, input)
	if err != nil {
		writeConvError(w, err)
		return
	}
	payload := map[string]any{
		"ok": true, "complexity": result.Complexity.Complexity,
		"classification": result.Complexity,
		"plan":           result.Plan,
		"requiresConfirmation": result.Plan != nil,
	}
	if result.Plan != nil {
		payload["planId"] = result.Plan.ID
		payload["taskCount"] = result.Plan.TaskCount
		payload["childSessionCount"] = result.Plan.ChildSessionCount
		payload["planMessageId"] = result.Plan.PlanMessageID
	}
	httpserver.WriteJSON(w, http.StatusCreated, payload)
}

func (m *Module) handlePlanList(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	plans, err := m.ListTaskPlans(r.Context(), sessionID)
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "plans": plans})
}

func (m *Module) handlePlanGet(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	plan, err := m.GetTaskPlan(r.Context(), sessionID, strings.TrimSpace(r.PathValue("planId")))
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "plan": plan})
}

func (m *Module) handlePlanConfirm(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	plan, tasks, err := m.ConfirmTaskPlan(r.Context(), sessionID, strings.TrimSpace(r.PathValue("planId")))
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "plan": plan, "tasks": tasks,
		"taskCount": len(tasks), "childSessionIds": plan.ChildSessionIDs,
	})
}

func (m *Module) handlePlanReject(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = m.readJSON(r, &body)
	plan, err := m.RejectTaskPlan(r.Context(), sessionID, strings.TrimSpace(r.PathValue("planId")), body.Reason)
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "plan": plan})
}
