package chat

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"agentd/internal/platform/httpserver"
)

const (
	maxUploadFileBytes    int64 = 20 << 20
	maxMessageAttachments       = 5
	maxUploadRequestBytes int64 = maxUploadFileBytes*maxMessageAttachments + (2 << 20)
	maxUploadNameRunes          = 120
	uploadsRoot                 = "uploads"
)

var (
	errUploadTooLarge     = newRequestError("file_too_large", "单文件超过 20 MiB")
	errTooManyAttachments = newRequestError("too_many_attachments", "单条消息最多 5 个附件")
	errInvalidAttachment  = newRequestError("invalid_attachment", "附件不存在、不属于该会话或数量超限")
)

func (m *Module) safeUploadSession(ctx context.Context, sessionID string) (string, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return "", newRequestError(codeBadRequest, "sessionId 不能为空")
	}
	if !validPathSegment(sessionID) {
		return "", newRequestError(codeBadRequest, "sessionId 非法")
	}
	if m.sessions != nil {
		session, err := m.sessions.Get(ctx, sessionID)
		// 未知会话允许上传：M1/M8 的 caseSession 可以是按需创建的消息命名空间；
		// 只有已存在的会话才做归档只读检查。
		if err == nil && session.Archived != 0 {
			return "", newRequestError(codeSessionArchived, "会话已归档（只读）")
		}
	}
	return sessionID, nil
}

func validPathSegment(value string) bool {
	if value == "" || value == "." || value == ".." {
		return false
	}
	return !strings.ContainsAny(value, `/\`) && !strings.ContainsRune(value, ':')
}

// sanitizeUploadName 去掉路径/控制字符，禁止绝对路径和 ..，保留可读文件名。
func sanitizeUploadName(raw string) string {
	name := strings.ReplaceAll(strings.TrimSpace(raw), `\`, "/")
	name = path.Base(name)
	if name == "" || name == "." || name == "/" {
		name = "file"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case r == unicode.ReplacementChar:
			continue
		case r < 0x20 || r == 0x7f:
			continue
		case strings.ContainsRune(`<>:"|?*`, r):
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	name = strings.TrimSpace(b.String())
	name = strings.TrimLeft(name, ".")
	if name == "" {
		name = "file"
	}
	if runes := []rune(name); len(runes) > maxUploadNameRunes {
		ext := filepath.Ext(name)
		base := []rune(strings.TrimSuffix(name, ext))
		keep := maxUploadNameRunes - len([]rune(ext))
		if keep < 1 {
			keep = 1
		}
		if len(base) > keep {
			base = base[:keep]
		}
		name = string(base) + ext
	}
	return name
}

func safeMime(raw, name string) string {
	if mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(raw)); err == nil &&
		mediaType != "" && mediaType != "application/octet-stream" {
		return mediaType
	}
	if ext := strings.ToLower(filepath.Ext(name)); ext != "" {
		if byExt := mime.TypeByExtension(ext); byExt != "" {
			if mediaType, _, err := mime.ParseMediaType(byExt); err == nil {
				return mediaType
			}
		}
	}
	return "application/octet-stream"
}

