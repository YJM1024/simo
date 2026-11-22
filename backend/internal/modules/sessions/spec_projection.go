package sessions

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	corespec "simo/internal/core/spec"
	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

const (
	defaultSpecTaskLimit = 3
	maxSpecTaskLimit     = 50
	deliverableLimit     = 3
)

type specEntryView struct {
	ID        string `json:"id"`
	Text      string `json:"text"`
	Source    string `json:"source"`
	CreatedAt int64  `json:"createdAt"`
}

type specGoalView struct {
	Text     string `json:"text"`
	Achieved bool   `json:"achieved"`
}

type specTaskView struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	State     string `json:"state"`
	UpdatedAt int64  `json:"updatedAt"`
	MessageID string `json:"messageId"`
}

type specGroup[T any] struct {
	Total   int  `json:"total"`
	Items   []T  `json:"items"`
	HasMore bool `json:"hasMore"`
}

type specDeliverableView struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Kind        string `json:"kind"`
	Size        int64  `json:"size,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
	DownloadRef string `json:"downloadRef"`
	PreviewURL  string `json:"previewUrl,omitempty"`
	DownloadURL string `json:"downloadUrl,omitempty"`
}

type specPendingView struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	CardID    string `json:"cardId,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

type specProjectionLinks struct {
	FullSpec string `json:"fullSpec"`
	Self     string `json:"self"`
}

type specProjection struct {
	SessionID            string                         `json:"sessionId"`
	Status               string                         `json:"status"`
	Revision             int                            `json:"revision"`
	UpdatedAt            int64                          `json:"updatedAt"`
	Goal                 *specGoalView                  `json:"goal"`
	Constraints          []specEntryView                `json:"constraints"`
	Inputs               []specEntryView                `json:"inputs"`
	Tasks                specTaskGroups                 `json:"tasks"`
	Deliverables         specGroup[specDeliverableView] `json:"deliverables"`
	PendingConfirmations specGroup[specPendingView]     `json:"pendingConfirmations"`
	Links                specProjectionLinks            `json:"links"`
}

type specTaskGroups struct {
	Done    specGroup[specTaskView] `json:"done"`
	Running specGroup[specTaskView] `json:"running"`
	Pending specGroup[specTaskView] `json:"pending"`
}

type deliveryArtifactLister interface {
	ListArtifactsForSession(ctx context.Context, sessionID string, includeChildren bool) ([]coretask.Artifact, error)
}

func (m *Module) handleSpecProjection(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" {
		httpserver.WriteError(w, http.StatusBadRequest, "sessionId 不能为空")
		return
	}
	session, err := m.Get(r.Context(), sessionID)
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
		return
	}
	limit := defaultSpecTaskLimit
	if raw := strings.TrimSpace(r.URL.Query().Get("taskLimit")); raw != "" {
		value, parseErr := strconv.Atoi(raw)
		if parseErr != nil || value < 1 || value > maxSpecTaskLimit {
			httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"ok": false, "error": map[string]any{"code": "invalid_task_limit", "message": "taskLimit 范围 1-50"},
			})
			return
		}
		limit = value
	}
	projection, err := m.buildSpecProjection(r.Context(), session, limit)
	if err != nil {
		m.log.Error("构建 spec projection 失败", "err", err, "sessionId", sessionID)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取会话规格失败")
		return
	}
	etag, etagErr := projectionETag(projection, limit)
	if etagErr != nil {
		// 摘要算不出来（当前结构不会发生）时不发条件请求语义，直接回 200：
		// 宁可让客户端多拉一次，也不能用错误验证器造成 304 误命中。
		m.log.Error("计算投影 ETag 失败", "err", etagErr, "sessionId", sessionID)
	} else {
		w.Header().Set("ETag", etag)
		w.Header().Set("Cache-Control", "no-cache")
		if etagMatches(r.Header.Get("If-None-Match"), etag) {
			// 304 不带 body，但保留 ETag 与 Cache-Control，客户端据此继续复用本地投影。
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, projection)
}

