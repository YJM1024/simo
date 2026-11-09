package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestM11SessionFilesAggregation(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:workflow-2 请拆解执行"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitWorkflowDone(t, ts.URL)
	uploadAttachments(t, ts.URL, "main", uploadSpec{Name: "notes.txt", Content: []byte("m11 upload"), Mime: "text/plain"})

	status, body := httpGet(t, ts.URL+"/api/sessions/main/files")
	if status != http.StatusOK {
		t.Fatalf("files = %d %s", status, body)
	}
	var payload struct {
		Files []struct {
			ID          string            `json:"id"`
			Kind        string            `json:"kind"`
			Name        string            `json:"name"`
			PreviewURL  string            `json:"previewUrl"`
			DownloadURL string            `json:"downloadUrl"`
			Source      map[string]string `json:"source"`
		} `json:"files"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("files JSON: %v %s", err, body)
	}
	kinds := map[string]int{}
	seenPath := map[string]bool{}
	for _, file := range payload.Files {
		kinds[file.Kind]++
		if file.Kind != "artifact" && file.Kind != "upload" {
			t.Fatalf("未知文件 kind: %+v", file)
		}
		path := file.Source["path"]
		if path == "" || seenPath[path] {
			t.Fatalf("文件路径缺失或重复: %+v", file)
		}
		seenPath[path] = true
		if file.PreviewURL == "" || file.DownloadURL == "" {
			t.Fatalf("文件预览/下载 URL 缺失: %+v", file)
		}
	}
	if kinds["artifact"] < 2 || kinds["upload"] < 1 || payload.Total != len(payload.Files) {
		t.Fatalf("文件聚合不足: kinds=%v total=%d files=%+v", kinds, payload.Total, payload.Files)
	}
	// 预览 URL 真实可用。
	status, _ = httpGet(t, ts.URL+payload.Files[0].PreviewURL)
	if status != http.StatusOK {
		t.Fatalf("预览 URL = %d", status)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions/main/files?kind=upload")
	if status != http.StatusOK {
		t.Fatalf("kind=upload = %d %s", status, body)
	}
	var uploads struct {
		Files []json.RawMessage `json:"files"`
	}
	if json.Unmarshal(body, &uploads) != nil || len(uploads.Files) != 1 {
		t.Fatalf("kind=upload 过滤 = %s", body)
	}
}

func TestM11MessagePagination(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for i := 0; i < 14; i++ {
		if status, body := postChat(t, ts.URL, "分页测试消息"); status != http.StatusAccepted {
			t.Fatalf("chat %d = %d %s", i, status, body)
		}
	}
	waitForAgentDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/messages?sessionId=main&limit=10")
	if status != http.StatusOK {
		t.Fatalf("page1 = %d %s", status, body)
	}
	var page1 struct {
		Messages   []map[string]any `json:"messages"`
		HasMore    bool             `json:"hasMore"`
		NextBefore string           `json:"nextBefore"`
	}
	if err := json.Unmarshal(body, &page1); err != nil || len(page1.Messages) != 10 {
		t.Fatalf("page1 数量 = %d err=%v body=%s", len(page1.Messages), err, body)
	}
	if !page1.HasMore || page1.NextBefore == "" {
		t.Fatalf("page1 分页元数据 = %+v", page1)
	}
	status, body = httpGet(t, ts.URL+"/api/messages?sessionId=main&before="+page1.NextBefore+"&limit=10")
	if status != http.StatusOK {
		t.Fatalf("page2 = %d %s", status, body)
	}
	var page2 struct {
		Messages []map[string]any `json:"messages"`
	}
	if json.Unmarshal(body, &page2) != nil || len(page2.Messages) == 0 {
		t.Fatalf("page2 = %s", body)
	}
	if page2.Messages[len(page2.Messages)-1]["id"] == page1.Messages[0]["id"] {
		t.Fatal("分页边界重复")
	}
	// 缺省仍返回全量。
	if got := listMessages(t, ts.URL, "main"); len(got) < 20 {
		t.Fatalf("缺省全量消息不足: %d", len(got))
	}
}

func TestM11OverviewRefreshAndCache(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:workflow-2 请拆解执行"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitWorkflowDone(t, ts.URL)
	status, body := httpGet(t, ts.URL+"/api/sessions/main/overview")
	if status != http.StatusOK {
		t.Fatalf("overview GET = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/sessions/main/overview/refresh", map[string]any{})
	if status != http.StatusOK {
		t.Fatalf("overview refresh = %d %s", status, body)
	}
	var refreshed struct {
		Overview struct {
			Goal        string   `json:"goal"`
			Constraints []string `json:"constraints"`
			Current     string   `json:"current"`
			Completed   []string `json:"completed"`
			Pending     []string `json:"pending"`
			Notes       string   `json:"notes"`
			Timeline    []struct {
				At   int64  `json:"at"`
				Text string `json:"text"`
			} `json:"timeline"`
			Version   int   `json:"version"`
			UpdatedAt int64 `json:"updatedAt"`
		} `json:"overview"`
	}
	if err := json.Unmarshal(body, &refreshed); err != nil {
		t.Fatalf("overview JSON: %v %s", err, body)
	}
	text := refreshed.Overview.Goal + strings.Join(refreshed.Overview.Constraints, "") + refreshed.Overview.Current +
		strings.Join(refreshed.Overview.Completed, "") + strings.Join(refreshed.Overview.Pending, "") +
		refreshed.Overview.Notes
	for _, item := range refreshed.Overview.Timeline {
		text += item.Text
		if item.At <= 0 || strings.TrimSpace(item.Text) == "" || !strings.HasSuffix(strings.TrimSpace(item.Text), "。") {
			t.Fatalf("概览时间线项非法: %+v", item)
		}
	}
	for _, field := range []string{refreshed.Overview.Goal, refreshed.Overview.Current, refreshed.Overview.Notes} {
		if strings.TrimSpace(field) == "" || !strings.HasSuffix(strings.TrimSpace(field), "。") {
			t.Fatalf("概览不是完整自然句: %+v", refreshed.Overview)
		}
	}
	for _, list := range [][]string{refreshed.Overview.Completed, refreshed.Overview.Pending} {
		for _, item := range list {
			if !strings.HasSuffix(strings.TrimSpace(item), "。") {
				t.Fatalf("概览列表项不是完整句: %+v", refreshed.Overview)
			}
		}
	}
	if strings.Contains(strings.ToLower(text), "spec") || strings.Contains(text, "specId") {
		t.Fatalf("概览暴露 Spec 字段: %s", text)
	}
	if refreshed.Overview.Version < 1 || refreshed.Overview.UpdatedAt == 0 {
		t.Fatalf("概览版本/时间缺失: %+v", refreshed.Overview)
	}
	time.Sleep(5 * time.Millisecond)
	status, body = httpGet(t, ts.URL+"/api/sessions/main/overview")
	if status != http.StatusOK {
		t.Fatalf("overview cached GET = %d %s", status, body)
	}
	var cached struct {
		Overview struct {
			Version   int   `json:"version"`
			UpdatedAt int64 `json:"updatedAt"`
		} `json:"overview"`
	}
	if json.Unmarshal(body, &cached) != nil || cached.Overview.Version != refreshed.Overview.Version ||
		cached.Overview.UpdatedAt != refreshed.Overview.UpdatedAt {
		t.Fatalf("概览未读缓存: refreshed=%+v body=%s", refreshed.Overview, body)
	}
}
