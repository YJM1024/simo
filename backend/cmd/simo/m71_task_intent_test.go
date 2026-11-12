package main

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"simo/internal/platform/config"
)

func listTasks(t *testing.T, baseURL string) []map[string]any {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/tasks?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("GET /api/tasks = %d %s", status, body)
	}
	var payload struct {
		Tasks []map[string]any `json:"tasks"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("tasks JSON: %v %s", err, body)
	}
	return payload.Tasks
}

func waitForTaskCount(t *testing.T, baseURL string, wantAtLeast int) []map[string]any {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	var tasks []map[string]any
	for time.Now().Before(deadline) {
		tasks = listTasks(t, baseURL)
		if len(tasks) >= wantAtLeast {
			return tasks
		}
		time.Sleep(50 * time.Millisecond)
	}
	return tasks
}

func TestM71SimpleQuestionsDoNotCreateTasks(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	questions := []string{
		"分析一下这段代码是什么意思？",
		"帮我查一下这个函数为什么报错。",
		"总结一下这篇文章讲了什么。",
		"解释一下什么是缓存。",
		"这个方案怎么优化？",
	}
	for _, text := range questions {
		if status, _ := postChat(t, ts.URL, text); status != http.StatusAccepted {
			t.Fatalf("chat %q = %d", text, status)
		}
		waitForReplyDone(t, ts.URL, "main")
	}
	if tasks := listTasks(t, ts.URL); len(tasks) != 0 {
		t.Fatalf("简单问答不应创建后台任务: %v", tasks)
	}
	// 决策仍应是正常回答，而不是 DELEGATE。
	_, body := httpGet(t, ts.URL+"/api/decisions?sessionId=main")
	var decisions struct {
		Decisions []struct {
			Kind string `json:"kind"`
		} `json:"decisions"`
	}
	if err := json.Unmarshal(body, &decisions); err != nil {
		t.Fatalf("decisions JSON: %v", err)
	}
	for _, decision := range decisions.Decisions {
		if decision.Kind == "DELEGATE" {
			t.Fatalf("简单问答出现 DELEGATE 决策: %s", body)
		}
	}
}

func TestM71ExplicitTasksStillCreateTasks(t *testing.T) {
	texts := []string{
		"帮我整理一份本周周报，输出成文档。",
		"任务一：把本月待办按优先级排序。",
		"列一个本周学习计划。",
	}
	for _, text := range texts {
		t.Run(text, func(t *testing.T) {
			_, ts := newM2App(t, nil, nil)
			if status, _ := postChat(t, ts.URL, text); status != http.StatusAccepted {
				t.Fatalf("chat = %d", status)
			}
			waitForReplyDone(t, ts.URL, "main")
			tasks := waitForTaskCount(t, ts.URL, 1)
			if len(tasks) == 0 {
				t.Fatalf("明确任务未创建后台任务: %q", text)
			}
		})
	}
}

func TestM71AmbiguousRequestsDoNotCreateTasks(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for _, text := range []string{"分析一下这个数据。", "这块你来负责。", "继续。"} {
		if status, _ := postChat(t, ts.URL, text); status != http.StatusAccepted {
			t.Fatalf("chat %q = %d", text, status)
		}
		waitForReplyDone(t, ts.URL, "main")
	}
	if tasks := listTasks(t, ts.URL); len(tasks) != 0 {
		t.Fatalf("模糊请求不应创建后台任务: %v", tasks)
	}
}
