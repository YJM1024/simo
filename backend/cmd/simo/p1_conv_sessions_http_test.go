package main

// P1-CONV 会话（sessions）HTTP 契约测试。
// 覆盖 AC-CONV-001（会话树/父子关系）、AC-CONV-002（懒创建草稿、重命名、置顶、
// 归档只读、删除需确认）以及异常边界（AC-CONV-00N-02：非法参数/未知会话返回可读
// 错误信封且不留下脏数据）。全部走真实 HTTP handler + SQLite，不 mock 存储。

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// p1RequestJSON 发送 JSON 请求；body 为 string 时原样发送（用于构造非法 JSON 与超大 body），
// nil 表示无请求体。返回状态码与响应体。
func p1RequestJSON(t *testing.T, method, url string, body any) (int, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		if raw, ok := body.(string); ok {
			reader = strings.NewReader(raw)
		} else {
			payload, err := json.Marshal(body)
			if err != nil {
				t.Fatalf("marshal %s body: %v", url, err)
			}
			reader = bytes.NewReader(payload)
		}
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("new request %s %s: %v", method, url, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read %s %s: %v", method, url, err)
	}
	return resp.StatusCode, payload
}

func p1DecodeJSON(t *testing.T, label string, body []byte) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("%s: 响应不是 JSON 对象: %v (%s)", label, err, body)
	}
	return payload
}