// projectionETag 计算会话投影响应的强验证器，形如 "spec-<16 位十六进制>"。
//
// 摘要取投影响应的规范化 JSON 与本次生效的 taskLimit：目标、约束、输入、
// 三组任务（total/items/hasMore）、交付物、待确认项、status、revision、
// updatedAt 与 links 全部参与，响应里任一字段变化都会让旧 If-None-Match 失效，
// 不再依赖 spec.version（消息、任务、交付物变化不写 spec.version）。
// json.Marshal 对同一结构是确定性的，因此同一状态的重复请求、不同实例之间
// 得到同一 ETag；如果序列化失败则返回错误，调用方跳过 304 分支。
func projectionETag(projection specProjection, limit int) (string, error) {
	payload, err := json.Marshal(struct {
		TaskLimit  int            `json:"taskLimit"`
		Projection specProjection `json:"projection"`
	}{TaskLimit: limit, Projection: projection})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return fmt.Sprintf(`"spec-%x"`, sum[:8]), nil
}

func (m *Module) taskMessageIDs(ctx context.Context, sessionID string) map[string]string {
	out := map[string]string{}
	rows, err := m.store.Query(ctx, `SELECT task_id, id FROM messages
		WHERE session_id = ? AND task_id <> '' AND internal = 0
		ORDER BY at ASC, rowid ASC`, sessionID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var taskID, messageID string
		if rows.Scan(&taskID, &messageID) == nil && taskID != "" {
			if _, exists := out[taskID]; !exists {
				out[taskID] = messageID
			}
		}
	}
	return out
}

