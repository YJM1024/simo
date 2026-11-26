package tasks

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

func (m *Module) registerHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/tasks", m.handleList)
	mux.HandleFunc("GET /api/team", m.handleTeam)
	mux.HandleFunc("GET /api/workflows/{id}/members", m.handleWorkflowMembers)
	mux.HandleFunc("GET /api/tasks/{id}", m.handleGet)
	mux.HandleFunc("POST /api/tasks/{id}/cancel", m.handleCancel)
	mux.HandleFunc("POST /api/tasks/{id}/retry", m.handleRetry)
	mux.HandleFunc("GET /api/workflows", m.handleWorkflowList)
	mux.HandleFunc("GET /api/workflows/{id}", m.handleWorkflowGet)
	mux.HandleFunc("POST /api/workflows/{id}/pause", m.handleWorkflowPause)
	mux.HandleFunc("POST /api/workflows/{id}/resume", m.handleWorkflowResume)
	mux.HandleFunc("POST /api/workflows/{id}/cancel", m.handleWorkflowCancel)
	mux.HandleFunc("GET /api/artifacts", m.handleArtifacts)
	mux.HandleFunc("GET /api/deliverables", m.handleDeliverables)
	mux.HandleFunc("GET /api/artifacts/{id}", m.handleArtifact)
	mux.HandleFunc("GET /api/artifacts/{id}/content", m.handleArtifactContent)
	mux.HandleFunc("GET /api/sessions/{id}/artifacts", m.handleSessionArtifacts)
	m.registerConvHTTP(mux)
}

func (m *Module) handleTeam(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	list, err := m.List(r.Context(), sessionID)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取团队失败")
		return
	}
	members := make([]map[string]any, 0, len(list))
	for _, task := range list {
		taskCopy := task
		decorateTask(&taskCopy)
		members = append(members, map[string]any{
			"agentId": taskCopy.ExecutorAgentID, "ownerAgentId": taskCopy.ExecutorAgentID,
			"name": taskCopy.Title, "role": "task",
			"status": taskCopy.Status, "progress": taskCopy.Progress,
			"stateReason": taskCopy.StateReason, "taskId": taskCopy.ID,
			"workflowId": taskCopy.WorkflowID, "sessionId": taskCopy.SessionID,
			"attempt": taskCopy.Attempt,
		})
	}
	if sessionID != "" {
		if rows, err := m.store.Query(r.Context(), `SELECT id,title,owner_agent_id,created_at FROM sessions
			WHERE parent_id=? ORDER BY created_at ASC`, sessionID); err == nil {
			for rows.Next() {
				var id, title, owner string
				var createdAt int64
				if rows.Scan(&id, &title, &owner, &createdAt) == nil {
					if owner == "" {
						owner = "simo"
					}
					members = append(members, map[string]any{
						"agentId": owner, "ownerAgentId": owner, "name": title, "role": "session",
						"status": "active", "progress": 0, "stateReason": "", "sessionId": id,
						"createdAt": createdAt,
					})
				}
			}
			_ = rows.Close()
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "members": members, "total": len(members),
		"globalConcurrency":   envPositiveInt("SIMO_MAX_CONCURRENCY", 3),
		"workflowConcurrency": envPositiveInt("SIMO_WORKFLOW_CONCURRENCY", 3)})
}

func (m *Module) handleWorkflowMembers(w http.ResponseWriter, r *http.Request) {
	wf, err := m.GetWorkflow(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	decorateWorkflow(&wf)
	members := make([]map[string]any, 0, len(wf.Tasks))
	for _, task := range wf.Tasks {
		taskCopy := task
		decorateTask(&taskCopy)
		members = append(members, map[string]any{
			"agentId": taskCopy.ExecutorAgentID, "name": taskCopy.Title, "role": "task",
			"status": taskCopy.Status, "progress": taskCopy.Progress,
			"stateReason": taskCopy.StateReason, "taskId": taskCopy.ID,
			"workflowId": taskCopy.WorkflowID, "sessionId": taskCopy.SessionID,
			"attempt": taskCopy.Attempt,
		})
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "workflowId": wf.ID,
		"stateReason": wf.StateReason, "members": members, "total": len(members)})
}

