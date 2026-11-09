package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestUI1AgentsAndSessionOwner(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := httpGet(t, ts.URL+"/api/agents")
	if status != http.StatusOK {
		t.Fatalf("agents = %d %s", status, body)
	}
	var agents struct {
		Agents []struct {
			ID      string   `json:"id"`
			Name    string   `json:"name"`
			Role    string   `json:"role"`
			Persona string   `json:"persona"`
			Model   string   `json:"model"`
			Icon    string   `json:"icon"`
			Tone    string   `json:"tone"`
			Tools   []string `json:"tools"`
		} `json:"agents"`
	}
	if err := json.Unmarshal(body, &agents); err != nil || len(agents.Agents) < 4 {
		t.Fatalf("agents JSON = %s", body)
	}
	ids := map[string]bool{}
	for _, agent := range agents.Agents {
		if agent.ID == "" || agent.Name == "" || agent.Tone == "" {
			t.Fatalf("agent 字段缺失: %+v", agent)
		}
		ids[agent.ID] = true
	}
	if !ids["simo"] || !ids["researcher"] || !ids["builder"] || !ids["reviewer"] {
		t.Fatalf("agent ids = %v", ids)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions/main/owner")
	if status != http.StatusOK || !strings.Contains(string(body), `"ownerAgentId":"simo"`) {
		t.Fatalf("owner default = %d %s", status, body)
	}
	if status, body := postJSONMethod(t, ts.URL+"/api/sessions/main/owner", http.MethodPut, map[string]any{"agentId": "researcher"}); status != http.StatusOK {
		t.Fatalf("owner put = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions/main/owner")
	if status != http.StatusOK || !strings.Contains(string(body), `"ownerAgentId":"researcher"`) {
		t.Fatalf("owner get = %d %s", status, body)
	}
	if status, body := postJSONMethod(t, ts.URL+"/api/sessions/main/owner", http.MethodPut, map[string]any{"agentId": "unknown"}); status != http.StatusBadRequest {
		t.Fatalf("invalid owner = %d %s", status, body)
	}
	// 新 agent 回复带 agentId。
	if status, _ := postChat(t, ts.URL, "owner test"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	messages := listMessages(t, ts.URL, "main")
	for _, message := range messages {
		if message["role"] == "agent" {
			if message["agentId"] != "researcher" {
				t.Fatalf("agent message agentId = %+v", message)
			}
		}
	}
}

func postJSONMethod(t *testing.T, path, method string, payload any) (int, []byte) {
	t.Helper()
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(method, path, strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data := make([]byte, 0, 512)
	buf := make([]byte, 512)
	for {
		n, readErr := resp.Body.Read(buf)
		data = append(data, buf[:n]...)
		if readErr != nil {
			break
		}
	}
	return resp.StatusCode, data
}

func TestUI1SessionSearchAndPin(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	title := "搜索目标-" + time.Now().Format("150405")
	sessionID := createSession(t, ts.URL, "main", title)
	status, body := httpGet(t, ts.URL+"/api/sessions?q="+url.QueryEscape("搜索目标"))
	if status != http.StatusOK || !strings.Contains(string(body), sessionID) {
		t.Fatalf("search sessions = %d %s", status, body)
	}
	if status, body := postJSONMethod(t, ts.URL+"/api/sessions/"+sessionID+"/pin", http.MethodPost, map[string]any{}); status != http.StatusOK {
		t.Fatalf("pin = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions?pinned=true")
	if status != http.StatusOK || !strings.Contains(string(body), sessionID) || !strings.Contains(string(body), `"pinned":true`) {
		t.Fatalf("pinned list = %d %s", status, body)
	}
	if status, body := postJSONMethod(t, ts.URL+"/api/sessions/"+sessionID+"/unpin", http.MethodPost, map[string]any{}); status != http.StatusOK {
		t.Fatalf("unpin = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions?pinned=false&q="+url.QueryEscape("搜索目标"))
	if status != http.StatusOK || !strings.Contains(string(body), sessionID) {
		t.Fatalf("unpinned list = %d %s", status, body)
	}
}

func TestUI1Stats(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "统计第一条"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	now := time.Now().UnixMilli()
	for _, metric := range []string{"messages", "tokens", "tasks"} {
		for _, granularity := range []string{"day", "week", "month"} {
			status, body := httpGet(t, ts.URL+"/api/stats?metric="+metric+"&granularity="+granularity)
			if status != http.StatusOK || !strings.Contains(string(body), `"buckets"`) ||
				!strings.Contains(string(body), `"bySession"`) || !strings.Contains(string(body), metric) {
				t.Fatalf("stats %s/%s = %d %s", metric, granularity, status, body)
			}
		}
	}
	status, body := httpGet(t, ts.URL+"/api/stats?metric=messages&granularity=day&from="+url.QueryEscape(time.UnixMilli(now-86400000).Format(time.RFC3339))+"&to="+url.QueryEscape(time.UnixMilli(now+3600000).Format(time.RFC3339))+"&sessionId=main")
	if status != http.StatusOK || !strings.Contains(string(body), `"messages"`) {
		t.Fatalf("stats range = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/stats?metric=tokens&granularity=day&from="+url.QueryEscape(time.UnixMilli(now-86400000).Format(time.RFC3339)))
	if status != http.StatusOK || !strings.Contains(string(body), `"reasoningTokens"`) {
		t.Fatalf("stats tokens = %d %s", status, body)
	}
	if status, _ := httpGet(t, ts.URL+"/api/stats?metric=bad"); status != http.StatusBadRequest {
		t.Fatalf("bad metric = %d", status)
	}
}
