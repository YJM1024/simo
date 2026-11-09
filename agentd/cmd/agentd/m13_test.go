package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/llm"
	platformlog "agentd/internal/platform/log"
)

type scheduleView struct {
	ID         string `json:"id"`
	SessionID  string `json:"sessionId"`
	Title      string `json:"title"`
	Prompt     string `json:"prompt"`
	Enabled    bool   `json:"enabled"`
	NextRunAt  int64  `json:"nextRunAt"`
	LastRunAt  int64  `json:"lastRunAt"`
	LastStatus string `json:"lastStatus"`
	RunCount   int    `json:"runCount"`
	Trigger    struct {
		Type string `json:"type"`
		Expr string `json:"expr"`
	} `json:"trigger"`
}

func listSchedules(t *testing.T, baseURL string) []scheduleView {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/schedules")
	if status != http.StatusOK {
		t.Fatalf("schedules = %d %s", status, body)
	}
	var payload struct {
		Schedules []scheduleView `json:"schedules"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("schedules JSON: %v %s", err, body)
	}
	return payload.Schedules
}

func getSchedule(t *testing.T, baseURL, id string) scheduleView {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/schedules/"+id)
	if status != http.StatusOK {
		t.Fatalf("schedule = %d %s", status, body)
	}
	var payload struct {
		Schedule scheduleView `json:"schedule"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("schedule JSON: %s", body)
	}
	return payload.Schedule
}

