package tasks

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
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
	mux.HandleFunc("GET /api/artifacts/{id}", m.handleArtifact)
	mux.HandleFunc("GET /api/artifacts/{id}/content", m.handleArtifactContent)
	mux.HandleFunc("GET /api/sessions/{id}/artifacts", m.handleSessionArtifacts)
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
	list, err := m.List(r.Context(), sessionID)
	if err != nil {
		m.log.Error("列任务失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取任务失败")
		return
	}
	if statusFilter != "" {
		filtered := make([]coretask.Task, 0, len(list))
		for _, task := range list {
			if task.Status == statusFilter {
				filtered = append(filtered, task)
			}
		}
		list = filtered
	}
	if list == nil {
		list = []coretask.Task{}
	}
	for i := range list {
		decorateTask(&list[i])
	}
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
	task, err := m.Get(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	decorateTask(&task)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "task": task})
}

func (m *Module) handleCancel(w http.ResponseWriter, r *http.Request) {
	task, err := m.Cancel(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "task": task})
}

func (m *Module) handleRetry(w http.ResponseWriter, r *http.Request) {
	task, err := m.Retry(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeTaskError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "task": task})
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
	path, err := m.artifactPath(relPath)
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "产物路径非法")
		return
	}
	// 二次防护：解析后必须仍在 artifacts 根内。
	root, _ := filepath.Abs(m.sandbox.Artifacts)
	abs, _ := filepath.Abs(path)
	rel, err := filepath.Rel(root, abs)
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
	disposition := "inline"
	if !inlineArtifactMime(contentType) {
		disposition = "attachment"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", disposition+`; filename="`+filepath.Base(artifact.Name)+`"`)
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
