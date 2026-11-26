package tasks

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

func (m *Module) registerConvHTTP(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/sessions/{id}/tasks", m.handleConvCreate)
	mux.HandleFunc("GET /api/sessions/{id}/tasks", m.handleConvList)
	mux.HandleFunc("GET /api/sessions/{id}/tasks/graph", m.handleConvGraph)
	mux.HandleFunc("GET /api/sessions/{id}/tasks/{taskId}", m.handleConvGet)
	mux.HandleFunc("POST /api/sessions/{id}/tasks/{taskId}/cancel", m.handleConvCancel)
	mux.HandleFunc("POST /api/sessions/{id}/tasks/{taskId}/retry", m.handleConvRetry)
	mux.HandleFunc("POST /api/sessions/{id}/tasks/{taskId}/confirmation", m.handleConvConfirmation)
	mux.HandleFunc("POST /api/sessions/{id}/tasks/{taskId}/resume", m.handleConvResume)
	mux.HandleFunc("GET /api/sessions/{id}/deliverables", m.handleConvDeliverables)
}

func (m *Module) readJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	return decoder.Decode(target)
}

func writeConvError(w http.ResponseWriter, err error) {
	var convErr *ConvError
	if errors.As(err, &convErr) {
		if convErr.Extra != nil {
			payload := map[string]any{"ok": false, "error": convErr.Message, "code": convErr.Code}
			for key, value := range convErr.Extra {
				payload[key] = value
			}
			httpserver.WriteJSON(w, convErr.Status, payload)
			return
		}
		httpserver.WriteErrorCode(w, convErr.Status, convErr.Code, convErr.Message)
		return
	}
	httpserver.WriteError(w, http.StatusInternalServerError, "任务操作失败")
}

func (m *Module) ensureSession(r *http.Request) (string, error) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" {
		return "", newConvError(404, "task_not_found", "会话不存在")
	}
	if m.sessions != nil {
		if _, err := m.sessions.Get(r.Context(), sessionID); err != nil {
			return "", newConvError(404, "task_not_found", "会话不存在")
		}
	}
	return sessionID, nil
}

func (m *Module) handleConvCreate(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	var input BatchCreateInput
	if err := m.readJSON(r, &input); err != nil {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_task_mode", "请求体不是合法 JSON")
		return
	}
	result, err := m.CreateBatch(r.Context(), sessionID, input)
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusCreated, map[string]any{
		"ok": true, "batchId": result.BatchID, "tasks": result.Tasks,
		"messageId": result.MessageID, "counts": result.Counts,
		"total": result.Total, "idempotent": result.Idempotent,
	})
}

func (m *Module) handleConvList(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	query := r.URL.Query()
	filter := ListFilter{
		Mode:    strings.TrimSpace(query.Get("mode")),
		BatchID: strings.TrimSpace(query.Get("batchId")),
		Before:  strings.TrimSpace(query.Get("before")),
	}
	if raw := strings.TrimSpace(query.Get("status")); raw != "" {
		filter.Status = strings.Split(raw, ",")
	}
	if raw := strings.TrimSpace(query.Get("limit")); raw != "" {
		limit, convErr := strconv.Atoi(raw)
		if convErr != nil || limit < 1 || limit > maxListLimit {
			writeConvError(w, newConvError(400, "invalid_task_limit", "limit 必须在 1..100"))
			return
		}
		filter.Limit = limit
	}
	tasks, hasMore, nextBefore, err := m.ListConvTasks(r.Context(), sessionID, filter)
	if err != nil {
		writeConvError(w, err)
		return
	}
	counts, _ := m.sessionTaskCounts(r.Context(), sessionID)
	total, err := m.CountConvTasks(r.Context(), sessionID, filter)
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "tasks": tasks, "counts": counts, "total": total,
		"hasMore": hasMore, "nextBefore": nextBefore,
	})
}