// p1AssertErrorEnvelope 断言错误信封：ok=false、HTTP 状态码与 code 匹配、message 可读。
// 后端存在两种形状：扁平 {ok,error:string,code}（sessions/httpserver 主流）与嵌套
// {ok,error:{code,message}}（DELETE /api/sessions/{id} 与 chat 的部分端点），两者都接受。
func p1AssertErrorEnvelope(t *testing.T, label string, status int, body []byte, wantStatus int, wantCode string) {
	t.Helper()
	if status != wantStatus {
		t.Fatalf("%s: status = %d, want %d; body=%s", label, status, wantStatus, body)
	}
	var envelope struct {
		OK    *bool           `json:"ok"`
		Error json.RawMessage `json:"error"`
		Code  string          `json:"code"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("%s: 响应不是 JSON: %v (%s)", label, err, body)
	}
	if envelope.OK == nil || *envelope.OK {
		t.Fatalf("%s: 必须是 ok:false 信封: %s", label, body)
	}
	code, message := envelope.Code, ""
	if len(envelope.Error) > 0 {
		var text string
		if err := json.Unmarshal(envelope.Error, &text); err == nil {
			message = text
		} else {
			var nested struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			}
			if err := json.Unmarshal(envelope.Error, &nested); err != nil {
				t.Fatalf("%s: 无法解析 error 字段: %v (%s)", label, err, body)
			}
			message = nested.Message
			if code == "" {
				code = nested.Code
			}
		}
	}
	if code != wantCode {
		t.Fatalf("%s: code = %q, want %q; body=%s", label, code, wantCode, body)
	}
	if strings.TrimSpace(message) == "" {
		t.Fatalf("%s: 错误信封缺少可读 message: %s", label, body)
	}
}

func p1SessionField(t *testing.T, label string, body []byte) map[string]any {
	t.Helper()
	payload := p1DecodeJSON(t, label, body)
	session, _ := payload["session"].(map[string]any)
	if session == nil {
		t.Fatalf("%s: 缺少 session 对象: %s", label, body)
	}
	return session
}

func p1StringField(t *testing.T, label string, payload map[string]any, key string) string {
	t.Helper()
	value, _ := payload[key].(string)
	if strings.TrimSpace(value) == "" {
		t.Fatalf("%s: 字段 %q 为空: %v", label, key, payload)
	}
	return value
}

// p1CreateSession 通过 POST /api/sessions 显式 draft:false 立即创建会话并返回完整对象。
func p1CreateSession(t *testing.T, baseURL, parentID, title string) map[string]any {
	t.Helper()
	status, body := p1RequestJSON(t, http.MethodPost, baseURL+"/api/sessions", map[string]any{
		"parentId": parentID, "title": title, "draft": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("create session %q: status = %d, body=%s", title, status, body)
	}
	return p1SessionField(t, "create session", body)
}

func p1ListSessions(t *testing.T, rawURL string) []map[string]any {
	t.Helper()
	status, body := httpGet(t, rawURL)
	if status != http.StatusOK {
		t.Fatalf("list sessions %s: status = %d, body=%s", rawURL, status, body)
	}
	payload := p1DecodeJSON(t, "list sessions", body)
	raw, ok := payload["sessions"].([]any)
	if !ok {
		t.Fatalf("list sessions %s: sessions 字段不是数组: %s", rawURL, body)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		session, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("list sessions %s: sessions 元素不是对象: %s", rawURL, body)
		}
		out = append(out, session)
	}
	return out
}

// p1TreeHasSession 在 /api/sessions/tree 平铺结果中查找会话节点（不含内存草稿）。
func p1TreeHasSession(t *testing.T, baseURL, id string) *treeNode {
	t.Helper()
	for _, node := range sessionTree(t, baseURL) {
		if node.ID == id {
			found := node
			return &found
		}
	}
	return nil
}

// p1SessionExists 通过 owner 探针判断会话是否已落库：GET 存在 200，草稿/未知 404。
func p1SessionExists(t *testing.T, baseURL, id string) bool {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/sessions/"+id+"/owner")
	switch status {
	case http.StatusOK:
		return true
	case http.StatusNotFound:
		p1AssertErrorEnvelope(t, "owner probe "+id, status, body, http.StatusNotFound, "not_found")
		return false
	default:
		t.Fatalf("owner probe %s: status = %d, body=%s", id, status, body)
		return false
	}
}

func p1SessionIDs(sessions []map[string]any) []string {
	out := make([]string, 0, len(sessions))
	for _, session := range sessions {
		id, _ := session["id"].(string)
		out = append(out, id)
	}
	return out
}

func p1ContainsID(sessions []map[string]any, id string) bool {
	for _, session := range sessions {
		if got, _ := session["id"].(string); got == id {
			return true
		}
	}
	return false
}

// TestP1ConvSessionsCreateContract 覆盖 AC-CONV-002-01：默认懒创建草稿、显式立即创建、
// 父会话不存在/非法 JSON/超大 body/归档父会话下创建的错误边界。
func TestP1ConvSessionsCreateContract(t *testing.T) {
	_, ts := newM2App(t, nil, nil)

	status, body := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", "{not-json")
	p1AssertErrorEnvelope(t, "create 非法 JSON", status, body, http.StatusBadRequest, "bad_request")

	oversized := `{"parentId":"main","title":"` + strings.Repeat("仓", 7000) + `"}`
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", oversized)
	p1AssertErrorEnvelope(t, "create 超大 body", status, body, http.StatusRequestEntityTooLarge, "body_too_large")

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "sess-p1-missing", "title": "孤儿会话",
	})
	p1AssertErrorEnvelope(t, "create 未知父会话", status, body, http.StatusNotFound, "not_found")

	// 默认懒创建：返回 draft=true，不写 sessions 表，会话树/owner 探针都看不到。
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "main", "title": "P1 懒创建草稿",
	})
	if status != http.StatusCreated {
		t.Fatalf("create draft: status = %d, body=%s", status, body)
	}
	if draft, ok := p1DecodeJSON(t, "create draft", body)["draft"].(bool); !ok || !draft {
		t.Fatalf("create 默认必须返回 draft=true: %s", body)
	}
	draftSession := p1SessionField(t, "create draft", body)
	draftID := p1StringField(t, "create draft", draftSession, "id")
	if parent := p1StringField(t, "create draft", draftSession, "parentId"); parent != "main" {
		t.Fatalf("草稿 parentId = %q, want main", parent)
	}
	if title := p1StringField(t, "create draft", draftSession, "title"); title != "P1 懒创建草稿" {
		t.Fatalf("草稿 title = %q", title)
	}
	if node := p1TreeHasSession(t, ts.URL, draftID); node != nil {
		t.Fatalf("草稿不应出现在会话树: %+v", node)
	}
	if p1SessionExists(t, ts.URL, draftID) {
		t.Fatalf("草稿不应落库（owner 探针应 404）")
	}

	// 显式 draft:false 立即落库；空标题回退“子会话”。
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "main", "draft": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("create immediate: status = %d, body=%s", status, body)
	}
	if draft, _ := p1DecodeJSON(t, "create immediate", body)["draft"].(bool); draft {
		t.Fatalf("显式 draft:false 必须返回 draft=false: %s", body)
	}
	created := p1SessionField(t, "create immediate", body)
	createdID := p1StringField(t, "create immediate", created, "id")
	if title := p1StringField(t, "create immediate", created, "title"); title != "子会话" {
		t.Fatalf("空标题应回退“子会话”，得到 %q", title)
	}
	if node := p1TreeHasSession(t, ts.URL, createdID); node == nil {
		t.Fatalf("draft:false 创建后必须立即出现在会话树")
	}

	// 归档父会话后不能再创建子会话（归档只读）。
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/"+createdID+"/archive", nil)
	if status != http.StatusOK {
		t.Fatalf("archive parent: status = %d, body=%s", status, body)
	}
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": createdID, "title": "归档下新建", "draft": false,
	})
	p1AssertErrorEnvelope(t, "create 归档父会话下", status, body, http.StatusConflict, "conflict")
}

// TestP1ConvSessionsRenamePinContract 覆盖 AC-CONV-002-01：重命名、置顶/取消置顶、列表过滤；
// 以及 AC-CONV-002-02：未知会话/空标题/非法 pinned/超大 body 的错误边界。
func TestP1ConvSessionsRenamePinContract(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	first := p1StringField(t, "create first", p1CreateSession(t, ts.URL, "main", "重命名目标 A"), "id")
	second := p1StringField(t, "create second", p1CreateSession(t, ts.URL, "main", "重命名目标 B"), "id")

	status, body := p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/sess-p1-missing", map[string]any{"title": "新标题"})
	p1AssertErrorEnvelope(t, "rename 未知会话", status, body, http.StatusNotFound, "not_found")
	status, body = p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/"+first, map[string]any{"title": "   "})
	p1AssertErrorEnvelope(t, "rename 空标题", status, body, http.StatusBadRequest, "bad_request")
	status, body = p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/"+first, "{")
	p1AssertErrorEnvelope(t, "rename 非法 JSON", status, body, http.StatusBadRequest, "bad_request")
	oversized := `{"title":"` + strings.Repeat("名", 7000) + `"}`
	status, body = p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/"+first, oversized)
	p1AssertErrorEnvelope(t, "rename 超大 body", status, body, http.StatusRequestEntityTooLarge, "body_too_large")

	status, body = p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/"+first, map[string]any{"title": "重命名后 A"})
	if status != http.StatusOK {
		t.Fatalf("rename: status = %d, body=%s", status, body)
	}
	renamed := p1SessionField(t, "rename", body)
	if title := p1StringField(t, "rename", renamed, "title"); title != "重命名后 A" {
		t.Fatalf("rename title = %q", title)
	}
	if node := p1TreeHasSession(t, ts.URL, first); node == nil || node.Title != "重命名后 A" {
		t.Fatalf("会话树未反映重命名: %+v", node)
	}

	status, body = httpGet(t, ts.URL+"/api/sessions?pinned=maybe")
	p1AssertErrorEnvelope(t, "list pinned 非法值", status, body, http.StatusBadRequest, "bad_request")

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/"+second+"/pin", nil)
	if status != http.StatusOK {
		t.Fatalf("pin: status = %d, body=%s", status, body)
	}
	if pinned, _ := p1SessionField(t, "pin", body)["pinned"].(bool); !pinned {
		t.Fatalf("pin 响应 pinned 应为 true: %s", body)
	}
	pinnedList := p1ListSessions(t, ts.URL+"/api/sessions?pinned=true")
	if !p1ContainsID(pinnedList, second) {
		t.Fatalf("pinned=true 列表缺少置顶会话: %v", p1SessionIDs(pinnedList))
	}
	for _, session := range pinnedList {
		if pinned, _ := session["pinned"].(bool); !pinned {
			t.Fatalf("pinned=true 列表包含未置顶会话: %v", session)
		}
	}
	unpinnedList := p1ListSessions(t, ts.URL+"/api/sessions?pinned=false")
	if p1ContainsID(unpinnedList, second) {
		t.Fatalf("pinned=false 列表不应包含置顶会话: %v", p1SessionIDs(unpinnedList))
	}
	all := p1ListSessions(t, ts.URL+"/api/sessions")
	if len(all) == 0 || p1StringField(t, "list all", all[0], "id") != second {
		t.Fatalf("置顶会话应排在列表首位: %v", p1SessionIDs(all))
	}

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/"+second+"/unpin", nil)
	if status != http.StatusOK {
		t.Fatalf("unpin: status = %d, body=%s", status, body)
	}
	if pinned, _ := p1SessionField(t, "unpin", body)["pinned"].(bool); pinned {
		t.Fatalf("unpin 响应 pinned 应为 false: %s", body)
	}
	if list := p1ListSessions(t, ts.URL+"/api/sessions?pinned=true"); len(list) != 0 {
		t.Fatalf("取消置顶后 pinned=true 列表应为空: %v", p1SessionIDs(list))
	}

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/sess-p1-missing/pin", nil)
	p1AssertErrorEnvelope(t, "pin 未知会话", status, body, http.StatusNotFound, "not_found")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/sess-p1-missing/unpin", nil)
	p1AssertErrorEnvelope(t, "unpin 未知会话", status, body, http.StatusNotFound, "not_found")
}

// TestP1ConvSessionDeleteRequiresConfirmation 覆盖 R4 删除确认：DELETE 恒 403 且不删数据。
func TestP1ConvSessionDeleteRequiresConfirmation(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	child := p1StringField(t, "create child", p1CreateSession(t, ts.URL, "main", "待删除会话"), "id")

	for _, id := range []string{"main", child} {
		status, body := p1RequestJSON(t, http.MethodDelete, ts.URL+"/api/sessions/"+id, nil)
		p1AssertErrorEnvelope(t, "delete "+id, status, body, http.StatusForbidden, "R4_CONFIRM_REQUIRED")
	}

	if node := p1TreeHasSession(t, ts.URL, child); node == nil {
		t.Fatalf("DELETE 被拒绝后会话不应被删除")
	}
	if !p1SessionExists(t, ts.URL, "main") {
		t.Fatalf("main 会话不应被删除")
	}
	if list := p1ListSessions(t, ts.URL+"/api/sessions"); !p1ContainsID(list, "main") || !p1ContainsID(list, child) {
		t.Fatalf("DELETE 被拒绝后会话列表不应变化: %v", p1SessionIDs(list))
	}
}

// TestP1ConvSessionArchiveLifecycleReadonly 覆盖 AC-CONV-002-01/02 的归档生命周期：
// 归档后只读（改名/发消息/建子会话被拒），历史消息仍可读，unarchive 后恢复可写。
func TestP1ConvSessionArchiveLifecycleReadonly(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	child := p1StringField(t, "create archive target", p1CreateSession(t, ts.URL, "main", "归档生命周期会话"), "id")
	if status := postChatSession(t, ts.URL, child, "归档前消息"); status != http.StatusAccepted {
		t.Fatalf("chat before archive: status = %d", status)
	}
	waitForReplyDone(t, ts.URL, child)

	status, body := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/sess-p1-missing/archive", nil)
	p1AssertErrorEnvelope(t, "archive 未知会话", status, body, http.StatusNotFound, "not_found")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/sess-p1-missing/unarchive", nil)
	p1AssertErrorEnvelope(t, "unarchive 未知会话", status, body, http.StatusNotFound, "not_found")

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/"+child+"/archive", nil)
	if status != http.StatusOK {
		t.Fatalf("archive: status = %d, body=%s", status, body)
	}
	if archived, _ := p1SessionField(t, "archive", body)["archived"].(float64); archived != 1 {
		t.Fatalf("archive 后 archived 应为 1: %s", body)
	}
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/"+child+"/archive", nil)
	if status != http.StatusOK {
		t.Fatalf("重复归档应幂等返回 200: status = %d, body=%s", status, body)
	}

	status, body = p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/"+child, map[string]any{"title": "归档后改名"})
	p1AssertErrorEnvelope(t, "rename 归档会话", status, body, http.StatusConflict, "conflict")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{"sessionId": child, "text": "归档后发消息"})
	p1AssertErrorEnvelope(t, "chat 归档会话", status, body, http.StatusConflict, "session_archived")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": child, "title": "归档下新建", "draft": false,
	})
	p1AssertErrorEnvelope(t, "create 归档父会话下", status, body, http.StatusConflict, "conflict")

	// 归档只读：历史消息仍可读，且失败的写入没有追加脏消息。
	messagesBefore := listMessages(t, ts.URL, child)
	foundBefore := false
	for _, message := range messagesBefore {
		if text, _ := message["text"].(string); strings.Contains(text, "归档前消息") {
			foundBefore = true
		}
	}
	if !foundBefore {
		t.Fatalf("归档后应仍能读到历史消息: %v", messagesBefore)
	}
	if len(messagesBefore) != 2 {
		t.Fatalf("归档前应只有 user+agent 两条消息，实际 %d", len(messagesBefore))
	}

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions/"+child+"/unarchive", nil)
	if status != http.StatusOK {
		t.Fatalf("unarchive: status = %d, body=%s", status, body)
	}
	if archived, _ := p1SessionField(t, "unarchive", body)["archived"].(float64); archived != 0 {
		t.Fatalf("unarchive 后 archived 应为 0: %s", body)
	}
	status, body = p1RequestJSON(t, http.MethodPatch, ts.URL+"/api/sessions/"+child, map[string]any{"title": "恢复后改名"})
	if status != http.StatusOK {
		t.Fatalf("unarchive 后应可改名: status = %d, body=%s", status, body)
	}
	if status := postChatSession(t, ts.URL, child, "归档恢复后消息"); status != http.StatusAccepted {
		t.Fatalf("unarchive 后应可发消息: status = %d", status)
	}
	waitForReplyDone(t, ts.URL, child)
	foundAfter := false
	for _, message := range listMessages(t, ts.URL, child) {
		if text, _ := message["text"].(string); strings.Contains(text, "归档恢复后消息") {
			foundAfter = true
		}
	}
	if !foundAfter {
		t.Fatalf("unarchive 后发送的消息应可读")
	}
}

// TestP1ConvDraftScopedPerTree 覆盖 AC-CONV-002-01 的懒创建语义：同一会话树最多一个
// 内存草稿（复用并更新标题），不同树各自独立；首条消息物化草稿并保留父会话。
func TestP1ConvDraftScopedPerTree(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	// 直接写库造一个独立根（parent_id 为空），否则所有会话都挂在 main 这棵树上。
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(),
			`INSERT INTO sessions(id, parent_id, title, created_at, archived, pinned) VALUES ('sess-p1-legacy-root', '', '独立根会话', 1, 0, 0)`)
		return err
	}); err != nil {
		t.Fatalf("seed legacy root: %v", err)
	}

	draftStatus, draftBody := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "main", "title": "主树草稿一",
	})
	if draftStatus != http.StatusCreated {
		t.Fatalf("create main draft: status = %d, body=%s", draftStatus, draftBody)
	}
	draftA := p1StringField(t, "create main draft", p1SessionField(t, "create main draft", draftBody), "id")

	status, body := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "main", "title": "主树草稿二",
	})
	if status != http.StatusCreated {
		t.Fatalf("reuse main draft: status = %d, body=%s", status, body)
	}
	reused := p1SessionField(t, "reuse main draft", body)
	if id := p1StringField(t, "reuse main draft", reused, "id"); id != draftA {
		t.Fatalf("同一会话树应复用草稿 id=%q，得到 %q", draftA, id)
	}
	if title := p1StringField(t, "reuse main draft", reused, "title"); title != "主树草稿二" {
		t.Fatalf("复用草稿时应更新标题，得到 %q", title)
	}

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "sess-p1-legacy-root", "title": "独立树草稿",
	})
	if status != http.StatusCreated {
		t.Fatalf("create legacy draft: status = %d, body=%s", status, body)
	}
	draftB := p1SessionField(t, "create legacy draft", body)
	draftBID := p1StringField(t, "create legacy draft", draftB, "id")
	if draftBID == draftA {
		t.Fatalf("不同会话树不应共用草稿")
	}
	if parent := p1StringField(t, "create legacy draft", draftB, "parentId"); parent != "sess-p1-legacy-root" {
		t.Fatalf("独立树草稿 parentId = %q", parent)
	}

	for _, id := range []string{draftA, draftBID} {
		if node := p1TreeHasSession(t, ts.URL, id); node != nil {
			t.Fatalf("草稿 %s 不应出现在会话树: %+v", id, node)
		}
		if p1SessionExists(t, ts.URL, id) {
			t.Fatalf("草稿 %s 不应落库", id)
		}
	}

	// 首条消息物化主树草稿：落库、父子关系保留、消息可读。
	if status := postChatSession(t, ts.URL, draftA, "主树草稿首条消息"); status != http.StatusAccepted {
		t.Fatalf("chat draft: status = %d", status)
	}
	waitForReplyDone(t, ts.URL, draftA)
	if node := p1TreeHasSession(t, ts.URL, draftA); node == nil {
		t.Fatalf("首条消息后草稿应物化进会话树")
	} else if node.ParentID != "main" {
		t.Fatalf("物化后 parentId = %q, want main", node.ParentID)
	}
	if !p1SessionExists(t, ts.URL, draftA) {
		t.Fatalf("物化后 owner 探针应 200")
	}
	messages := listMessages(t, ts.URL, draftA)
	foundText := false
	for _, message := range messages {
		if text, _ := message["text"].(string); strings.Contains(text, "主树草稿首条消息") {
			foundText = true
		}
	}
	if !foundText || len(messages) != 2 {
		t.Fatalf("物化后应能读到 user+agent 消息: %v", messages)
	}

	// 另一棵树的草稿不因这次写入被连带物化。
	if p1SessionExists(t, ts.URL, draftBID) {
		t.Fatalf("独立树草稿不应被连带物化")
	}
	if node := p1TreeHasSession(t, ts.URL, draftBID); node != nil {
		t.Fatalf("独立树草稿不应出现在会话树: %+v", node)
	}

	// 草稿被消费后，同一棵树可以再开新草稿。
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/sessions", map[string]any{
		"parentId": "main", "title": "物化后新草稿",
	})
	if status != http.StatusCreated {
		t.Fatalf("new draft after materialize: status = %d, body=%s", status, body)
	}
	if id := p1StringField(t, "new draft", p1SessionField(t, "new draft", body), "id"); id == draftA {
		t.Fatalf("已物化的草稿不应被复用，得到旧 id %q", id)
	}
}
