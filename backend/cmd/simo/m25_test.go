package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func TestM25TeamV2TemplateAndTrigger(t *testing.T) {
	a, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/actions/team.template.upsert", map[string]any{
		"name": "调研团队",
		"roles": []map[string]any{
			{"roleKey": "researcher", "title": "研究员", "roleType": "generic", "agentId": "researcher"},
			{"roleKey": "reviewer", "title": "审校", "roleType": "template"},
		},
	})
	if status != http.StatusOK {
		t.Fatalf("template upsert = %d %s", status, body)
	}
	var template struct {
		Data struct {
			ID    string `json:"id"`
			Roles []struct {
				RoleKey string `json:"roleKey"`
			} `json:"roles"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &template); err != nil || template.Data.ID == "" || len(template.Data.Roles) != 2 {
		t.Fatalf("template JSON = %v %s", err, body)
	}
	status, body = postJSON(t, ts.URL+"/api/actions/team.create", map[string]any{
		"sessionId": "main", "templateId": template.Data.ID,
	})
	if status != http.StatusOK {
		t.Fatalf("team create = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Team struct {
				ID string `json:"id"`
			} `json:"team"`
			Members []struct {
				ID        string `json:"id"`
				SessionID string `json:"sessionId"`
				AgentID   string `json:"agentId"`
				RoleType  string `json:"roleType"`
			} `json:"members"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Data.Team.ID == "" || len(created.Data.Members) != 2 {
		t.Fatalf("team create JSON = %v %s", err, body)
	}
	teamID := created.Data.Team.ID
	var generic, templateMember struct {
		ID, SessionID, AgentID, RoleType string
	}
	for _, member := range created.Data.Members {
		if member.RoleType == "generic" {
			generic.ID, generic.SessionID, generic.AgentID = member.ID, member.SessionID, member.AgentID
		} else {
			templateMember.ID, templateMember.SessionID, templateMember.AgentID = member.ID, member.SessionID, member.AgentID
		}
	}
	if generic.AgentID != "agent:researcher" || !strings.HasPrefix(templateMember.AgentID, "agent:reviewer-") {
		t.Fatalf("角色身份不符合预期 generic=%s template=%s", generic.AgentID, templateMember.AgentID)
	}
	status, body = httpGet(t, ts.URL+"/api/teams/"+teamID)
	if status != http.StatusOK || !strings.Contains(string(body), `"template"`) || !strings.Contains(string(body), `"roles"`) {
		t.Fatalf("team page = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/actions/team.owner.set", map[string]any{
		"teamId": teamID, "sessionId": templateMember.SessionID, "agentId": "reviewer",
	})
	if status != http.StatusOK {
		t.Fatalf("owner set = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/actions/team.trigger.create", map[string]any{
		"teamId": teamID, "fromMemberId": generic.ID, "toSessionId": templateMember.SessionID,
		"content": "请审校交付物", "idempotencyKey": "trigger-" + teamID,
	})
	if status != http.StatusOK {
		t.Fatalf("trigger create = %d %s", status, body)
	}
	var trigger struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &trigger)
	status, body = postJSON(t, ts.URL+"/api/actions/team.trigger.fire", map[string]any{
		"id": trigger.Data.ID, "artifactId": "artifact-1", "summary": "交付物已就绪",
	})
	if status != http.StatusOK || !strings.Contains(string(body), `"fired"`) {
		t.Fatalf("trigger fire = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/teams/"+teamID+"/deliverables")
	if status != http.StatusOK || !strings.Contains(string(body), `"artifact-1"`) {
		t.Fatalf("deliverables = %d %s", status, body)
	}
	// 幂等触发不重复创建交付物。
	_, firstDeliverables := httpGet(t, ts.URL+"/api/teams/"+teamID+"/deliverables")
	_, _ = postJSON(t, ts.URL+"/api/actions/team.trigger.fire", map[string]any{"id": trigger.Data.ID})
	_, secondDeliverables := httpGet(t, ts.URL+"/api/teams/"+teamID+"/deliverables")
	if strings.Count(string(firstDeliverables), `"id"`) != strings.Count(string(secondDeliverables), `"id"`) {
		t.Fatalf("触发不幂等: %s -> %s", firstDeliverables, secondDeliverables)
	}
	var teamEventCount int
	_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM events WHERE type LIKE 'team.%'`).Scan(&teamEventCount)
	if teamEventCount < 3 {
		t.Fatalf("团队审计事件未落库: %d", teamEventCount)
	}
	for _, eventType := range []string{"team.template.applied", "team.created", "team.member.added", "team.owner.changed", "team.trigger.fired"} {
		var count int
		_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM events WHERE type=?`, eventType).Scan(&count)
		if count < 1 {
			t.Fatalf("团队事件未写入: %s", eventType)
		}
	}
}
