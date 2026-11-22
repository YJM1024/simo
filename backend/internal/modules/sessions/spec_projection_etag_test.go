package sessions

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"testing"

	coretask "simo/internal/core/task"
)

// fakeProjectionTasks 在 fakeTasks 之上补交付物列表，让投影的 deliverables
// 有内容可读；ETag 必须随交付物变化。
type fakeProjectionTasks struct {
	*fakeTasks
	artifacts []coretask.Artifact
}

func (f *fakeProjectionTasks) ListArtifactsForSession(context.Context, string, bool) ([]coretask.Artifact, error) {
	return f.artifacts, nil
}

func newProjectionETagServer(t *testing.T) (*fakeProjectionTasks, string) {
	t.Helper()
	mod, ts := newETagServer(t)
	tasks := &fakeProjectionTasks{fakeTasks: &fakeTasks{}}
	mod.tasks = tasks
	session, err := mod.Create(context.Background(), DefaultSessionID, "投影 ETag")
	if err != nil {
		t.Fatal(err)
	}
	return tasks, ts.URL + "/api/sessions/" + session.ID + "/spec-projection"
}

type projectionETagBody struct {
	Tasks struct {
		Done    projectionETagGroup `json:"done"`
		Running projectionETagGroup `json:"running"`
		Pending projectionETagGroup `json:"pending"`
	} `json:"tasks"`
	Deliverables struct {
		Total int `json:"total"`
	} `json:"deliverables"`
	Links struct {
		Self string `json:"self"`
	} `json:"links"`
}

type projectionETagGroup struct {
	Total int `json:"total"`
	Items []struct {
		ID string `json:"id"`
	} `json:"items"`
}

func decodeProjectionETagBody(t *testing.T, result httpResult) projectionETagBody {
	t.Helper()
	var payload projectionETagBody
	if err := json.Unmarshal(result.body, &payload); err != nil {
		t.Fatalf("投影响应不是 JSON（status=%d）: %v", result.status, err)
	}
	return payload
}

// 同一状态重复请求得到同一摘要，格式为 "spec-<16 位十六进制>"，且带 no-cache。
func TestSpecProjectionETagStable(t *testing.T) {
	tasks, url := newProjectionETagServer(t)
	tasks.tasks = []coretask.Task{{ID: "task-1", Title: "任务一", Status: coretask.StatusRunning, UpdatedAt: 10}}

	first := doGET(t, url, nil)
	if first.status != http.StatusOK {
		t.Fatalf("status = %d, want 200", first.status)
	}
	etag := first.header.Get("ETag")
	if matched, _ := regexp.MatchString(`^"spec-[0-9a-f]{16}"$`, etag); !matched {
		t.Fatalf("ETag = %q, want 形如 \"spec-<16 hex>\"", etag)
	}
	if got := first.header.Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("200 Cache-Control = %q, want no-cache", got)
	}

	second := doGET(t, url, nil)
	if second.status != http.StatusOK {
		t.Fatalf("重复请求 status = %d, want 200", second.status)
	}
	if got := second.header.Get("ETag"); got != etag {
		t.Fatalf("同一状态两次 ETag = %q / %q，want 相同", etag, got)
	}
	if len(second.body) == 0 {
		t.Fatal("200 响应 body 为空")
	}
}

// If-None-Match 命中回 304、空 body，并保留 ETag 与 Cache-Control；
// 多值与弱标签按 etagMatches 的规则同样命中，陈旧标签回 200。
func TestSpecProjectionETagNotModified(t *testing.T) {
	tasks, url := newProjectionETagServer(t)
	tasks.tasks = []coretask.Task{{ID: "task-1", Title: "任务一", Status: coretask.StatusRunning, UpdatedAt: 10}}

	first := doGET(t, url, nil)
	etag := first.header.Get("ETag")
	if first.status != http.StatusOK || etag == "" {
		t.Fatalf("首请求 status = %d, ETag = %q", first.status, etag)
	}

	second := doGET(t, url, map[string]string{"If-None-Match": etag})
	if second.status != http.StatusNotModified {
		t.Fatalf("条件请求 status = %d, want 304", second.status)
	}
	if len(second.body) != 0 {
		t.Fatalf("304 body = %q, want 空", string(second.body))
	}
	if got := second.header.Get("ETag"); got != etag {
		t.Fatalf("304 ETag = %q, want %q", got, etag)
	}
	if got := second.header.Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("304 Cache-Control = %q, want no-cache", got)
	}

	for name, validator := range map[string]string{
		"弱标签": "W/" + etag,
		"多值":  `"spec-0000000000000000", ` + etag,
		"通配符": "*",
	} {
		result := doGET(t, url, map[string]string{"If-None-Match": validator})
		if result.status != http.StatusNotModified {
			t.Fatalf("%s: status = %d, want 304", name, result.status)
		}
		if len(result.body) != 0 {
			t.Fatalf("%s: 304 body = %q, want 空", name, string(result.body))
		}
	}

	stale := doGET(t, url, map[string]string{"If-None-Match": `"spec-0000000000000000"`})
	if stale.status != http.StatusOK {
		t.Fatalf("陈旧 ETag status = %d, want 200", stale.status)
	}
	if got := stale.header.Get("ETag"); got != etag {
		t.Fatalf("陈旧 ETag 请求返回 ETag = %q, want %q", got, etag)
	}
}

