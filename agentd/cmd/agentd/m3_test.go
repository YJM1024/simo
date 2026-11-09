package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
	"agentd/internal/platform/llm"
	platformlog "agentd/internal/platform/log"
)

func memoryItems(t *testing.T, baseURL, query string) []map[string]any {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/memory/items?"+query)
	if status != http.StatusOK {
		t.Fatalf("memory items %s = %d body=%s", query, status, body)
	}
	var payload struct {
		OK    bool             `json:"ok"`
		Items []map[string]any `json:"items"`
		Total int              `json:"total"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("memory items JSON: %v (%s)", err, body)
	}
	if !payload.OK {
		t.Fatalf("memory items 缺少 ok=true: %s", body)
	}
	if payload.Total != len(payload.Items) {
		t.Fatalf("total=%d items=%d", payload.Total, len(payload.Items))
	}
	return payload.Items
}

func TestM3RememberVisibilityAndFTS(t *testing.T) {
	_, ts := newM2App(t, llm.NewMock(), nil)
	if status, _ := postChat(t, ts.URL, "记住：我的项目代号是 Atlas"); status != http.StatusAccepted {
		t.Fatalf("POST remember = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")

	items := memoryItems(t, ts.URL, "scope=global")
	if len(items) != 1 {
		t.Fatalf("remember 后 items=%v", items)
	}
	item := items[0]
	if !strings.Contains(item["content"].(string), "Atlas") {
		t.Fatalf("content 缺唯一串: %v", item)
	}
	if item["source"] != "user" || item["authority"] != "user_confirmed" {
		t.Fatalf("source/authority = %v/%v", item["source"], item["authority"])
	}
	if item["status"] != "active" || item["version"].(float64) != 1 {
		t.Fatalf("status/version = %v/%v", item["status"], item["version"])
	}

	// 中文长词（trigram）与短词（LIKE）都命中。
	long := memoryItems(t, ts.URL, "scope=global&q="+url.QueryEscape("项目代号"))
	if len(long) != 1 {
		t.Fatalf("长词检索 = %v", long)
	}
	short := memoryItems(t, ts.URL, "scope=global&q="+url.QueryEscape("代号"))
	if len(short) != 1 {
		t.Fatalf("2 字检索 = %v", short)
	}
	// scope 隔离：不存在的 task 不带出 global。
	if got := memoryItems(t, ts.URL, "scope="+url.QueryEscape("task:nope")); len(got) != 0 {
		t.Fatalf("task:nope 应空，得到 %v", got)
	}

	// scopes 只读。
	status, body := httpGet(t, ts.URL+"/api/memory/scopes")
	if status != http.StatusOK || !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("scopes = %d %s", status, body)
	}

	// 无写接口：POST/PUT/PATCH/DELETE /api/memory* 必须 404 JSON。
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		req, _ := http.NewRequest(method, ts.URL+"/api/memory/items", strings.NewReader(`{"content":"x"}`))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		bodyBytes := make([]byte, 0, 64)
		buf := make([]byte, 64)
		for {
			n, readErr := resp.Body.Read(buf)
			bodyBytes = append(bodyBytes, buf[:n]...)
			if readErr != nil {
				break
			}
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("%s /api/memory/items = %d", method, resp.StatusCode)
		}
		if strings.Contains(string(bodyBytes), `"ok":true`) {
			t.Fatalf("写接口不得返回 ok:true: %s", bodyBytes)
		}
	}
}

func TestM3ConflictVisibleAndItemsShape(t *testing.T) {
	_, ts := newM2App(t, llm.NewMock(), nil)
	for _, text := range []string{"记住：我的项目代号是 Atlas", "改成：我的项目代号是 Orion"} {
		if status, _ := postChat(t, ts.URL, text); status != http.StatusAccepted {
			t.Fatalf("POST %q = %d", text, status)
		}
		waitForAgentDone(t, ts.URL, "main")
	}
	status, body := httpGet(t, ts.URL+"/api/memory/conflicts")
	if status != http.StatusOK {
		t.Fatalf("conflicts = %d", status)
	}
	var payload struct {
		OK        bool `json:"ok"`
		Conflicts []struct {
			ID     string `json:"id"`
			Scope  string `json:"scope"`
			Kind   string `json:"kind"`
			Status string `json:"status"`
			Items  []struct {
				ID        string `json:"id"`
				Content   string `json:"content"`
				Version   int    `json:"version"`
				Authority string `json:"authority"`
			} `json:"items"`
		} `json:"conflicts"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || !payload.OK || len(payload.Conflicts) == 0 {
		t.Fatalf("conflicts JSON: %v (%s)", err, body)
	}
	c := payload.Conflicts[0]
	if c.Status != "disputed" || len(c.Items) != 2 || c.Scope != "global" {
		t.Fatalf("conflict shape = %+v", c)
	}
	if c.Items[0].Content == "" || c.Items[1].Content == "" {
		t.Fatalf("conflict items content = %+v", c.Items)
	}
}

func TestM3MemoryInjectionIntoChat(t *testing.T) {
	provider := llm.NewMockWithScripts(llm.MockScript{Deltas: []string{"Atlas 是你的项目代号。"}})
	_, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "记住：我的项目代号是 Atlas"); status != http.StatusAccepted {
		t.Fatalf("POST remember = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	if status, _ := postChat(t, ts.URL, "我的项目代号是什么？"); status != http.StatusAccepted {
		t.Fatalf("POST query = %d", status)
	}
	waitForAgentCount(t, ts.URL, "main", 2)

	requests := provider.Requests()
	if len(requests) == 0 {
		t.Fatal("没有模型请求")
	}
	found := false
	for _, msg := range requests[len(requests)-1].Messages {
		if strings.Contains(msg.Content, "[memory:") && strings.Contains(msg.Content, "不可信数据") {
			found = true
		}
	}
	if !found {
		t.Fatalf("记忆未注入 T3 系统消息: %+v", requests[len(requests)-1].Messages)
	}
}

func waitForAgentCount(t *testing.T, baseURL, sessionID string, want int) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		count := 0
		for _, msg := range listMessages(t, baseURL, sessionID) {
			if msg["role"] == "agent" && msg["status"] == "done" {
				count++
			}
		}
		if count >= want {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("等待 agent done 数量 %d 超时", want)
}

func TestM3RestartPersistence(t *testing.T) {
	home := t.TempDir()
	t.Setenv("AGENTD_HOME", home)
	t.Setenv("AGENTD_ADDR", "")
	t.Setenv("AGENTD_MODEL", "")
	t.Setenv("AGENTD_LLM", "mock")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatal(err)
	}
	app1, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	if err := app1.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts1 := httptest.NewServer(app1.handler)
	if status, _ := postChat(t, ts1.URL, "记住：我的项目代号是 Atlas"); status != http.StatusAccepted {
		t.Fatalf("POST remember = %d", status)
	}
	waitForAgentDone(t, ts1.URL, "main")
	ts1.Close()
	if err := app1.Stop(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := app1.Close(); err != nil {
		t.Fatal(err)
	}

	app2, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()
	items := memoryItems(t, ts2.URL, "scope=global")
	if len(items) != 1 || !strings.Contains(items[0]["content"].(string), "Atlas") {
		t.Fatalf("重启后记忆丢失: %v", items)
	}
}
