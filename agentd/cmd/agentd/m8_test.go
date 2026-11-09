package main

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
	"agentd/internal/platform/llm"
	platformlog "agentd/internal/platform/log"
)

type uploadSpec struct {
	Name    string
	Content []byte
	Mime    string
}

func uploadMultipart(t *testing.T, baseURL, sessionID string, files ...uploadSpec) (int, []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for _, file := range files {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Disposition", `form-data; name="file"; filename="`+strings.ReplaceAll(file.Name, `"`, `'`)+`"`)
		header.Set("Content-Type", file.Mime)
		part, err := writer.CreatePart(header)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = part.Write(file.Content)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, baseURL+"/api/uploads?sessionId="+sessionID, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out bytes.Buffer
	_, _ = out.ReadFrom(resp.Body)
	return resp.StatusCode, out.Bytes()
}

func uploadAttachments(t *testing.T, baseURL, sessionID string, files ...uploadSpec) []struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Mime      string `json:"mime"`
	Size      int64  `json:"size"`
	CreatedAt int64  `json:"createdAt"`
} {
	t.Helper()
	status, body := uploadMultipart(t, baseURL, sessionID, files...)
	if status != http.StatusOK {
		t.Fatalf("upload = %d %s", status, body)
	}
	var payload struct {
		OK          bool `json:"ok"`
		Attachments []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Mime      string `json:"mime"`
			Size      int64  `json:"size"`
			CreatedAt int64  `json:"createdAt"`
		} `json:"attachments"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || !payload.OK || len(payload.Attachments) == 0 {
		t.Fatalf("upload payload = %v %s", err, body)
	}
	return payload.Attachments
}

func TestM8UploadAttachmentRoundTrip(t *testing.T) {
	a, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	attachments := uploadAttachments(t, ts.URL, "main", uploadSpec{
		Name: "../../evil.txt", Content: []byte("hello attachment"), Mime: "text/plain",
	})
	att := attachments[0]
	if att.Name != "evil.txt" || att.Mime != "text/plain" || att.Size != int64(len("hello attachment")) {
		t.Fatalf("attachment = %+v", att)
	}
	files, err := os.ReadDir(filepath.Join(a.sandbox.Workspace, "uploads", "main"))
	if err != nil || len(files) == 0 {
		t.Fatalf("附件未落到 uploads: %v", err)
	}
	for _, file := range files {
		if !strings.HasPrefix(file.Name(), att.ID+"-") || !strings.HasSuffix(file.Name(), "-evil.txt") {
			t.Fatalf("存储文件名未净化/未带 attId: %s", file.Name())
		}
	}

	status := postChatSessionWithAttachments(t, ts.URL, "main", "请总结附件", []string{att.ID})
	if status != http.StatusAccepted {
		t.Fatalf("chat with attachment = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	messages := listMessages(t, ts.URL, "main")
	found := false
	for _, message := range messages {
		if message["role"] != "user" {
			continue
		}
		items, ok := message["attachments"].([]any)
		if ok && len(items) == 1 {
			first, _ := items[0].(map[string]any)
			if first["id"] == att.ID && first["name"] == "evil.txt" {
				found = true
			}
		}
	}
	if !found {
		t.Fatalf("user message 缺少 attachments: %+v", messages)
	}

	status, body := httpGet(t, ts.URL+"/api/uploads/"+att.ID+"/meta")
	if status != http.StatusOK || !strings.Contains(string(body), att.ID) {
		t.Fatalf("meta = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/uploads/"+att.ID)
	if status != http.StatusOK || string(body) != "hello attachment" {
		t.Fatalf("content = %d %s", status, body)
	}

	// 模型可见内容含附件说明（read_file 相对路径）。
	status, body = httpGet(t, ts.URL+"/api/debug/last-llm-request")
	if status != http.StatusOK || !strings.Contains(string(body), "[附件] evil.txt") ||
		!strings.Contains(string(body), "workspace/uploads/main/") {
		t.Fatalf("模型上下文缺少附件说明: %d %s", status, body)
	}
}

func postChatSessionWithAttachments(t *testing.T, baseURL, sessionID, text string, attachments []string) int {
	t.Helper()
	status, _ := postJSON(t, baseURL+"/api/chat", map[string]any{
		"sessionId": sessionID, "text": text, "attachments": attachments,
	})
	return status
}

func TestM8UploadLimitsAndIsolation(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	// 6 个附件超过单消息上限。
	six := make([]uploadSpec, 6)
	for i := range six {
		six[i] = uploadSpec{Name: "a.txt", Content: []byte("a"), Mime: "text/plain"}
	}
	if status, body := uploadMultipart(t, ts.URL, "main", six...); status != http.StatusBadRequest {
		t.Fatalf("6 files = %d %s", status, body)
	}
	// 超过 20 MiB。
	big := uploadSpec{Name: "big.bin", Content: bytes.Repeat([]byte("x"), (20<<20)+1), Mime: "application/octet-stream"}
	if status, body := uploadMultipart(t, ts.URL, "main", big); status != http.StatusRequestEntityTooLarge {
		t.Fatalf("big file = %d %s", status, body)
	}
	// sessionId 路径穿越。
	if status, body := uploadMultipart(t, ts.URL, "../main", uploadSpec{Name: "a.txt", Content: []byte("a"), Mime: "text/plain"}); status != http.StatusBadRequest {
		t.Fatalf("traversal sessionId = %d %s", status, body)
	}

	attachments := uploadAttachments(t, ts.URL, "main", uploadSpec{Name: "only.txt", Content: []byte("x"), Mime: "text/plain"})
	att := attachments[0]
	// 其他会话不能引用 main 的 upload。
	if status := postChatSessionWithAttachments(t, ts.URL, "other-session", "引用别的会话附件", []string{att.ID}); status != http.StatusBadRequest {
		t.Fatalf("cross-session attachment = %d", status)
	}
	// 文件名净化后的存储目录仍限定在 workspace/uploads/main。
	files, _ := os.ReadDir(filepath.Join(a.sandbox.Workspace, "uploads", "main"))
	if len(files) == 0 {
		t.Fatal("uploads 目录为空")
	}
}

func TestM8UploadDownloadPathTraversal(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for _, path := range []string{
		"/api/uploads/..%2F..%2Fagentd.db",
		"/api/uploads/%2e%2e%2fagentd.db",
		"/api/uploads/not-exist",
	} {
		status, _ := httpGet(t, ts.URL+path)
		if status != http.StatusNotFound {
			t.Fatalf("traversal %s = %d", path, status)
		}
	}
}

func TestM8AttachmentWSAndRestartPersistence(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	attachments := uploadAttachments(t, ts.URL, "main", uploadSpec{Name: "ws.txt", Content: []byte("ws"), Mime: "text/plain"})
	att := attachments[0]
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main")
	if hello := readWS(t, ctx, conn); hello.Type != "hello" {
		t.Fatalf("hello = %q", hello.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})
	sendWS(t, ctx, conn, map[string]any{"type": "chat", "data": map[string]any{
		"sessionId": "main", "text": "WS 带附件", "attachments": []string{att.ID},
	}})
	for {
		frame := readWS(t, ctx, conn)
		if frame.Type == "reply.done" || frame.Type == "message.done" {
			break
		}
		if frame.Type == "error" {
			t.Fatalf("WS chat 返回错误: %s", frame.Data)
		}
	}
	waitForAgentDone(t, ts.URL, "main")
	messages := listMessages(t, ts.URL, "main")
	found := false
	for _, message := range messages {
		if message["role"] == "user" && strings.Contains(message["text"].(string), "WS 带附件") {
			items, _ := message["attachments"].([]any)
			if len(items) == 1 {
				found = true
			}
		}
	}
	if !found {
		t.Fatalf("WS 附件未关联: %+v", messages)
	}

	ts.Close()
	_ = a.Stop(context.Background())
	if err := a.Close(); err != nil {
		t.Fatal(err)
	}
	app2, err := buildAppWithProvider(context.Background(), a.cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()
	defer app2.Close()
	messages = listMessages(t, ts2.URL, "main")
	found = false
	for _, message := range messages {
		items, _ := message["attachments"].([]any)
		if len(items) == 1 {
			found = true
		}
	}
	if !found {
		t.Fatalf("重启后附件丢失: %+v", messages)
	}
	status, body := httpGet(t, ts2.URL+"/api/uploads/"+att.ID)
	if status != http.StatusOK || string(body) != "ws" {
		t.Fatalf("重启后下载 = %d %s", status, body)
	}
}