// 任务状态变化与新增任务都会改变投影内容，旧 If-None-Match 必须失效回 200。
func TestSpecProjectionETagTracksTaskChange(t *testing.T) {
	tasks, url := newProjectionETagServer(t)
	tasks.tasks = []coretask.Task{{ID: "task-1", Title: "任务一", Status: coretask.StatusRunning, UpdatedAt: 10}}

	first := doGET(t, url, nil)
	etag := first.header.Get("ETag")
	if body := decodeProjectionETagBody(t, first); body.Tasks.Running.Total != 1 {
		t.Fatalf("初始 running.total = %d, want 1", body.Tasks.Running.Total)
	}

	tasks.tasks[0].Status = coretask.StatusDone
	second := doGET(t, url, map[string]string{"If-None-Match": etag})
	if second.status != http.StatusOK {
		t.Fatalf("任务状态变化后 status = %d, want 200", second.status)
	}
	if got := second.header.Get("ETag"); got == etag {
		t.Fatalf("任务状态变化后 ETag 未变: %q", got)
	}
	body := decodeProjectionETagBody(t, second)
	if body.Tasks.Done.Total != 1 || body.Tasks.Running.Total != 0 {
		t.Fatalf("任务状态未同步到投影: done=%d running=%d", body.Tasks.Done.Total, body.Tasks.Running.Total)
	}

	tasks.tasks = append(tasks.tasks, coretask.Task{ID: "task-2", Title: "任务二", Status: coretask.StatusPending, UpdatedAt: 11})
	third := doGET(t, url, map[string]string{"If-None-Match": etag})
	if third.status != http.StatusOK {
		t.Fatalf("新增任务后 status = %d, want 200", third.status)
	}
	if got := third.header.Get("ETag"); got == etag || got == second.header.Get("ETag") {
		t.Fatalf("新增任务后 ETag 未变: %q", got)
	}
	if body := decodeProjectionETagBody(t, third); body.Tasks.Pending.Total != 1 {
		t.Fatalf("新增任务未进入 pending: total = %d", body.Tasks.Pending.Total)
	}
}

// 交付物变化同样改变 ETag，避免只覆盖任务而漏掉 deliverables。
func TestSpecProjectionETagTracksDeliverables(t *testing.T) {
	tasks, url := newProjectionETagServer(t)

	first := doGET(t, url, nil)
	if body := decodeProjectionETagBody(t, first); body.Deliverables.Total != 0 {
		t.Fatalf("初始 deliverables.total = %d, want 0", body.Deliverables.Total)
	}

	tasks.artifacts = []coretask.Artifact{{
		ID: "artifact-1", TaskID: "task-1", Name: "报告.md", Mime: "text/markdown",
		Size: 128, CreatedAt: 5, UserDelivery: true, DeliveryKind: coretask.ArtifactDeliveryKindUser,
	}}
	second := doGET(t, url, map[string]string{"If-None-Match": first.header.Get("ETag")})
	if second.status != http.StatusOK {
		t.Fatalf("交付物变化后 status = %d, want 200", second.status)
	}
	if got := second.header.Get("ETag"); got == first.header.Get("ETag") {
		t.Fatalf("交付物变化后 ETag 未变: %q", got)
	}
	if body := decodeProjectionETagBody(t, second); body.Deliverables.Total != 1 {
		t.Fatalf("交付物未进入投影: total = %d", body.Deliverables.Total)
	}
}

// taskLimit 影响 items 与 links.self，不同 taskLimit 的 ETag 不得互相命中。
func TestSpecProjectionETagDistinguishesTaskLimit(t *testing.T) {
	tasks, url := newProjectionETagServer(t)
	tasks.tasks = []coretask.Task{
		{ID: "task-1", Title: "任务一", Status: coretask.StatusRunning, UpdatedAt: 10},
		{ID: "task-2", Title: "任务二", Status: coretask.StatusRunning, UpdatedAt: 11},
	}

	one := doGET(t, url+"?taskLimit=1", nil)
	five := doGET(t, url+"?taskLimit=5", nil)
	if one.status != http.StatusOK || five.status != http.StatusOK {
		t.Fatalf("status = %d / %d, want 200", one.status, five.status)
	}
	oneETag, fiveETag := one.header.Get("ETag"), five.header.Get("ETag")
	if oneETag == "" || fiveETag == "" || oneETag == fiveETag {
		t.Fatalf("taskLimit=1/5 的 ETag 未区分: %q / %q", oneETag, fiveETag)
	}
	if body := decodeProjectionETagBody(t, one); len(body.Tasks.Running.Items) != 1 {
		t.Fatalf("taskLimit=1 的 running items = %d, want 1", len(body.Tasks.Running.Items))
	}
	if body := decodeProjectionETagBody(t, five); len(body.Tasks.Running.Items) != 2 {
		t.Fatalf("taskLimit=5 的 running items = %d, want 2", len(body.Tasks.Running.Items))
	}

	cross := doGET(t, url+"?taskLimit=5", map[string]string{"If-None-Match": oneETag})
	if cross.status != http.StatusOK {
		t.Fatalf("跨 taskLimit 条件请求 status = %d, want 200", cross.status)
	}
	if got := cross.header.Get("ETag"); got != fiveETag {
		t.Fatalf("跨 taskLimit 返回 ETag = %q, want %q", got, fiveETag)
	}
}
