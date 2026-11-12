package tasks

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"simo/internal/platform/httpserver"
)

type userDeliverable struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Mime         string `json:"mime"`
	Size         int64  `json:"size"`
	CreatedAt    int64  `json:"createdAt"`
	SessionID    string `json:"sessionId"`
	SessionTitle string `json:"sessionTitle"`
	PreviewURL   string `json:"previewUrl"`
	DownloadURL  string `json:"downloadUrl"`
	UserDelivery bool   `json:"userDelivery"`
	DeliveryKind string `json:"deliveryKind"`
}

func (m *Module) handleDeliverables(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	for key := range query {
		if key != "limit" && key != "offset" {
			httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"ok": false, "error": map[string]any{"code": "invalid_argument", "message": "未知参数: " + key},
			})
			return
		}
	}
	limit := 20
	offset := 0
	if raw := strings.TrimSpace(query.Get("limit")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"ok": false, "error": map[string]any{"code": "invalid_limit", "message": "limit 范围 1-100"},
			})
			return
		}
		limit = value
	}
	if raw := strings.TrimSpace(query.Get("offset")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 {
			httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"ok": false, "error": map[string]any{"code": "invalid_offset", "message": "offset 必须是 >=0 的整数"},
			})
			return
		}
		offset = value
	}
	list, total, err := m.ListUserDeliverables(r.Context(), limit, offset)
	if err != nil {
		m.log.Error("列用户交付物失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取交付物失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "deliverables": list, "total": total, "limit": limit, "offset": offset,
		"hasMore": offset+len(list) < total,
	})
}

func (m *Module) ListUserDeliverables(ctx context.Context, limit, offset int) ([]userDeliverable, int, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	const sessionExpr = `CASE WHEN a.task_id LIKE 'session:%' THEN substr(a.task_id, 9) ELSE COALESCE(t.session_id, '') END`
	var total int
	if err := m.store.QueryRow(ctx, `SELECT COUNT(*) FROM task_artifacts a
		LEFT JOIN tasks t ON t.id = a.task_id
		WHERE a.delivery_kind = 'user_delivery'
		  AND `+deliverableStoragePredicate).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := m.store.Query(ctx, `SELECT a.id, a.name, a.mime, a.size, a.created_at,
		`+sessionExpr+` AS session_id, COALESCE(s.title, ''), a.delivery_kind
		FROM task_artifacts a
		LEFT JOIN tasks t ON t.id = a.task_id
		LEFT JOIN sessions s ON s.id = `+sessionExpr+`
		WHERE a.delivery_kind = 'user_delivery'
		  AND `+deliverableStoragePredicate+`
		ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]userDeliverable, 0, limit)
	for rows.Next() {
		var item userDeliverable
		if err := rows.Scan(&item.ID, &item.Name, &item.Mime, &item.Size, &item.CreatedAt,
			&item.SessionID, &item.SessionTitle, &item.DeliveryKind); err != nil {
			return nil, 0, err
		}
		item.UserDelivery = true
		item.PreviewURL = "/api/artifacts/" + item.ID + "/content"
		item.DownloadURL = "/api/artifacts/" + item.ID + "/content?download=1"
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return out, total, nil
}
