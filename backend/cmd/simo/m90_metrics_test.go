package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

type metricsSeriesDay struct {
	Date     string `json:"date"`
	Turns    int64  `json:"turns"`
	Failures int64  `json:"failures"`
}

type metricsResponse struct {
	Range    string `json:"range"`
	Timezone string `json:"timezone"`
	From     int64  `json:"from"`
	To       int64  `json:"to"`
	Totals   struct {
		Turns            int64  `json:"turns"`
		Messages         int64  `json:"messages"`
		Tasks            int64  `json:"tasks"`
		Failures         int64  `json:"failures"`
		PromptTokens     int64  `json:"promptTokens"`
		CompletionTokens int64  `json:"completionTokens"`
		ReasoningTokens  int64  `json:"reasoningTokens"`
		TotalTokens      int64  `json:"totalTokens"`
		TTFTP50          *int64 `json:"ttftP50Ms"`
		TTFTP90          *int64 `json:"ttftP90Ms"`
		DurP50           *int64 `json:"durationP50Ms"`
		DurP90           *int64 `json:"durationP90Ms"`
	} `json:"totals"`
	Series []metricsSeriesDay `json:"series"`
}

func insertMetricTurn(t *testing.T, a *app, id string, started, ttft, duration int64, status string) {
	t.Helper()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO turn_metrics(
			turn_id, session_id, reply_id, status, started_at, first_token_at, finished_at,
			ttft_ms, duration_ms, prompt_tokens, completion_tokens, reasoning_tokens, total_tokens)
			VALUES (?, 'main', ?, ?, ?, ?, ?, ?, ?, 10, 5, 2, 17)`,
			id, "reply-"+id, status, started, started+ttft, started+duration, ttft, duration)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func findSeriesDay(payload metricsResponse, date string) *metricsSeriesDay {
	for i := range payload.Series {
		if payload.Series[i].Date == date {
			return &payload.Series[i]
		}
	}
	return nil
}

func TestM90MetricsEmptyAndValidation(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := httpGet(t, ts.URL+"/api/metrics?range=30d&tz=UTC")
	if status != http.StatusOK {
		t.Fatalf("empty metrics = %d %s", status, body)
	}
	var empty metricsResponse
	if err := json.Unmarshal(body, &empty); err != nil {
		t.Fatalf("empty JSON: %v", err)
	}
	if empty.Totals.Turns != 0 || len(empty.Series) != 30 || empty.Totals.TTFTP50 != nil {
		t.Fatalf("empty metrics = %+v", empty)
	}
	if status, _ := httpGet(t, ts.URL+"/api/metrics?range=2d"); status != http.StatusBadRequest {
		t.Fatalf("invalid range = %d", status)
	}
	if status, _ := httpGet(t, ts.URL+"/api/metrics?range=7d&tz=bad/zone"); status != http.StatusBadRequest {
		t.Fatalf("invalid tz = %d", status)
	}
}

func TestM90MetricsNormalAndTimezone(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	insertMetricTurn(t, a, "today-1", today.Add(100*time.Millisecond).UnixMilli(), 100, 500, "done")
	insertMetricTurn(t, a, "today-2", today.Add(200*time.Millisecond).UnixMilli(), 200, 700, "error")
	insertMetricTurn(t, a, "today-3", today.Add(300*time.Millisecond).UnixMilli(), 1000, 1500, "done")
	insertMetricTurn(t, a, "boundary-in", today.UnixMilli(), 50, 600, "done")
	insertMetricTurn(t, a, "daily-out", today.Add(-time.Millisecond).UnixMilli(), 50, 600, "done")
	rangeStart := today.AddDate(0, 0, -6)
	insertMetricTurn(t, a, "before-range", rangeStart.Add(-time.Millisecond).UnixMilli(), 99999, 99999, "error")
	at := today.Add(400 * time.Millisecond).UnixMilli()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(context.Background(),
			`INSERT INTO messages(id,session_id,role,text,at,status) VALUES ('m1','main','user','a',?, 'done')`, at); err != nil {
			return err
		}
		if _, err := tx.ExecContext(context.Background(),
			`INSERT INTO messages(id,session_id,role,text,at,status) VALUES ('m2','main','agent','b',?, 'done')`, at); err != nil {
			return err
		}
		_, err := tx.ExecContext(context.Background(),
			`INSERT INTO tasks(id,session_id,title,kind,status,payload,created_at,updated_at)
			 VALUES ('tm1','main','任务','mock','done','',?,?)`, at, at)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	status, body := httpGet(t, ts.URL+"/api/metrics?range=7d&tz=UTC")
	if status != http.StatusOK {
		t.Fatalf("metrics = %d %s", status, body)
	}
	var payload metricsResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Totals.Turns != 5 || payload.Totals.Messages != 2 || payload.Totals.Tasks != 1 || payload.Totals.Failures != 1 {
		t.Fatalf("totals = %+v", payload.Totals)
	}
	if payload.Totals.TotalTokens != 5*17 || payload.Totals.PromptTokens != 50 ||
		payload.Totals.CompletionTokens != 25 || payload.Totals.ReasoningTokens != 10 {
		t.Fatalf("tokens = %+v", payload.Totals)
	}
	if payload.Totals.TTFTP50 == nil || *payload.Totals.TTFTP50 != 100 ||
		payload.Totals.TTFTP90 == nil || *payload.Totals.TTFTP90 != 1000 {
		t.Fatalf("ttft percentiles = %+v", payload.Totals)
	}
	if payload.Totals.DurP50 == nil || *payload.Totals.DurP50 != 600 ||
		payload.Totals.DurP90 == nil || *payload.Totals.DurP90 != 1500 {
		t.Fatalf("duration percentiles = %+v", payload.Totals)
	}
	todayKey := today.Format("2006-01-02")
	if day := findSeriesDay(payload, todayKey); day == nil || day.Turns != 4 || day.Failures != 1 {
		t.Logf("series=%+v totals=%+v", payload.Series, payload.Totals)
		t.Fatalf("today series = %+v", day)
	}

	// 时区：同一时刻 UTC 属于昨天，+08:00 属于今天。
	tzApp, tzServer := newM2App(t, nil, nil)
	yesterday20UTC := today.Add(-4 * time.Hour).UnixMilli()
	insertMetricTurn(t, tzApp, "tz-1", yesterday20UTC, 10, 20, "done")
	_, body = httpGet(t, tzServer.URL+"/api/metrics?range=7d&tz=UTC")
	var utcPayload metricsResponse
	_ = json.Unmarshal(body, &utcPayload)
	if day := findSeriesDay(utcPayload, today.AddDate(0, 0, -1).Format("2006-01-02")); day == nil || day.Turns != 1 {
		t.Fatalf("UTC timezone bucket = %+v", day)
	}
	_, body = httpGet(t, tzServer.URL+"/api/metrics?range=7d&tz=%2B08:00")
	var shPayload metricsResponse
	_ = json.Unmarshal(body, &shPayload)
	if day := findSeriesDay(shPayload, today.Format("2006-01-02")); day == nil || day.Turns != 1 {
		t.Fatalf("+08 timezone bucket = %+v", day)
	}
}

func TestM90MetricsRecordsRealTurn(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "指标记录 smoke"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/metrics?range=7d&tz=UTC")
	if status != http.StatusOK {
		t.Fatalf("metrics = %d %s", status, body)
	}
	var payload metricsResponse
	if err := json.Unmarshal(body, &payload); err != nil || payload.Totals.Turns < 1 || payload.Totals.Messages < 2 {
		t.Fatalf("turn metrics not recorded: %s err=%v", body, err)
	}
}
