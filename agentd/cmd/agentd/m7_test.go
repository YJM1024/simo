package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestM7HealthReadiness(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := httpGet(t, ts.URL+"/api/health")
	if status != http.StatusOK {
		t.Fatalf("health = %d %s", status, body)
	}
	var payload struct {
		OK     bool `json:"ok"`
		Ready  bool `json:"ready"`
		Checks struct {
			DB      string   `json:"db"`
			Modules []string `json:"modules"`
		} `json:"checks"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.OK || !payload.Ready || payload.Checks.DB != "ok" || len(payload.Checks.Modules) == 0 {
		t.Fatalf("health readiness 不完整: %s", body)
	}
}

func TestM7LargeRequestBodyRejectedWithCode(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	huge := strings.Repeat("a", 80<<10)
	status, body := postJSON(t, ts.URL+"/api/chat", map[string]any{"text": huge})
	if status != http.StatusRequestEntityTooLarge {
		t.Fatalf("超大请求体 = %d, want 413: %s", status, body)
	}
	var payload struct {
		OK   bool   `json:"ok"`
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.OK || payload.Code != "body_too_large" {
		t.Fatalf("错误信封 = %s", body)
	}
}

func TestM7UniformErrorEnvelope(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := httpGet(t, ts.URL+"/api/nope")
	if status != http.StatusNotFound {
		t.Fatalf("404 status = %d", status)
	}
	var payload struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
		Code  string `json:"code"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.OK || payload.Error == "" || payload.Code != "not_found" {
		t.Fatalf("统一错误信封 = %s", body)
	}
}