func (m *Module) handleList(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	batchFilter := strings.TrimSpace(r.URL.Query().Get("batchId"))
	if sessionID != "" {
		// 会话化列表：筛选、计数、展示态与游标走同一套实现。
		filter := ListFilter{BatchID: batchFilter, Mode: strings.TrimSpace(r.URL.Query().Get("mode"))}
		if statusFilter != "" {
			filter.Status = strings.Split(statusFilter, ",")
		}
		if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
			if limit, convErr := strconv.Atoi(raw); convErr == nil {
				filter.Limit = limit
			}
		}
		tasks, hasMore, nextBefore, err := m.ListConvTasks(r.Context(), sessionID, filter)
		if err != nil {
			writeConvError(w, err)
			return
		}
		counts, _ := m.sessionTaskCounts(r.Context(), sessionID)
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{
			"ok": true, "tasks": tasks, "counts": counts,
			"hasMore": hasMore, "nextBefore": nextBefore,
		})
		return
	}
	list, err := m.List(r.Context(), sessionID)
	if err != nil {
		m.log.Error("列任务失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取任务失败")
		return
	}
	if statusFilter != "" || batchFilter != "" {
		filtered := make([]coretask.Task, 0, len(list))
		for _, task := range list {
			if statusFilter != "" && displayStatus(task.Status) != statusFilter && task.Status != statusFilter {
				continue
			}
			if batchFilter != "" && task.BatchID != batchFilter {
				continue
			}
			filtered = append(filtered, task)
		}
		list = filtered
	}
	if list == nil {
		list = []coretask.Task{}
	}
	for i := range list {
		decorateTask(&list[i])
	}
	// PRD-TASK-005：全局列表同样补直接子会话投影，父层入口与 counts 的口径保持一致。
	m.decorateChildSessions(r.Context(), list)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"tasks": list})
}

func (m *Module) handleWorkflowList(w http.ResponseWriter, r *http.Request) {
	list, err := m.ListWorkflows(r.Context(), strings.TrimSpace(r.URL.Query().Get("sessionId")))
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取工作流失败")
		return
	}
	if list == nil {
		list = []coretask.Workflow{}
	}
	for i := range list {
		decorateWorkflow(&list[i])
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "workflows": list})
}

func (m *Module) handleWorkflowGet(w http.ResponseWriter, r *http.Request) {
	wf, err := m.GetWorkflow(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	decorateWorkflow(&wf)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "workflow": wf})
}

func (m *Module) handleWorkflowPause(w http.ResponseWriter, r *http.Request) {
	wf, err := m.PauseWorkflow(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "workflow": wf})
}

func (m *Module) handleWorkflowResume(w http.ResponseWriter, r *http.Request) {
	wf, err := m.ResumeWorkflow(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "workflow": wf})
}

func (m *Module) handleWorkflowCancel(w http.ResponseWriter, r *http.Request) {
	wf, err := m.CancelWorkflow(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "workflow": wf})
}

func (m *Module) handleGet(w http.ResponseWriter, r *http.Request) {
	taskID := strings.TrimSpace(r.PathValue("id"))
	// 旧路由兼容：P2 起必须带 sessionId 查询参数，缺参 400、跨会话 404。
	// 旧调用方仍可继续用本路由，但需要补上 ?sessionId=<会话>；新代码应改用
	// GET /api/sessions/{id}/tasks/{taskId}（会话内路由自带会话校验）。
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "task_session_required", "缺少会话参数")
		return
	}
	task, err := m.Get(r.Context(), taskID)
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	if task.SessionID != sessionID {
		// 与 ConvTaskDetail 一致：跨会话不暴露任务是否存在。
		httpserver.WriteErrorCode(w, http.StatusNotFound, "task_not_found", "任务不存在")
		return
	}
	decorateTask(&task)
	m.decorateChildSessionsOne(r.Context(), &task)
	payload := map[string]any{"ok": true, "task": task, "displayStatus": displayStatus(task.Status)}
	// 新字段：步骤、轨迹、上下文与预算；旧客户端不读这些键也不受影响。
	if steps, err := m.loadSteps(r.Context(), taskID); err == nil && len(steps) > 0 {
		payload["steps"] = steps
	}
	if traces, hasMore, err := m.loadTraces(r.Context(), taskID, 0, 0); err == nil && len(traces) > 0 {
		payload["traces"] = traces
		payload["tracesHasMore"] = hasMore
	}
	payload["context"] = map[string]any{
		"goal": task.Goal, "inputs": task.Inputs, "constraints": task.Constraints, "historyCount": 0,
	}
	payload["budget"] = m.budgetFor(task)
	httpserver.WriteJSON(w, http.StatusOK, payload)
}

func (m *Module) handleCancel(w http.ResponseWriter, r *http.Request) {
	if !m.checkLegacySessionScope(w, r, strings.TrimSpace(r.PathValue("id"))) {
		return
	}
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	if scope == "chain" || scope == "self" {
		task, cancelled, changed, err := m.CancelScope(r.Context(), strings.TrimSpace(r.PathValue("id")), scope)
		if err != nil {
			writeConvError(w, err)
			return
		}
		decorateTask(&task)
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{
			"ok": true, "task": task, "cancelled": cancelled, "changed": changed,
		})
		return
	}
	task, err := m.Cancel(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "task": task})
}

func (m *Module) handleRetry(w http.ResponseWriter, r *http.Request) {
	// 新旧两个 retry 入口共用 Module.Retry 里的状态守卫：只允许 failed/cancelled/interrupted，
	// 其余返回 409 task_state_conflict，attempt 不变。
	if !m.checkLegacySessionScope(w, r, strings.TrimSpace(r.PathValue("id"))) {
		return
	}
	task, err := m.Retry(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		var convErr *ConvError
		if errors.As(err, &convErr) {
			writeConvError(w, err)
			return
		}
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "task": task})
}