func (m *Module) buildSpecProjection(ctx context.Context, session Session, limit int) (specProjection, error) {
	status := "draft"
	revision := 1
	updatedAt := int64(0)
	goal := (*specGoalView)(nil)
	constraints := make([]specEntryView, 0)
	spec, err := m.getSpecBySession(ctx, session.ID)
	if err == nil {
		status = projectionStatus(spec.Status)
		revision = spec.Version
		if revision < 1 {
			revision = 1
		}
		updatedAt = spec.UpdatedAt
		if strings.TrimSpace(spec.Goal) != "" {
			goal = &specGoalView{Text: strings.TrimSpace(spec.Goal), Achieved: spec.Status == corespec.StatusVerified}
		}
		for i, text := range spec.Constraints {
			text = strings.TrimSpace(text)
			if text == "" {
				continue
			}
			constraints = append(constraints, specEntryView{
				ID: fmt.Sprintf("c%d", i+1), Text: text, Source: "user", CreatedAt: spec.CreatedAt,
			})
		}
	} else if !errors.Is(err, ErrSpecNotFound) {
		return specProjection{}, err
	}
	if session.Archived != 0 {
		status = "archived"
	}
	tasks := specTaskGroups{
		Done:    specGroup[specTaskView]{Items: []specTaskView{}},
		Running: specGroup[specTaskView]{Items: []specTaskView{}},
		Pending: specGroup[specTaskView]{Items: []specTaskView{}},
	}
	taskMessageIDs := m.taskMessageIDs(ctx, session.ID)
	if m.tasks != nil {
		list, listErr := m.tasks.List(ctx, session.ID)
		if listErr == nil {
			for _, task := range list {
				state := projectionTaskState(task.Status)
				item := specTaskView{ID: task.ID, Title: task.Title, State: state, UpdatedAt: task.UpdatedAt,
					MessageID: taskMessageIDs[task.ID]}
				switch state {
				case "done":
					tasks.Done.Total++
					if len(tasks.Done.Items) < limit {
						tasks.Done.Items = append(tasks.Done.Items, item)
					}
				case "running":
					tasks.Running.Total++
					if len(tasks.Running.Items) < limit {
						tasks.Running.Items = append(tasks.Running.Items, item)
					}
				default:
					tasks.Pending.Total++
					if len(tasks.Pending.Items) < limit {
						tasks.Pending.Items = append(tasks.Pending.Items, item)
					}
				}
			}
		}
	}
	tasks.Done.HasMore = tasks.Done.Total > len(tasks.Done.Items)
	tasks.Running.HasMore = tasks.Running.Total > len(tasks.Running.Items)
	tasks.Pending.HasMore = tasks.Pending.Total > len(tasks.Pending.Items)

	deliverables := specGroup[specDeliverableView]{Items: []specDeliverableView{}}
	if lister, ok := m.tasks.(deliveryArtifactLister); ok {
		if list, err := lister.ListArtifactsForSession(ctx, session.ID, false); err == nil {
			for _, artifact := range list {
				deliverables.Total++
				if len(deliverables.Items) >= deliverableLimit {
					continue
				}
				deliverables.Items = append(deliverables.Items, specDeliverableView{
					ID: artifact.ID, Name: artifact.Name, Kind: artifactKind(artifact.Mime, artifact.Name),
					Size: artifact.Size, CreatedAt: artifact.CreatedAt, DownloadRef: "artifact:" + artifact.ID,
					PreviewURL: artifact.PreviewURL, DownloadURL: artifact.DownloadURL,
				})
			}
		}
	}
	deliverables.HasMore = deliverables.Total > len(deliverables.Items)

	pending := specGroup[specPendingView]{Items: []specPendingView{}}
	if rows, err := m.store.Query(ctx, `SELECT id, tool, created_at FROM approvals
		WHERE session_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 50`, session.ID); err == nil {
		for rows.Next() {
			var id, tool string
			var createdAt int64
			if rows.Scan(&id, &tool, &createdAt) == nil {
				pending.Total++
				if len(pending.Items) < deliverableLimit {
					pending.Items = append(pending.Items, specPendingView{
						ID: id, Kind: "approval", Title: tool, CreatedAt: createdAt,
					})
				}
			}
		}
		_ = rows.Close()
	}
	if rows, err := m.store.Query(ctx, `SELECT id, schema_json, created_at FROM message_cards
		WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 50`, session.ID); err == nil {
		for rows.Next() {
			var id, schemaJSON string
			var createdAt int64
			if rows.Scan(&id, &schemaJSON, &createdAt) != nil {
				continue
			}
			var schema map[string]any
			_ = json.Unmarshal([]byte(schemaJSON), &schema)
			title, _ := schema["title"].(string)
			title = strings.TrimSpace(title)
			if title == "" {
				title = "待确认"
			}
			kind := "choice"
			if strings.Contains(strings.ToLower(title), "确认") || strings.Contains(strings.ToLower(title), "confirm") {
				kind = "confirm"
			}
			pending.Total++
			if len(pending.Items) < deliverableLimit {
				pending.Items = append(pending.Items, specPendingView{
					ID: "card:" + id, Kind: kind, Title: title, CardID: id, CreatedAt: createdAt,
				})
			}
		}
		_ = rows.Close()
	}
	pending.HasMore = pending.Total > len(pending.Items)

	projection := specProjection{
		SessionID: session.ID, Status: status, Revision: revision, UpdatedAt: updatedAt,
		Goal: goal, Constraints: constraints, Inputs: []specEntryView{}, Tasks: tasks,
		Deliverables: deliverables, PendingConfirmations: pending,
		Links: specProjectionLinks{
			FullSpec: "/sessions/" + url.PathEscape(session.ID) + "/spec",
			Self:     fmt.Sprintf("/api/sessions/%s/spec-projection?taskLimit=%d", url.PathEscape(session.ID), limit),
		},
	}
	return projection, nil
}

func projectionStatus(status string) string {
	switch status {
	case corespec.StatusDraft:
		return "draft"
	case corespec.StatusVerified:
		return "completed"
	case corespec.StatusArchived:
		return "archived"
	default:
		return "active"
	}
}

func projectionTaskState(status string) string {
	switch status {
	case coretask.StatusDone:
		return "done"
	case coretask.StatusRunning:
		return "running"
	default:
		return "pending"
	}
}

func artifactKind(mime, name string) string {
	mime = strings.ToLower(strings.TrimSpace(mime))
	if strings.HasPrefix(mime, "image/") {
		return "image"
	}
	if strings.HasPrefix(mime, "text/") {
		return "text"
	}
	lowerName := strings.ToLower(name)
	if strings.HasSuffix(lowerName, ".md") || strings.HasSuffix(lowerName, ".txt") {
		return "text"
	}
	return "file"
}
