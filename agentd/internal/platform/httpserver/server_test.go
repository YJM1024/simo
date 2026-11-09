package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthReadinessPayload(t *testing.T) {
	mux := http.NewServeMux()
	handler := NewHandler(mux, nil, func(context.Context) HealthReport {
		return HealthReport{Ready: true, DB: "ok", Modules: []string{"sessions", "chat"}}
	})
	ts := httptest.NewServer(handler)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var payload struct {
		OK     bool `json:"ok"`
		Ready  bool `json:"ready"`
		Checks struct {
			DB      string   `json:"db"`
			Modules []string `json:"modules"`
		} `json:"checks"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || !payload.OK || !payload.Ready ||
		payload.Checks.DB != "ok" || len(payload.Checks.Modules) != 2 {
		t.Fatalf("health = %d %+v", resp.StatusCode, payload)
	}
}

func TestHealthNotReadyReturns503(t *testing.T) {
	mux := http.NewServeMux()
	handler := NewHandler(mux, nil, func(context.Context) HealthReport {
		return HealthReport{Ready: false, DB: "error", Error: "db down"}
	})
	ts := httptest.NewServer(handler)
	defer ts.Close()
	resp, err := http.Get(ts.URL + "/api/health")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("not ready status = %d", resp.StatusCode)
	}
}

func TestUnifiedErrorEnvelopeHasCode(t *testing.T) {
	mux := http.NewServeMux()
	handler := NewHandler(mux, nil)
	ts := httptest.NewServer(handler)
	defer ts.Close()
	resp, err := http.Get(ts.URL + "/api/nope")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var payload struct {
		OK   bool   `json:"ok"`
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.OK || payload.Code != "not_found" {
		t.Fatalf("error envelope = %+v", payload)
	}
}