func (m *Module) handleConvGet(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	traceLimit := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("traceLimit")); raw != "" {
		value, convErr := strconv.Atoi(raw)
		if convErr != nil || value < 1 || value > maxTraceLimit {
			writeConvError(w, newConvError(400, "invalid_task_limit", "traceLimit 必须在 1..500"))
			return
		}
		traceLimit = value
	}
	traceBefore := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("traceBefore")); raw != "" {
		value, convErr := strconv.Atoi(raw)
		if convErr != nil || value < 0 {
			writeConvError(w, newConvError(400, "invalid_task_limit", "traceBefore 非法"))
			return
		}
		traceBefore = value
	}
	detail, err := m.ConvTaskDetail(r.Context(), sessionID, strings.TrimSpace(r.PathValue("taskId")), traceLimit, traceBefore)
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "task": detail.Task, "steps": detail.Steps,
		"currentStepId": detail.CurrentStepID, "traces": detail.Traces,
		"tracesHasMore": detail.TracesHasMore, "deliverables": detail.Deliverables,
		"context": detail.Context, "budget": detail.Budget,
	})
}

func (m *Module) handleConvCancel(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	taskID := strings.TrimSpace(r.PathValue("taskId"))
	if _, err := m.ConvTaskDetail(r.Context(), sessionID, taskID, 1, 0); err != nil {
		writeConvError(w, err)
		return
	}
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	task, cancelled, changed, err := m.CancelScope(r.Context(), taskID, scope)
	if err != nil {
		writeConvError(w, err)
		return
	}
	if cancelled == nil {
		cancelled = []string{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "task": task, "cancelled": cancelled, "changed": changed,
	})
}

func (m *Module) handleConvRetry(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	taskID := strings.TrimSpace(r.PathValue("taskId"))
	if _, err := m.ConvTaskDetail(r.Context(), sessionID, taskID, 1, 0); err != nil {
		writeConvError(w, err)
		return
	}
	task, attempt, reset, err := m.RetryConv(r.Context(), taskID)
	if err != nil {
		writeConvError(w, err)
		return
	}
	decorateTask(&task)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "task": task, "attempt": attempt, "resetStepCount": reset,
	})
}

func (m *Module) handleConvConfirmation(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	taskID := strings.TrimSpace(r.PathValue("taskId"))
	if _, err := m.ConvTaskDetail(r.Context(), sessionID, taskID, 1, 0); err != nil {
		writeConvError(w, err)
		return
	}
	var input ConfirmationInput
	if err := m.readJSON(r, &input); err != nil {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_task_status", "请求体不是合法 JSON")
		return
	}
	task, stepID, err := m.ConfirmConv(r.Context(), taskID, input)
	if err != nil {
		writeConvError(w, err)
		return
	}
	decorateTask(&task)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "task": task, "stepId": stepID, "decision": input.Decision,
	})
}

func (m *Module) handleConvResume(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	taskID := strings.TrimSpace(r.PathValue("taskId"))
	if _, err := m.ConvTaskDetail(r.Context(), sessionID, taskID, 1, 0); err != nil {
		writeConvError(w, err)
		return
	}
	var input struct {
		Reason string `json:"reason"`
	}
	_ = m.readJSON(r, &input)
	task, resumedStepID, err := m.ResumeConv(r.Context(), taskID, input.Reason)
	if err != nil {
		writeConvError(w, err)
		return
	}
	decorateTask(&task)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "task": task, "resumedStepId": resumedStepID,
	})
}

func (m *Module) handleConvGraph(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	graph, err := m.TaskGraph(r.Context(), sessionID, strings.TrimSpace(r.URL.Query().Get("batchId")))
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "nodes": graph.Nodes, "edges": graph.Edges,
		"layers": graph.Layers, "total": graph.Total,
	})
}

func (m *Module) handleConvDeliverables(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.ensureSession(r)
	if err != nil {
		writeConvError(w, err)
		return
	}
	limit := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		value, convErr := strconv.Atoi(raw)
		if convErr != nil || value < 1 || value > maxListLimit {
			writeConvError(w, newConvError(400, "invalid_task_limit", "limit 必须在 1..100"))
			return
		}
		limit = value
	}
	result, err := m.SessionDeliverables(r.Context(), sessionID,
		strings.TrimSpace(r.URL.Query().Get("taskId")), limit)
	if err != nil {
		writeConvError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "groups": result.Groups, "total": result.Total,
		"fileCount": result.FileCount, "hasMore": result.HasMore,
	})
}

// legacyTaskUpdated 给旧接口补 displayStatus 等字段。
func legacyTaskUpdated(task coretask.Task) map[string]any {
	decorateTask(&task)
	return map[string]any{"task": task, "displayStatus": displayStatus(task.Status)}
}
