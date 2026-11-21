package main

// P1-CONV 消息（messages）HTTP 契约测试。
// 覆盖 AC-CONV-004（消息流/分类/sessionPath 投影）、AC-CONV-007（祖先消息整级加载）、
// AC-CONV-002-02（归档会话只读）、历史上下文回传与跨重启持久化。

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
)

func p1Messages(t *testing.T, rawURL string) []map[string]any {
	t.Helper()
	status, body := httpGet(t, rawURL)
	if status != http.StatusOK {
		t.Fatalf("messages %s: status = %d, body=%s", rawURL, status, body)
	}
	payload := p1DecodeJSON(t, "messages", body)
	raw, ok := payload["messages"].([]any)
	if !ok {
		t.Fatalf("messages %s: messages 字段不是数组: %s", rawURL, body)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		message, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("messages %s: 元素不是对象: %s", rawURL, body)
		}
		out = append(out, message)
	}
	return out
}

func p1MessageIDs(messages []map[string]any) []string {
	out := make([]string, 0, len(messages))
	for _, message := range messages {
		id, _ := message["id"].(string)
		out = append(out, id)
	}
	return out
}

func p1MessageByID(messages []map[string]any, id string) map[string]any {
	for _, message := range messages {
		if got, _ := message["id"].(string); got == id {
			return message
		}
	}
	return nil
}

func p1UserMessage(messages []map[string]any, text string) map[string]any {
	for _, message := range messages {
		if role, _ := message["role"].(string); role != "user" {
			continue
		}
		if got, _ := message["text"].(string); got == text {
			return message
		}
	}
	return nil
}

func p1SessionPathItems(t *testing.T, label string, message map[string]any) []map[string]any {
	t.Helper()
	raw, ok := message["sessionPath"].([]any)
	if !ok {
		t.Fatalf("%s: sessionPath 不是数组: %v", label, message)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		entry, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("%s: sessionPath 元素不是对象: %v", label, message)
		}
		out = append(out, entry)
	}
	return out
}

