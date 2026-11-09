package chat

import (
	"net/http"
	"strings"

	"agentd/internal/platform/httpserver"
)

type sessionFile struct {
	ID          string            `json:"id"`
	Kind        string            `json:"kind"`
	Name        string            `json:"name"`
	Mime        string            `json:"mime"`
	Size        int64             `json:"size"`
	CreatedAt   int64             `json:"createdAt"`
	Source      map[string]string `json:"source"`
	PreviewURL  string            `json:"previewUrl"`
	DownloadURL string            `json:"downloadUrl"`
}

// handleSessionFiles 聚合本会话任务产物 + 上传附件；按路径去重（M11）。
func (m *Module) handleSessionFiles(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" || !validPathSegment(sessionID) {
		httpserver.WriteError(w, http.StatusBadRequest, "sessionId 非法")
		return
	}
	if m.sessions != nil {
		if _, err := m.sessions.Get(r.Context(), sessionID); err != nil {
			httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
			return
		}
	}
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	if kind != "" && kind != "artifact" && kind != "upload" && kind != "workspace" {
		httpserver.WriteError(w, http.StatusBadRequest, "kind 只支持 artifact|upload|workspace")
		return
	}
	files := make([]sessionFile, 0, 8)
	seen := make(map[string]bool)
	if kind == "" || kind == "artifact" {
		rows, err := m.store.Query(r.Context(), `SELECT a.id, a.task_id, a.name, a.rel_path, a.mime, a.size, a.created_at
			FROM task_artifacts a LEFT JOIN tasks t ON t.id = a.task_id
			WHERE t.session_id = ? OR a.task_id = ? ORDER BY a.created_at ASC, a.id ASC`,
			sessionID, "session:"+sessionID)
		if err != nil {
			m.log.Error("查询会话产物失败", "err", err, "sessionId", sessionID)
			httpserver.WriteError(w, http.StatusInternalServerError, "读取文件失败")
			return
		}
		for rows.Next() {
			var id, taskID, name, relPath, mime string
			var size, createdAt int64
			if err := rows.Scan(&id, &taskID, &name, &relPath, &mime, &size, &createdAt); err != nil {
				_ = rows.Close()
				httpserver.WriteError(w, http.StatusInternalServerError, "读取文件失败")
				return
			}
			key := strings.ToLower(strings.TrimPrefix(filepathToSlash(relPath), "./"))
			if seen[key] {
				continue
			}
			seen[key] = true
			files = append(files, sessionFile{
				ID: "file-artifact-" + id, Kind: "artifact", Name: name, Mime: mime, Size: size,
				CreatedAt:   createdAt,
				Source:      map[string]string{"taskId": taskID, "path": "artifacts/" + filepathToSlash(relPath)},
				PreviewURL:  "/api/artifacts/" + id + "/content",
				DownloadURL: "/api/artifacts/" + id + "/content?download=1",
			})
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			httpserver.WriteError(w, http.StatusInternalServerError, "读取文件失败")
			return
		}
		_ = rows.Close()
	}
	if kind == "" || kind == "upload" {
		rows, err := m.store.Query(r.Context(), `SELECT u.id, u.name, u.rel_path, u.mime, u.size, u.created_at,
			COALESCE((SELECT ma.message_id FROM message_attachments ma WHERE ma.upload_id = u.id ORDER BY ma.rowid ASC LIMIT 1), '')
			FROM uploads u WHERE u.session_id = ? ORDER BY u.created_at ASC, u.id ASC`, sessionID)
		if err != nil {
			m.log.Error("查询会话附件失败", "err", err, "sessionId", sessionID)
			httpserver.WriteError(w, http.StatusInternalServerError, "读取文件失败")
			return
		}
		for rows.Next() {
			var id, name, relPath, mime, messageID string
			var size, createdAt int64
			if err := rows.Scan(&id, &name, &relPath, &mime, &size, &createdAt, &messageID); err != nil {
				_ = rows.Close()
				httpserver.WriteError(w, http.StatusInternalServerError, "读取文件失败")
				return
			}
			key := strings.ToLower(strings.TrimPrefix(filepathToSlash(relPath), "./"))
			if seen[key] {
				continue
			}
			seen[key] = true
			files = append(files, sessionFile{
				ID: "file-upload-" + id, Kind: "upload", Name: name, Mime: mime, Size: size,
				CreatedAt:   createdAt,
				Source:      map[string]string{"messageId": messageID, "path": "workspace/" + filepathToSlash(relPath)},
				PreviewURL:  "/api/uploads/" + id,
				DownloadURL: "/api/uploads/" + id,
			})
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			httpserver.WriteError(w, http.StatusInternalServerError, "读取文件失败")
			return
		}
		_ = rows.Close()
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "files": files, "total": len(files)})
}

func filepathToSlash(path string) string {
	return strings.ReplaceAll(path, "\\", "/")
}
