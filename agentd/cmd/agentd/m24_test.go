package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"agentd/internal/platform/config"
)

func TestM24TeamV1InternalRouting(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "mock:team 建一个团队并路由消息"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/sessions/main/team")
	if status != http.StatusOK || !strings.Contains(string(body), `"team"`) {
		t.Fatalf("session team = %d %s", status, body)
	}
	var summary struct {
		Team struct {
			ID string `json:"id"`
		} `json:"team"`
		Members []struct {
			SessionID string `json:"sessionId"`
			AgentID   string `json:"agentId"`
			Name      string `json:"name"`
		} `json:"members"`
	}
	if err := json.Unmarshal(body, &summary); err != nil || summary.Team.ID == "" || len(summary.Members) < 2 {
		t.Fatalf("team summary = %v %s", err, body)
	}
	status, body = httpGet(t, ts.URL+"/api/teams/"+summary.Team.ID+"/messages")
	if status != http.StatusOK || !strings.Contains(string(body), `"fromSessionId"`) {
		t.Fatalf("team messages = %d %s", status, body)
	}
	// 内部消息不进入用户主窗口。
	_, mainBody := httpGet(t, ts.URL+"/api/messages?sessionId=main")
	if strings.Contains(string(mainBody), "请确认交付物标准") {
		t.Fatalf("内部消息泄漏到主窗口: %s", mainBody)
	}
	// 用户可进入成员会话。
	memberSession := summary.Members[0].SessionID
	status, body = httpGet(t, ts.URL+"/api/messages?sessionId="+memberSession)
	if status != http.StatusOK {
		t.Fatalf("member session messages = %d %s", status, body)
	}
}
