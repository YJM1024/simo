package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
)

func TestM87TaskMessageMapping(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "帮我整理一份周报，输出成文档。"); status != http.StatusAccepted {
		t.Fatalf("first task chat = %d", status)
	}
	waitTaskDone(t, ts.URL, "main")
	tasks := listTasks(t, ts.URL)
	if len(tasks) == 0 {
		t.Fatalf("no task created")
	}
	taskID, _ := tasks[0]["id"].(string)
	messageID := "msg-task-mapping-1"
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO messages(
			id, session_id, role, text, at, status, task_id)
			VALUES (?, 'main', 'agent', '任务已关联', 999999, 'done', ?)`, messageID, taskID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	for _, url := range []string{ts.URL + "/api/messages?sessionId=main", ts.URL + "/api/sessions/main/messages?scope=all"} {
		status, body := httpGet(t, url)
		if status != http.StatusOK {
			t.Fatalf("%s = %d %s", url, status, body)
		}
		var payload struct {
			Messages []map[string]any `json:"messages"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("%s JSON: %v", url, err)
		}
		found := false
		for _, message := range payload.Messages {
			if message["id"] == messageID {
				found = true
				if message["taskId"] != taskID {
					t.Fatalf("%s taskId = %+v", url, message["taskId"])
				}
			}
			if underscore, ok := message["taskId"]; !ok || underscore == nil {
				t.Fatalf("%s 缺少 taskId 字段: %+v", url, message)
			}
		}
		if !found {
			t.Fatalf("%s 未返回关联消息", url)
		}
	}
	status, body := httpGet(t, ts.URL+"/api/sessions/main/spec-projection")
	if status != http.StatusOK {
		t.Fatalf("projection = %d %s", status, body)
	}
	var projection struct {
		Tasks struct {
			Done    struct{ Items []map[string]any } `json:"done"`
			Running struct{ Items []map[string]any } `json:"running"`
			Pending struct{ Items []map[string]any } `json:"pending"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(body, &projection); err != nil {
		t.Fatalf("projection JSON: %v", err)
	}
	var mapped bool
	for _, group := range [][]map[string]any{projection.Tasks.Done.Items, projection.Tasks.Running.Items, projection.Tasks.Pending.Items} {
		for _, item := range group {
			if item["id"] == taskID {
				mapped = item["messageId"] == messageID
			}
		}
	}
	if !mapped {
		t.Fatalf("spec-projection task messageId 未映射: %s", body)
	}

	// 第二个任务没有任务关联消息，messageId 必须序列化为空字符串。
	if status, _ := postChat(t, ts.URL, "帮我整理一份本周周报，输出成文档。"); status != http.StatusAccepted {
		t.Fatalf("second task chat = %d", status)
	}
	waitTaskDone(t, ts.URL, "main")
	tasks = listTasks(t, ts.URL)
	if len(tasks) < 2 {
		t.Fatalf("tasks = %+v", tasks)
	}
	var unmappedID string
	for _, task := range tasks {
		if id, _ := task["id"].(string); id != taskID {
			unmappedID = id
			break
		}
	}
	_, body = httpGet(t, ts.URL+"/api/sessions/main/spec-projection")
	var second struct {
		Tasks struct {
			Done    struct{ Items []map[string]any } `json:"done"`
			Running struct{ Items []map[string]any } `json:"running"`
			Pending struct{ Items []map[string]any } `json:"pending"`
		} `json:"tasks"`
	}
	_ = json.Unmarshal(body, &second)
	for _, group := range [][]map[string]any{second.Tasks.Done.Items, second.Tasks.Running.Items, second.Tasks.Pending.Items} {
		for _, item := range group {
			if item["id"] == unmappedID {
				if item["messageId"] != "" {
					t.Fatalf("无映射 task messageId = %+v", item["messageId"])
				}
				return
			}
		}
	}
	t.Fatalf("未找到无映射任务 %s: %s", unmappedID, body)
}
