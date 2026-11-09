package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func viewTestSchema(sessionID, title string) map[string]any {
	return map[string]any{
		"schemaVersion": 1,
		"id":            "view-" + sessionID + "-demo",
		"sessionId":     sessionID,
		"title":         title,
		"layout": map[string]any{"kind": "grid", "columns": 12, "areas": []map[string]any{
			{"block": "progress-main", "colSpan": 12},
			{"block": "retry-action", "colSpan": 4},
		}},
		"blocks": []map[string]any{
			{"id": "progress-main", "type": "progress", "props": map[string]any{"title": "本周进度"},
				"data": map[string]any{"action": "task.list", "args": map[string]any{"sessionId": "$session"}}},
			{"id": "retry-action", "type": "action", "props": map[string]any{"label": "重试任务"},
				"actions": []map[string]any{{"id": "retry", "action": "task.retry", "args": map[string]any{"taskId": "$row.id"}}}},
		},
		"equivalence": map[string]any{"chatPrompt": "请重试这个任务，并告诉我本周进度。"},
		"meta":        map[string]any{"createdBy": "agent", "reason": "测试视图"},
	}
}

func TestM26ViewSchemaLifecycle(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	base := map[string]any{"sessionId": "main", "mode": "create", "reason": "用户要工作台",
		"schema": viewTestSchema("main", "本周工作台")}
	status, body := postJSON(t, ts.URL+"/api/actions/ui.set_view", base)
	if status != http.StatusOK {
		t.Fatalf("create = %d %s", status, body)
	}
	var created struct {
		Data struct {
			PageID  string `json:"pageId"`
			Version int    `json:"version"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Data.Version != 1 {
		t.Fatalf("create JSON = %v %s", err, body)
	}
	pageID := created.Data.PageID
	status, body = httpGet(t, ts.URL+"/api/views/"+pageID)
	if status != http.StatusOK || !strings.Contains(string(body), `"version":1`) {
		t.Fatalf("get = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/views?sessionId=main")
	if status != http.StatusOK || !strings.Contains(string(body), pageID) {
		t.Fatalf("list = %d %s", status, body)
	}
	// 非法 schema 不产生版本。
	bad := viewTestSchema("main", "坏视图")
	bad["blocks"] = []map[string]any{{"id": "x", "type": "script", "props": map[string]any{}}}
	status, _ = postJSON(t, ts.URL+"/api/actions/ui.set_view", map[string]any{"sessionId": "main",
		"mode": "create", "reason": "坏", "schema": bad, "pageId": "view-main-bad"})
	if status != http.StatusBadRequest {
		t.Fatalf("bad block = %d", status)
	}
	// 并发冲突。
	status, _ = postJSON(t, ts.URL+"/api/actions/ui.set_view", map[string]any{"sessionId": "main",
		"mode": "replace", "pageId": pageID, "baseVersion": 0, "reason": "冲突",
		"schema": viewTestSchema("main", "冲突")})
	if status != http.StatusConflict {
		t.Fatalf("base conflict = %d", status)
	}
	// patch。
	status, body = postJSON(t, ts.URL+"/api/actions/ui.set_view", map[string]any{"sessionId": "main",
		"mode": "patch", "pageId": pageID, "baseVersion": 1, "reason": "改标题",
		"patch": map[string]any{"ops": []map[string]any{{"op": "set_page_props", "title": "新工作台"}}}})
	if status != http.StatusOK {
		t.Fatalf("patch = %d %s", status, body)
	}
	var patched struct {
		Data struct {
			Version int `json:"version"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &patched)
	if patched.Data.Version != 2 {
		t.Fatalf("patch version = %s", body)
	}
	// 回滚到 v1，产生新版本且 schema 与 v1 一致。
	status, body = postJSON(t, ts.URL+"/api/actions/ui.view.rollback", map[string]any{"sessionId": "main",
		"mode": "rollback", "pageId": pageID, "baseVersion": 2, "targetVersion": 1, "reason": "回滚"})
	if status != http.StatusOK {
		t.Fatalf("rollback = %d %s", status, body)
	}
	_, version1 := httpGet(t, ts.URL+"/api/views/"+pageID+"/versions/1")
	_, current := httpGet(t, ts.URL+"/api/views/"+pageID)
	if !strings.Contains(string(version1), `"title":"本周工作台"`) || !strings.Contains(string(current), `"title":"本周工作台"`) {
		t.Fatalf("rollback schema mismatch: v1=%s current=%s", version1, current)
	}
	// soft delete。
	status, _ = postJSON(t, ts.URL+"/api/actions/ui.delete_view", map[string]any{"sessionId": "main", "pageId": pageID})
	if status != http.StatusOK {
		t.Fatalf("delete = %d", status)
	}
	status, _ = httpGet(t, ts.URL+"/api/views/"+pageID)
	if status != http.StatusGone {
		t.Fatalf("deleted get = %d", status)
	}
}

func TestM26ViewValidation(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	cases := []struct {
		name string
		edit func(schema map[string]any)
	}{
		{"no chatPrompt", func(schema map[string]any) { delete(schema, "equivalence") }},
		{"unsafe script", func(schema map[string]any) {
			schema["blocks"].([]map[string]any)[0]["props"] = map[string]any{"text": "<script>alert(1)</script>"}
		}},
		{"unknown field", func(schema map[string]any) { schema["html"] = "<b>x</b>" }},
	}
	for _, testCase := range cases {
		schema := viewTestSchema("main", testCase.name)
		testCase.edit(schema)
		status, body := postJSON(t, ts.URL+"/api/actions/ui.set_view", map[string]any{"sessionId": "main",
			"mode": "create", "reason": testCase.name, "schema": schema})
		if status != http.StatusBadRequest {
			t.Fatalf("%s = %d %s", testCase.name, status, body)
		}
	}
}