// TestP1ConvMessagePaginationClampAndCursor 覆盖 AC-CONV-004-01 的分页契约：
// limit 上限截断、before 游标续页不重不漏、非法游标与缺省全量行为。
func TestP1ConvMessagePaginationClampAndCursor(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	const total = 210
	// 直接写库造消息，避免 210 轮模型调用拖慢用例；id 递增便于核对游标语义。
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		stmt, err := tx.PrepareContext(context.Background(),
			`INSERT INTO messages(id, session_id, role, text, at, status) VALUES (?, 'main', 'user', ?, ?, 'done')`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		for i := 0; i < total; i++ {
			if _, err := stmt.ExecContext(context.Background(), "msg-p1-bulk-"+itoa(i), "批量消息-"+itoa(i), i+1); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("seed messages: %v", err)
	}

	status, body := httpGet(t, ts.URL+"/api/messages?sessionId=main&limit=500")
	if status != http.StatusOK {
		t.Fatalf("page1: status = %d, body=%s", status, body)
	}
	page1 := p1DecodeJSON(t, "page1", body)
	page1Messages, _ := page1["messages"].([]any)
	if len(page1Messages) != 200 {
		t.Fatalf("limit=500 应被截到 200 条，实际 %d", len(page1Messages))
	}
	if hasMore, _ := page1["hasMore"].(bool); !hasMore {
		t.Fatalf("limit=500 第一页 hasMore 应为 true: %s", body)
	}
	nextBefore := p1StringField(t, "page1", page1, "nextBefore")

	status, body = httpGet(t, ts.URL+"/api/messages?sessionId=main&limit=500&before="+nextBefore)
	if status != http.StatusOK {
		t.Fatalf("page2: status = %d, body=%s", status, body)
	}
	page2 := p1DecodeJSON(t, "page2", body)
	page2Messages, _ := page2["messages"].([]any)
	if len(page2Messages) != 10 {
		t.Fatalf("续页应只剩 10 条，实际 %d", len(page2Messages))
	}
	if hasMore, _ := page2["hasMore"].(bool); hasMore {
		t.Fatalf("续页不足 pageLimit 时 hasMore 应为 false: %s", body)
	}

	seen := make(map[string]bool, total)
	for _, raw := range append(append([]any{}, page1Messages...), page2Messages...) {
		message, _ := raw.(map[string]any)
		id, _ := message["id"].(string)
		if id == "" {
			t.Fatalf("分页消息缺少 id: %v", message)
		}
		if seen[id] {
			t.Fatalf("分页出现重复消息 id: %s", id)
		}
		seen[id] = true
	}
	if len(seen) != total {
		t.Fatalf("两页合计应覆盖 %d 条消息，实际 %d", total, len(seen))
	}

	status, body = httpGet(t, ts.URL+"/api/messages?sessionId=main&before=msg-p1-missing&limit=10")
	if status != http.StatusOK {
		t.Fatalf("未知游标: status = %d, body=%s", status, body)
	}
	unknownCursor := p1DecodeJSON(t, "unknown cursor", body)
	if messages, _ := unknownCursor["messages"].([]any); len(messages) != 0 {
		t.Fatalf("before 指向不存在的消息时应返回空页，实际 %d", len(messages))
	}

	// 未带 limit/before 时不进入分页：返回该会话全量且无分页字段。
	status, body = httpGet(t, ts.URL+"/api/messages?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("full list: status = %d, body=%s", status, body)
	}
	full := p1DecodeJSON(t, "full list", body)
	fullMessages, _ := full["messages"].([]any)
	if len(fullMessages) != total {
		t.Fatalf("缺省应返回全量 %d 条，实际 %d", total, len(fullMessages))
	}
	if _, hasMore := full["hasMore"]; hasMore {
		t.Fatalf("非分页响应不应带 hasMore 字段: %s", body)
	}

	// 未知会话 + includeChildren：空列表而不是 500，也不能泄漏其它会话消息。
	status, body = httpGet(t, ts.URL+"/api/messages?sessionId=sess-p1-missing&includeChildren=true")
	if status != http.StatusOK {
		t.Fatalf("未知会话聚合: status = %d, body=%s", status, body)
	}
	if messages := p1Messages(t, ts.URL+"/api/messages?sessionId=sess-p1-missing&includeChildren=true"); len(messages) != 0 {
		t.Fatalf("未知会话不应返回消息: %v", messages)
	}
}

// TestP1ConvMessageAggregateAncestorChain 覆盖 AC-CONV-001/007：includeChildren 祖先链
// 整级加载、sessionPath 根→当前、sessionTitle 投影与聚合分页。
func TestP1ConvMessageAggregateAncestorChain(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	child := p1StringField(t, "create child", p1CreateSession(t, ts.URL, "main", "聚合子会话"), "id")
	grand := p1StringField(t, "create grand", p1CreateSession(t, ts.URL, child, "聚合孙会话"), "id")

	turns := []struct{ sessionID, text string }{
		{"main", "聚合-主会话消息"},
		{child, "聚合-子会话消息"},
		{grand, "聚合-孙会话消息"},
	}
	for _, turn := range turns {
		if status := postChatSession(t, ts.URL, turn.sessionID, turn.text); status != http.StatusAccepted {
			t.Fatalf("chat %s: status = %d", turn.sessionID, status)
		}
		waitForReplyDone(t, ts.URL, turn.sessionID)
	}

	mainOnly := p1Messages(t, ts.URL+"/api/messages?sessionId=main&includeChildren=false")
	if len(mainOnly) != 2 {
		t.Fatalf("includeChildren=false 应只含主会话 2 条消息，实际 %d: %v", len(mainOnly), p1MessageIDs(mainOnly))
	}
	for _, message := range mainOnly {
		if sessionID, _ := message["sessionId"].(string); sessionID != "main" {
			t.Fatalf("includeChildren=false 泄漏子会话消息: %v", message)
		}
	}

	aggregate := p1Messages(t, ts.URL+"/api/messages?sessionId=main&includeChildren=true")
	if len(aggregate) != 6 {
		t.Fatalf("祖先链聚合应为 6 条消息，实际 %d: %v", len(aggregate), p1MessageIDs(aggregate))
	}
	wantTitles := map[string]string{"main": "主会话", child: "聚合子会话", grand: "聚合孙会话"}
	wantPathLen := map[string]int{"main": 1, child: 2, grand: 3}
	firstIndex := map[string]int{"main": -1, child: -1, grand: -1}
	for index, message := range aggregate {
		sessionID, _ := message["sessionId"].(string)
		if _, ok := wantPathLen[sessionID]; !ok {
			t.Fatalf("聚合返回了非祖先链会话 %q 的消息", sessionID)
		}
		if firstIndex[sessionID] == -1 {
			firstIndex[sessionID] = index
		}
		if title, _ := message["sessionTitle"].(string); title != wantTitles[sessionID] {
			t.Fatalf("sessionTitle = %q, want %q", title, wantTitles[sessionID])
		}
		path := p1SessionPathItems(t, "aggregate", message)
		if len(path) != wantPathLen[sessionID] {
			t.Fatalf("会话 %s 的 sessionPath 长度 = %d, want %d", sessionID, len(path), wantPathLen[sessionID])
		}
		if rootID, _ := path[0]["id"].(string); rootID != "main" {
			t.Fatalf("sessionPath 首项应为根 main，得到 %q", rootID)
		}
		if lastID, _ := path[len(path)-1]["id"].(string); lastID != sessionID {
			t.Fatalf("sessionPath 末项应为自身 %q，得到 %q", sessionID, lastID)
		}
		for _, item := range path {
			if title, _ := item["title"].(string); strings.TrimSpace(title) == "" {
				t.Fatalf("sessionPath 存在空标题: %v", path)
			}
		}
	}
	if !(firstIndex["main"] >= 0 && firstIndex["main"] < firstIndex[child] && firstIndex[child] < firstIndex[grand]) {
		t.Fatalf("聚合顺序应按 at 升序 main<child<grand，实际 firstIndex=%v", firstIndex)
	}

	// 聚合分页：limit=2 按最新→更旧推进，页内仍为时间正序，不重不漏。
	seen := map[string]bool{}
	page := 0
	before := ""
	var firstPageIDs []string
	for {
		page++
		if page > 20 {
			t.Fatalf("聚合分页超过 20 页仍未结束")
		}
		rawURL := ts.URL + "/api/messages?sessionId=main&includeChildren=true&limit=2"
		if before != "" {
			rawURL += "&before=" + before
		}
		status, body := httpGet(t, rawURL)
		if status != http.StatusOK {
			t.Fatalf("聚合分页 page%d: status = %d, body=%s", page, status, body)
		}
		payload := p1DecodeJSON(t, "aggregate page", body)
		rawMessages, _ := payload["messages"].([]any)
		var pageIDs []string
		for _, rawMessage := range rawMessages {
			message, _ := rawMessage.(map[string]any)
			id, _ := message["id"].(string)
			if id == "" {
				t.Fatalf("聚合分页消息缺少 id: %v", message)
			}
			if seen[id] {
				t.Fatalf("聚合分页重复消息 id: %s", id)
			}
			seen[id] = true
			pageIDs = append(pageIDs, id)
		}
		if page == 1 {
			firstPageIDs = pageIDs
		}
		if len(rawMessages) == 0 {
			break
		}
		hasMore, _ := payload["hasMore"].(bool)
		if !hasMore {
			break
		}
		before = p1StringField(t, "aggregate page", payload, "nextBefore")
	}
	if len(seen) != len(aggregate) {
		t.Fatalf("聚合分页覆盖 %d 条，全量 %d 条", len(seen), len(aggregate))
	}
	// 第一页应是最新的 2 条（页内时间正序）。
	if len(aggregate) >= 2 {
		wantNewest := p1MessageIDs(aggregate)[len(aggregate)-2:]
		if strings.Join(firstPageIDs, ",") != strings.Join(wantNewest, ",") {
			t.Fatalf("聚合第一页 = %v, want 最新两条 %v", firstPageIDs, wantNewest)
		}
	}

	// 叶子会话自身聚合只含自己。
	leaf := p1Messages(t, ts.URL+"/api/messages?sessionId="+grand+"&includeChildren=true")
	if len(leaf) != 2 {
		t.Fatalf("孙会话聚合应只含自身 2 条，实际 %d", len(leaf))
	}
	for _, message := range leaf {
		if sessionID, _ := message["sessionId"].(string); sessionID != grand {
			t.Fatalf("孙会话聚合泄漏其它会话消息: %v", message)
		}
	}
}

// TestP1ConvChatRequestValidation 覆盖 AC-CONV-005/006 的入参边界：空文本、超长文本、
// 超大 body、非法 JSON、引用不存在的消息都必须 4xx 且不落脏消息。
func TestP1ConvChatRequestValidation(t *testing.T) {
	_, ts := newM2App(t, nil, nil)

	status, body := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{"text": "   "})
	p1AssertErrorEnvelope(t, "chat 空文本", status, body, http.StatusBadRequest, "bad_request")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{"text": strings.Repeat("长", 4001)})
	p1AssertErrorEnvelope(t, "chat 超长文本", status, body, http.StatusBadRequest, "bad_request")
	oversized := `{"text":"` + strings.Repeat("x", 70000) + `"}`
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", oversized)
	p1AssertErrorEnvelope(t, "chat 超大 body", status, body, http.StatusRequestEntityTooLarge, "body_too_large")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", "{")
	p1AssertErrorEnvelope(t, "chat 非法 JSON", status, body, http.StatusBadRequest, "bad_request")
	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{
		"text": "引用不存在的消息", "replyToMessageId": "msg-p1-missing",
	})
	p1AssertErrorEnvelope(t, "chat 引用不存在消息", status, body, http.StatusBadRequest, "bad_request")

	// AC-CONV-00N-02：失败请求不能留下脏消息（尤其不能有 streaming 占位）。
	if messages := listMessages(t, ts.URL, "main"); len(messages) != 0 {
		t.Fatalf("失败请求写入了脏数据: %v", messages)
	}

	status, body = p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{"text": "合法消息"})
	if status != http.StatusAccepted {
		t.Fatalf("chat 合法消息: status = %d, body=%s", status, body)
	}
	payload := p1DecodeJSON(t, "chat accepted", body)
	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("chat 响应 ok 应为 true: %s", body)
	}
	messageID := p1StringField(t, "chat accepted", payload, "messageId")
	waitForReplyDone(t, ts.URL, "main")
	user := p1MessageByID(listMessages(t, ts.URL, "main"), messageID)
	if user == nil {
		t.Fatalf("202 返回的 messageId 应能查到用户消息")
	}
}