func (m *Module) handleUpload(w http.ResponseWriter, r *http.Request) {
	sessionID, err := m.safeUploadSession(r.Context(), r.URL.Query().Get("sessionId"))
	if err != nil {
		m.writeRequestError(w, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadRequestBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		if httpserver.IsBodyTooLarge(err) {
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "body_too_large", "上传请求体过大")
			return
		}
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_multipart", "不是合法 multipart/form-data")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "missing_file", "缺少 file 字段")
		return
	}
	if len(files) > maxMessageAttachments {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "too_many_attachments", "单条消息最多 5 个附件")
		return
	}

	createdAt := time.Now().UnixMilli()
	attachments := make([]Attachment, 0, len(files))
	savedPaths := make([]string, 0, len(files))
	cleanup := func() {
		for _, p := range savedPaths {
			_ = os.Remove(p)
		}
	}
	for _, header := range files {
		if header.Size > maxUploadFileBytes {
			cleanup()
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "file_too_large", "单文件超过 20 MiB")
			return
		}
		name := sanitizeUploadName(header.Filename)
		attID := newID("att")
		relPath := path.Join(uploadsRoot, sessionID, attID+"-"+name)
		absPath, err := m.sandbox.ResolveWorkspace(relPath)
		if err != nil {
			cleanup()
			httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_path", "附件路径非法")
			return
		}
		if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
			cleanup()
			m.log.Error("创建 uploads 目录失败", "err", err)
			httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "保存附件失败")
			return
		}
		src, err := header.Open()
		if err != nil {
			cleanup()
			httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_multipart", "读取上传文件失败")
			return
		}
		dst, err := os.OpenFile(absPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		if err != nil {
			_ = src.Close()
			cleanup()
			m.log.Error("创建附件文件失败", "err", err)
			httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "保存附件失败")
			return
		}
		written, copyErr := io.Copy(dst, io.LimitReader(src, maxUploadFileBytes+1))
		_ = src.Close()
		closeErr := dst.Close()
		if copyErr != nil || closeErr != nil {
			_ = os.Remove(absPath)
			cleanup()
			m.log.Error("写入附件失败", "err", errors.Join(copyErr, closeErr))
			httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "保存附件失败")
			return
		}
		if written > maxUploadFileBytes {
			_ = os.Remove(absPath)
			cleanup()
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "file_too_large", "单文件超过 20 MiB")
			return
		}
		savedPaths = append(savedPaths, absPath)
		attachments = append(attachments, Attachment{
			ID: attID, Name: name, Mime: safeMime(header.Header.Get("Content-Type"), name),
			Size: written, CreatedAt: createdAt, SessionID: sessionID, RelPath: relPath,
		})
	}

	if err := m.store.Write(r.Context(), func(tx *sql.Tx) error {
		stmt, err := tx.PrepareContext(r.Context(), `INSERT INTO uploads(
			id, session_id, name, rel_path, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		for _, att := range attachments {
			if _, err := stmt.ExecContext(r.Context(), att.ID, att.SessionID, att.Name, att.RelPath, att.Mime, att.Size, att.CreatedAt); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		cleanup()
		m.log.Error("写 uploads 失败", "err", err)
		httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "保存附件失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "attachments": attachments})
}

func (m *Module) getUpload(ctx context.Context, id string) (Attachment, error) {
	var att Attachment
	err := m.store.QueryRow(ctx, `SELECT id, session_id, name, rel_path, mime, size, created_at
		FROM uploads WHERE id = ?`, strings.TrimSpace(id)).
		Scan(&att.ID, &att.SessionID, &att.Name, &att.RelPath, &att.Mime, &att.Size, &att.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Attachment{}, errUploadNotFound
	}
	if err != nil {
		return Attachment{}, fmt.Errorf("查询附件失败: %w", err)
	}
	return att, nil
}

var errUploadNotFound = errors.New("附件不存在")

func (m *Module) handleUploadMeta(w http.ResponseWriter, r *http.Request) {
	att, err := m.getUpload(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, errUploadNotFound) {
			httpserver.WriteErrorCode(w, http.StatusNotFound, "upload_not_found", "附件不存在")
			return
		}
		httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "读取附件失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "upload": att, "attachment": att})
}

func (m *Module) handleUploadDelete(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": map[string]any{"code": "R4_CONFIRM_REQUIRED", "message": "删除附件需人工确认"}})
}

func (m *Module) handleUploadContent(w http.ResponseWriter, r *http.Request) {
	att, err := m.getUpload(r.Context(), r.PathValue("id"))
	if err != nil {
		if errors.Is(err, errUploadNotFound) {
			httpserver.WriteErrorCode(w, http.StatusNotFound, "upload_not_found", "附件不存在")
			return
		}
		httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "读取附件失败")
		return
	}
	if m.sandbox == nil {
		httpserver.WriteErrorCode(w, http.StatusInternalServerError, "internal", "附件存储不可用")
		return
	}
	absPath, err := m.sandbox.ResolveWorkspace(att.RelPath)
	if err != nil || !isUnderUploadsRoot(m.sandbox.Workspace, absPath) {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_path", "附件路径非法")
		return
	}
	file, err := os.Open(absPath)
	if err != nil {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "upload_not_found", "附件文件不存在")
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "upload_not_found", "附件文件不存在")
		return
	}
	disposition := mime.FormatMediaType("attachment", map[string]string{"filename": att.Name})
	if disposition == "" {
		disposition = "attachment"
	}
	w.Header().Set("Content-Disposition", disposition)
	if strings.TrimSpace(att.Mime) != "" {
		w.Header().Set("Content-Type", att.Mime)
	}
	http.ServeContent(w, r, att.Name, info.ModTime(), file)
}

func isUnderUploadsRoot(workspaceRoot, absPath string) bool {
	root := filepath.Join(filepath.Clean(workspaceRoot), uploadsRoot)
	rel, err := filepath.Rel(root, filepath.Clean(absPath))
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func (m *Module) listUploadsByIDs(ctx context.Context, ids []string, sessionID string) ([]Attachment, error) {
	ids = uniqueStrings(ids)
	if len(ids) == 0 {
		return []Attachment{}, nil
	}
	if len(ids) > maxMessageAttachments {
		return nil, errTooManyAttachments
	}
	placeholders := make([]string, len(ids))
	args := make([]any, 0, len(ids)+1)
	for i, id := range ids {
		placeholders[i] = "?"
		args = append(args, id)
	}
	args = append(args, sessionID)
	rows, err := m.store.Query(ctx, `SELECT id, session_id, name, rel_path, mime, size, created_at
		FROM uploads WHERE id IN (`+strings.Join(placeholders, ",")+`) AND session_id = ?`, args...)
	if err != nil {
		return nil, fmt.Errorf("查询附件失败: %w", err)
	}
	defer rows.Close()
	byID := make(map[string]Attachment, len(ids))
	for rows.Next() {
		var att Attachment
		if err := rows.Scan(&att.ID, &att.SessionID, &att.Name, &att.RelPath, &att.Mime, &att.Size, &att.CreatedAt); err != nil {
			return nil, err
		}
		byID[att.ID] = att
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]Attachment, 0, len(ids))
	for _, id := range ids {
		att, ok := byID[id]
		if !ok {
			return nil, errInvalidAttachment
		}
		out = append(out, att)
	}
	return out, nil
}

func uniqueStrings(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

// attachUploads 给消息批量补 attachments；无附件也返回非 nil 空数组。
func (m *Module) attachUploads(ctx context.Context, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}
	for i := range messages {
		messages[i].Attachments = []Attachment{}
	}
	ids := make([]string, 0, len(messages))
	byMessage := make(map[string]int, len(messages))
	for i := range messages {
		ids = append(ids, messages[i].ID)
		byMessage[messages[i].ID] = i
	}
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	rows, err := m.store.Query(ctx, `SELECT message_id, upload_id, name, rel_path, mime, size, created_at
		FROM message_attachments WHERE message_id IN (`+strings.Join(placeholders, ",")+`)
		ORDER BY created_at ASC, rowid ASC`, args...)
	if err != nil {
		return fmt.Errorf("查询消息附件失败: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var messageID string
		var att Attachment
		if err := rows.Scan(&messageID, &att.ID, &att.Name, &att.RelPath, &att.Mime, &att.Size, &att.CreatedAt); err != nil {
			return err
		}
		if idx, ok := byMessage[messageID]; ok {
			messages[idx].Attachments = append(messages[idx].Attachments, att)
		}
	}
	return rows.Err()
}

func attachmentModelText(msg Message) string {
	text := msg.Text
	if len(msg.Attachments) == 0 {
		return text
	}
	lines := make([]string, 0, len(msg.Attachments))
	for _, att := range msg.Attachments {
		rel := att.RelPath
		if !strings.HasPrefix(rel, "workspace/") {
			rel = "workspace/" + rel
		}
		lines = append(lines, fmt.Sprintf("[附件] %s (%s, %d) → %s", att.Name, att.Mime, att.Size, rel))
	}
	if strings.TrimSpace(text) == "" {
		return strings.Join(lines, "\n")
	}
	return text + "\n\n" + strings.Join(lines, "\n")
}