// checkLegacySessionScope 给没有会话路径段的旧任务路由补一层可选的会话隔离：
// 调用方带了 ?sessionId= 就要求任务属于该会话，不属于时一律按不存在处理
// （404 task_not_found，不暴露任务是否存在），与会话内路由同口径；
// 不带该参数时保持旧行为，action 注册表与老调用方仍可直接按任务 id 操作。
func (m *Module) checkLegacySessionScope(w http.ResponseWriter, r *http.Request, taskID string) bool {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		return true
	}
	task, err := m.Get(r.Context(), taskID)
	if err != nil {
		m.writeTaskError(w, err)
		return false
	}
	if task.SessionID != sessionID {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "task_not_found", "任务不存在")
		return false
	}
	return true
}

func (m *Module) writeTaskError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpserver.WriteError(w, http.StatusNotFound, "任务不存在")
	case errors.Is(err, ErrArtifactNotFound):
		httpserver.WriteError(w, http.StatusNotFound, "产物不存在")
	case errors.Is(err, ErrInvalid):
		httpserver.WriteError(w, http.StatusBadRequest, "参数非法")
	default:
		m.log.Error("任务操作失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "任务操作失败")
	}
}

func (m *Module) handleArtifacts(w http.ResponseWriter, r *http.Request) {
	taskID := strings.TrimSpace(r.URL.Query().Get("taskId"))
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID != "" && m.sessions != nil {
		if _, err := m.sessions.Get(r.Context(), sessionID); err != nil {
			httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
			return
		}
	}
	var list []coretask.Artifact
	var err error
	switch {
	case taskID != "":
		list, err = m.ListArtifacts(r.Context(), taskID)
	case sessionID != "":
		includeChildren := strings.EqualFold(r.URL.Query().Get("includeChildren"), "true") ||
			r.URL.Query().Get("includeChildren") == "1"
		list, err = m.ListArtifactsForSession(r.Context(), sessionID, includeChildren)
	default:
		list, err = m.ListArtifacts(r.Context(), "")
	}
	if err != nil {
		m.log.Error("列产物失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取产物失败")
		return
	}
	if list == nil {
		list = []coretask.Artifact{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "artifacts": list})
}

// handleSessionArtifacts 允许父会话按 sessionId 读取子会话产物（不复制）。
func (m *Module) handleSessionArtifacts(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" {
		httpserver.WriteError(w, http.StatusBadRequest, "sessionId 不能为空")
		return
	}
	if m.sessions != nil {
		if _, err := m.sessions.Get(r.Context(), sessionID); err != nil {
			httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
			return
		}
	}
	list, err := m.ListArtifactsBySession(r.Context(), sessionID)
	if err != nil {
		m.log.Error("列会话产物失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取产物失败")
		return
	}
	if list == nil {
		list = []coretask.Artifact{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "artifacts": list})
}

func (m *Module) handleArtifact(w http.ResponseWriter, r *http.Request) {
	artifact, _, err := m.getArtifact(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "artifact": artifact})
}

func (m *Module) handleArtifactContent(w http.ResponseWriter, r *http.Request) {
	artifact, relPath, err := m.getArtifact(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	allowInternal := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("source")), "files")
	path, err := m.artifactPath(artifact, relPath, allowInternal)
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "产物路径非法或不可作为用户交付物")
		return
	}
	// 二次防护：解析后必须仍在对应存储根内。
	root := m.sandbox.Artifacts
	if artifact.StorageScope == coretask.ArtifactStorageWorkspace {
		root = m.sandbox.Workspace
	}
	rootAbs, _ := filepath.Abs(root)
	abs, _ := filepath.Abs(path)
	rel, err := filepath.Rel(rootAbs, abs)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		httpserver.WriteError(w, http.StatusNotFound, "产物路径非法")
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "产物不存在")
		return
	}
	contentType := contentTypeFor(artifact.Name, data)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	w.Header().Set("Content-Disposition", contentDisposition(artifact.Name, isDownloadRequest(r)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func inlineArtifactMime(contentType string) bool {
	contentType = strings.ToLower(contentType)
	return strings.HasPrefix(contentType, "text/") || strings.HasPrefix(contentType, "image/") ||
		strings.HasPrefix(contentType, "application/pdf") || strings.HasPrefix(contentType, "application/json")
}

func contentTypeFor(name string, data []byte) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".txt", ".log":
		return "text/plain; charset=utf-8"
	case ".md", ".markdown":
		return "text/markdown; charset=utf-8"
	case ".json":
		return "application/json; charset=utf-8"
	case ".csv":
		return "text/csv; charset=utf-8"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".pdf":
		return "application/pdf"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case ".pptx":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	case ".doc":
		return "application/msword"
	case ".xls":
		return "application/vnd.ms-excel"
	case ".ppt":
		return "application/vnd.ms-powerpoint"
	}
	if http.DetectContentType(data) == "application/pdf" {
		return "application/pdf"
	}
	return "application/octet-stream"
}