// p1WaitModelRequests 轮询模型请求数：多轮用例不能用 waitForReplyDone（它看到上一轮
// done 消息就会提前返回），必须以模型真实调用次数为准。
func p1WaitModelRequests(t *testing.T, provider *llm.Mock, want int) []llm.ChatRequest {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		requests := provider.Requests()
		if len(requests) >= want {
			return requests
		}
		if time.Now().After(deadline) {
			t.Fatalf("等待模型请求数 %d 超时，当前 %d", want, len(requests))
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// p1WaitDoneAgentCount 轮询某个会话里 status=done 的 agent 消息数。
func p1WaitDoneAgentCount(t *testing.T, baseURL, sessionID string, want int) []map[string]any {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		messages := listMessages(t, baseURL, sessionID)
		done := 0
		for _, message := range messages {
			role, _ := message["role"].(string)
			status, _ := message["status"].(string)
			if role == "agent" && status == "done" {
				done++
			}
		}
		if done >= want {
			return messages
		}
		if time.Now().After(deadline) {
			t.Fatalf("等待会话 %s 的 done agent 消息数 %d 超时，当前 %d: %v", sessionID, want, done, p1MessageIDs(messages))
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// TestP1ConvConversationContextAcrossTurns 覆盖 AC-CONV-004/005：多轮对话时后端把
// system、历史 user/assistant、本轮 user 按序回传给模型（真实上下文，不是只看当前句）。
func TestP1ConvConversationContextAcrossTurns(t *testing.T) {
	provider := llm.NewMock()
	_, ts := newM2App(t, provider, nil)

	if status, _ := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{
		"sessionId": "main", "text": "P1-ALPHA 是项目代号",
	}); status != http.StatusAccepted {
		t.Fatalf("turn1: status = %d", status)
	}
	p1WaitModelRequests(t, provider, 1)
	p1WaitDoneAgentCount(t, ts.URL, "main", 1)
	if status, _ := p1RequestJSON(t, http.MethodPost, ts.URL+"/api/chat", map[string]any{
		"sessionId": "main", "text": "请复述项目代号 P1-ALPHA",
	}); status != http.StatusAccepted {
		t.Fatalf("turn2: status = %d", status)
	}
	p1WaitModelRequests(t, provider, 2)
	p1WaitDoneAgentCount(t, ts.URL, "main", 2)

	requests := provider.Requests()
	if len(requests) < 2 {
		t.Fatalf("模型请求数 = %d, want >= 2", len(requests))
	}
	first, second := requests[0], requests[len(requests)-1]
	if len(second.Messages) == 0 || second.Messages[0].Role != "system" {
		t.Fatalf("请求首条应为 system，实际 %+v", second.Messages)
	}

	// 第一轮只带本轮 user，不带 assistant 历史。
	userCount := 0
	for _, message := range first.Messages {
		if message.Role == "user" {
			userCount++
		}
		if message.Role == "assistant" {
			t.Fatalf("第一轮请求不应包含 assistant 历史: %+v", first.Messages)
		}
	}
	if userCount != 1 {
		t.Fatalf("第一轮 user 消息数 = %d, want 1", userCount)
	}

	firstUserIndex, assistantIndex, secondUserIndex := -1, -1, -1
	for index, message := range second.Messages {
		switch message.Role {
		case "user":
			if strings.Contains(message.Content, "P1-ALPHA") && firstUserIndex == -1 {
				firstUserIndex = index
			}
			if strings.Contains(message.Content, "请复述") && secondUserIndex == -1 {
				secondUserIndex = index
			}
		case "assistant":
			if assistantIndex == -1 && strings.Contains(message.Content, "P1-ALPHA") {
				assistantIndex = index
			}
		}
	}
	if firstUserIndex < 0 {
		t.Fatalf("第二轮请求缺少历史 user 消息: %+v", second.Messages)
	}
	if assistantIndex < 0 {
		t.Fatalf("第二轮请求缺少历史 assistant 回复: %+v", second.Messages)
	}
	if secondUserIndex < 0 {
		t.Fatalf("第二轮请求缺少本轮 user 消息: %+v", second.Messages)
	}
	if !(firstUserIndex < assistantIndex && assistantIndex < secondUserIndex) {
		t.Fatalf("上下文顺序错误 firstUser=%d assistant=%d currentUser=%d", firstUserIndex, assistantIndex, secondUserIndex)
	}
}

// TestP1ConvMessagePersistenceShapeAcrossRestart 覆盖 AC-CONV-004-01：消息分类
// （@@CATEGORY 标记转 category 字段）、sessionPath/agentId 投影与跨重启持久化一致。
func TestP1ConvMessagePersistenceShapeAcrossRestart(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	const userText = "mock:category=requirement 持久化分类消息"
	if status, _ := postChat(t, ts.URL, userText); status != http.StatusAccepted {
		t.Fatalf("chat: status = %d", status)
	}
	messages := waitForReplyDone(t, ts.URL, "main")
	user := p1UserMessage(messages, userText)
	if user == nil {
		t.Fatalf("缺少用户消息: %v", messages)
	}
	userID := p1StringField(t, "user", user, "id")
	if category, _ := user["category"].(string); category != "" {
		t.Fatalf("用户消息 category 应为空，得到 %q", category)
	}
	var reply map[string]any
	for _, message := range messages {
		if role, _ := message["role"].(string); role == "agent" {
			reply = message
		}
	}
	if reply == nil {
		t.Fatalf("缺少 agent 回复: %v", messages)
	}
	replyID := p1StringField(t, "reply", reply, "id")
	if status, _ := reply["status"].(string); status != "done" {
		t.Fatalf("agent 消息 status = %q, want done", status)
	}
	if category, _ := reply["category"].(string); category != "requirement" {
		t.Fatalf("agent 消息 category = %q, want requirement（@@CATEGORY 标记未转成字段）", category)
	}
	if text, _ := reply["text"].(string); strings.Contains(text, "@@CATEGORY") {
		t.Fatalf("落库正文不应包含分类标记: %q", text)
	}
	if agentID, _ := reply["agentId"].(string); agentID == "" {
		t.Fatalf("agent 消息缺少 agentId: %v", reply)
	}
	path := p1SessionPathItems(t, "reply", reply)
	if len(path) != 1 {
		t.Fatalf("主会话消息 sessionPath 长度 = %d, want 1", len(path))
	}
	if rootID, _ := path[0]["id"].(string); rootID != "main" {
		t.Fatalf("sessionPath 首项 = %q, want main", rootID)
	}
	for _, key := range []string{"id", "sessionId", "role", "text", "at", "status", "attachments", "taskId", "category"} {
		if _, ok := reply[key]; !ok {
			t.Fatalf("agent 消息缺少契约字段 %q: %v", key, reply)
		}
	}
	if at, _ := reply["at"].(float64); at <= 0 {
		t.Fatalf("agent 消息 at 应 > 0: %v", reply)
	}
	// 说明：done 消息不写 messages.finished_at（仅失败/超时路径写），finishedAt 允许缺省。
	if finishedAt, ok := reply["finishedAt"].(float64); ok && finishedAt < 0 {
		t.Fatalf("finishedAt 非法: %v", reply)
	}
	if ids := p1MessageIDs(messages); len(ids) != 2 || ids[0] != userID || ids[1] != replyID {
		t.Fatalf("消息顺序/唯一性异常: %v", ids)
	}

	before := p1Messages(t, ts.URL+"/api/messages?sessionId=main")
	beforeIDs := p1MessageIDs(before)

	// 停服重启：同一 SIMO_HOME 下 SQLite 持久化，消息投影必须一致。
	ts.Close()
	a.Stop(context.Background())
	a.Close()

	restarted, err := buildAppWithProvider(context.Background(), a.cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatalf("重启 app 失败: %v", err)
	}
	defer restarted.Close()
	if err := restarted.registry.Start(context.Background()); err != nil {
		t.Fatalf("重启 registry 失败: %v", err)
	}
	ts2 := httptest.NewServer(restarted.handler)
	defer ts2.Close()

	after := p1Messages(t, ts2.URL+"/api/messages?sessionId=main")
	if gotIDs := p1MessageIDs(after); strings.Join(gotIDs, ",") != strings.Join(beforeIDs, ",") {
		t.Fatalf("重启后消息集合/顺序变化: before=%v after=%v", beforeIDs, gotIDs)
	}
	afterReply := p1MessageByID(after, replyID)
	if afterReply == nil {
		t.Fatalf("重启后丢失 agent 消息 %s", replyID)
	}
	if text, _ := afterReply["text"].(string); text != reply["text"] {
		t.Fatalf("重启后 agent 正文变化: before=%q after=%q", reply["text"], text)
	}
	if status, _ := afterReply["status"].(string); status != "done" {
		t.Fatalf("重启后 agent status = %q, want done", status)
	}
	if category, _ := afterReply["category"].(string); category != "requirement" {
		t.Fatalf("重启后 category = %q, want requirement", category)
	}
	if agentID, _ := afterReply["agentId"].(string); agentID != reply["agentId"] {
		t.Fatalf("重启后 agentId 变化: before=%v after=%v", reply["agentId"], agentID)
	}
	afterPath := p1SessionPathItems(t, "after restart", afterReply)
	if len(afterPath) != 1 {
		t.Fatalf("重启后 sessionPath 长度 = %d, want 1", len(afterPath))
	}
	if rootID, _ := afterPath[0]["id"].(string); rootID != "main" {
		t.Fatalf("重启后 sessionPath 首项 = %q, want main", rootID)
	}
	if p1MessageByID(after, userID) == nil {
		t.Fatalf("重启后丢失 user 消息 %s", userID)
	}
}
