package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func TestM91MetricsDashboardFieldsAndUsageReconciliation(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UnixMilli()
	usage := map[string]any{
		"replyId": "reply-usage", "sessionId": "main",
		"usage": map[string]any{
			"promptTokens": 10, "completionTokens": 20, "reasoningTokens": 5,
			"totalTokens": 35, "model": "deepseek-flash",
		},
	}
	raw, _ := json.Marshal(usage)
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO messages(
			id,session_id,role,text,at,status) VALUES ('reply-usage','main','agent','历史回复',?,'done')`, now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO events(at,type,payload)
			VALUES (?, 'usage.recorded', ?)`, now, string(raw)); err != nil {
			return err
		}
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO tasks(
			id,session_id,title,kind,status,payload,created_at,updated_at,attempt)
			VALUES ('task-q-done','main','完成任务','mock','done','',?,?,1)`, now, now); err != nil {
			return err
		}
		_, err := tx.ExecContext(context.Background(), `INSERT INTO tasks(
			id,session_id,title,kind,status,payload,created_at,updated_at,attempt)
			VALUES ('task-q-fail','main','失败任务','mock','failed','',?,?,2)`, now, now)
		return err
	}); err != nil {
		t.Fatal(err)
	}

	status, body := httpGet(t, ts.URL+"/api/metrics?range=7d&tz=UTC")
	if status != http.StatusOK {
		t.Fatalf("metrics = %d %s", status, body)
	}
	var payload struct {
		From         int64             `json:"from"`
		To           int64             `json:"to"`
		PartialToday bool              `json:"partialToday"`
		Availability map[string]string `json:"availability"`
		Topics       map[string]int64  `json:"topics"`
		Sessions     map[string]int64  `json:"sessions"`
		Totals       struct {
			TotalTokens int64 `json:"totalTokens"`
		} `json:"totals"`
		TaskQuality struct {
			CompletionRate struct {
				Numerator   int64    `json:"numerator"`
				Denominator int64    `json:"denominator"`
				Value       *float64 `json:"value"`
			} `json:"completionRate"`
			FirstPassRate struct {
				Numerator   int64 `json:"numerator"`
				Denominator int64 `json:"denominator"`
			} `json:"firstPassRate"`
			ReworkRate struct {
				Numerator   int64 `json:"numerator"`
				Denominator int64 `json:"denominator"`
			} `json:"reworkRate"`
		} `json:"taskQuality"`
		Tables struct {
			TokensByModel  []map[string]any `json:"tokensByModel"`
			MessagesByRole []map[string]any `json:"messagesByRole"`
			Sessions       []map[string]any `json:"sessions"`
			TasksBySession []map[string]any `json:"tasksBySession"`
			LatencySamples []map[string]any `json:"latencySamples"`
		} `json:"tables"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("metrics JSON: %v %s", err, body)
	}
	if !payload.PartialToday {
		t.Fatalf("partialToday 应为 true")
	}
	for _, key := range []string{"tokens", "topics", "messages", "sessions", "replySpeed", "ttft", "taskCompletion", "taskAttempts", "taskReopen"} {
		if _, ok := payload.Availability[key]; !ok {
			t.Fatalf("availability 缺少 %s: %+v", key, payload.Availability)
		}
	}
	if payload.Availability["tokens"] != "ready" || payload.Availability["ttft"] != "missing" ||
		payload.Availability["taskReopen"] != "missing" {
		t.Fatalf("availability = %+v", payload.Availability)
	}
	if payload.Topics["newSessions"] < 1 || payload.Topics["activeSessions"] < 1 ||
		payload.Sessions["total"] < 1 {
		t.Fatalf("topics/sessions = %+v %+v", payload.Topics, payload.Sessions)
	}
	if payload.TaskQuality.CompletionRate.Numerator != 1 || payload.TaskQuality.CompletionRate.Denominator != 2 ||
		payload.TaskQuality.CompletionRate.Value == nil ||
		payload.TaskQuality.FirstPassRate.Numerator != 1 ||
		payload.TaskQuality.ReworkRate.Numerator != 1 || payload.TaskQuality.ReworkRate.Denominator != 2 {
		t.Fatalf("taskQuality = %+v", payload.TaskQuality)
	}
	if len(payload.Tables.TokensByModel) == 0 || len(payload.Tables.MessagesByRole) == 0 ||
		len(payload.Tables.Sessions) == 0 || len(payload.Tables.TasksBySession) == 0 ||
		len(payload.Tables.LatencySamples) != 3 {
		t.Fatalf("tables = %+v", payload.Tables)
	}
	if payload.Totals.TotalTokens != 35 {
		t.Fatalf("token total = %d, want 35", payload.Totals.TotalTokens)
	}

	// 与 /api/stats 的 usage 口径对账。
	statsURL := ts.URL + "/api/stats?metric=tokens&granularity=day&from=" +
		itoa64(payload.From) + "&to=" + itoa64(payload.To)
	status, statsBody := httpGet(t, statsURL)
	if status != http.StatusOK {
		t.Fatalf("stats = %d %s", status, statsBody)
	}
	var stats struct {
		Totals struct {
			Tokens int64 `json:"tokens"`
		} `json:"totals"`
	}
	if err := json.Unmarshal(statsBody, &stats); err != nil {
		t.Fatal(err)
	}
	if stats.Totals.Tokens != payload.Totals.TotalTokens {
		t.Fatalf("metrics tokens=%d stats tokens=%d", payload.Totals.TotalTokens, stats.Totals.Tokens)
	}
}

func itoa64(value int64) string {
	if value == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for value > 0 {
		i--
		buf[i] = byte('0' + value%10)
		value /= 10
	}
	return string(buf[i:])
}
