package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func TestM20ActionRegistryAndExecute(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := httpGet(t, ts.URL+"/api/actions")
	if status != http.StatusOK {
		t.Fatalf("actions = %d %s", status, body)
	}
	var list struct {
		Actions []struct {
			Name      string `json:"name"`
			Risk      string `json:"risk"`
			Params    any    `json:"params"`
			HTTPRoute string `json:"httpRoute"`
		} `json:"actions"`
	}
	if err := json.Unmarshal(body, &list); err != nil || len(list.Actions) < 50 {
		t.Fatalf("actions JSON = %v %s", err, body)
	}
	for _, action := range list.Actions {
		if action.Name == "" || action.Risk == "" || action.HTTPRoute == "" {
			t.Fatalf("动作字段缺失: %+v", action)
		}
	}
	status, body = httpGet(t, ts.URL+"/api/actions/session.list")
	if status != http.StatusOK || !strings.Contains(string(body), `"toolName":"simo_session_list"`) {
		t.Fatalf("describe = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/actions/session.list", map[string]any{})
	if status != http.StatusOK || !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("action session.list = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/actions/ui.theme.set", map[string]any{"theme": "light-tech", "sessionId": "main"})
	if status != http.StatusOK || !strings.Contains(string(body), `"light-tech"`) {
		t.Fatalf("ui.theme.set = %d %s", status, body)
	}
	status, _ = postJSON(t, ts.URL+"/api/actions/session.delete", map[string]any{"id": "main"})
	if status != http.StatusForbidden {
		t.Fatalf("R4 action = %d", status)
	}
	status, body = httpGet(t, ts.URL+"/api/debug/routes")
	if status != http.StatusOK || !strings.Contains(string(body), `"routes"`) {
		t.Fatalf("debug routes = %d %s", status, body)
	}
}

func TestM20NativeActionTools(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := httpGet(t, ts.URL+"/api/actions")
	if status != http.StatusOK || !strings.Contains(string(body), `"toolName":"simo_session_list"`) {
		t.Fatalf("未注册 simo_session_list 原生工具: %d %s", status, body)
	}
}

func TestM20ToolNamesValidForProvider(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "hello"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/debug/last-llm-request")
	if status != http.StatusOK {
		t.Fatalf("debug request = %d %s", status, body)
	}
	var payload struct {
		Request struct {
			Tools []struct {
				Function struct {
					Name string `json:"name"`
				} `json:"function"`
			} `json:"tools"`
		} `json:"request"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("debug JSON: %s", body)
	}
	valid := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	for _, tool := range payload.Request.Tools {
		if !valid.MatchString(tool.Function.Name) {
			t.Fatalf("非法工具名: %q", tool.Function.Name)
		}
	}
}