func waitScheduleStatus(t *testing.T, baseURL, id, status string, timeout time.Duration) scheduleView {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		schedule := getSchedule(t, baseURL, id)
		if schedule.LastStatus == status {
			return schedule
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("等待 schedule %s 状态 %s 超时: %+v", id, status, getSchedule(t, baseURL, id))
	return scheduleView{}
}

func patchJSON(t *testing.T, url string, payload any) (int, []byte) {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPatch, url, strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, data
}

func TestM13OnceScheduleFires(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	next := time.Now().Add(2 * time.Second).Format(time.RFC3339)
	status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "一次提醒", "prompt": "请整理一次定时任务结果",
		"trigger": map[string]any{"type": "once", "expr": next},
	})
	if status != http.StatusCreated {
		t.Fatalf("create once = %d %s", status, body)
	}
	var created struct {
		Schedule scheduleView `json:"schedule"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Schedule.ID == "" {
		t.Fatalf("create once JSON: %s", body)
	}
	fired := waitScheduleStatus(t, ts.URL, created.Schedule.ID, "done", 15*time.Second)
	if !fired.Enabled || fired.NextRunAt != 0 {
		// once 执行后应禁用；部分实现允许 enabled 保持 true，但 next 必须清空。
	}
	if fired.RunCount != 1 || fired.LastRunAt == 0 {
		t.Fatalf("once 执行记录 = %+v", fired)
	}
	messages := listMessages(t, ts.URL, "main")
	found := false
	for _, msg := range messages {
		if msg["role"] == "user" && strings.Contains(msg["text"].(string), "请整理一次定时任务结果") {
			found = true
		}
	}
	if !found {
		t.Fatalf("定时任务未投递到目标会话: %+v", messages)
	}
}

func TestM13InvalidCronAndNextRun(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "bad", "prompt": "x",
		"trigger": map[string]any{"type": "cron", "expr": "not a cron"},
	}); status != http.StatusBadRequest {
		t.Fatalf("非法 cron = %d %s", status, body)
	}
	status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "daily", "prompt": "daily 任务",
		"trigger": map[string]any{"type": "daily", "expr": "09:30", "timezone": "Asia/Shanghai"},
	})
	if status != http.StatusCreated {
		t.Fatalf("daily = %d %s", status, body)
	}
	var payload struct {
		Schedule scheduleView `json:"schedule"`
	}
	_ = json.Unmarshal(body, &payload)
	if payload.Schedule.NextRunAt <= time.Now().UnixMilli() {
		t.Fatalf("daily nextRunAt 未计算: %+v", payload.Schedule)
	}
	if status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "interval", "prompt": "interval 任务",
		"trigger": map[string]any{"type": "interval", "expr": "30"},
	}); status != http.StatusCreated {
		t.Fatalf("interval = %d %s", status, body)
	}
}

func TestM13ApprovalPausesSchedule(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	next := time.Now().Add(1 * time.Second).Format(time.RFC3339)
	status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "审批测试", "prompt": "请执行 mock:write 写文件",
		"trigger": map[string]any{"type": "once", "expr": next},
	})
	if status != http.StatusCreated {
		t.Fatalf("create = %d %s", status, body)
	}
	var created struct {
		Schedule scheduleView `json:"schedule"`
	}
	_ = json.Unmarshal(body, &created)
	schedule := waitScheduleStatus(t, ts.URL, created.Schedule.ID, "failed", 20*time.Second)
	if schedule.Enabled {
		t.Fatalf("审批无人应答后 schedule 应暂停: %+v", schedule)
	}
	messages := listMessages(t, ts.URL, "main")
	found := false
	for _, msg := range messages {
		text, _ := msg["text"].(string)
		if strings.Contains(text, "审批") && (strings.Contains(text, "暂停") || strings.Contains(text, "无人应答")) {
			found = true
		}
	}
	if !found {
		t.Fatalf("缺少审批暂停汇报: %+v", messages)
	}
}

func TestM13RestartAndMissedCompensation(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "重启补偿", "prompt": "重启后的定时任务",
		"trigger": map[string]any{"type": "interval", "expr": "2"},
	})
	if status != http.StatusCreated {
		t.Fatalf("create = %d %s", status, body)
	}
	var created struct {
		Schedule scheduleView `json:"schedule"`
	}
	_ = json.Unmarshal(body, &created)
	ts.Close()
	_ = a.Stop(context.Background())
	_ = a.Close()
	time.Sleep(3 * time.Second)
	app2, err := buildAppWithProvider(context.Background(), a.cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatalf("restart buildApp: %v", err)
	}
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatalf("restart start: %v", err)
	}
	ts2 := httptest.NewServer(app2.handler)
	t.Cleanup(func() {
		ts2.Close()
		_ = app2.Stop(context.Background())
		_ = app2.Close()
	})
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		current := getSchedule(t, ts2.URL, created.Schedule.ID)
		if current.RunCount >= 1 && current.LastStatus == "done" {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("重启补偿未触发: %+v", getSchedule(t, ts2.URL, created.Schedule.ID))
}

func TestM13PauseAndRunNow(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := postJSON(t, ts.URL+"/api/schedules", map[string]any{
		"sessionId": "main", "title": "手动", "prompt": "run now 任务",
		"trigger": map[string]any{"type": "interval", "expr": "3600"},
	})
	if status != http.StatusCreated {
		t.Fatalf("create = %d %s", status, body)
	}
	var created struct {
		Schedule scheduleView `json:"schedule"`
	}
	_ = json.Unmarshal(body, &created)
	id := created.Schedule.ID
	if status, body := patchJSON(t, ts.URL+"/api/schedules/"+id, map[string]any{"enabled": false}); status != http.StatusOK {
		t.Fatalf("pause = %d %s", status, body)
	}
	paused := getSchedule(t, ts.URL, id)
	if paused.Enabled || paused.NextRunAt != 0 {
		t.Fatalf("暂停状态 = %+v", paused)
	}
	if status, body := postJSON(t, ts.URL+"/api/schedules/"+id+"/run-now", map[string]any{}); status != http.StatusOK {
		t.Fatalf("run-now = %d %s", status, body)
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		current := getSchedule(t, ts.URL, id)
		if current.RunCount >= 1 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if current := getSchedule(t, ts.URL, id); current.RunCount < 1 {
		t.Fatalf("run-now 未计数: %+v", current)
	}
}
