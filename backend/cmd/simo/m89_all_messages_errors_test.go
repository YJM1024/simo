package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
)

func TestM89AllMessagesLimitsAndErrors(t *testing.T) {
	a, ts := newM2App(t, nil, nil)

	// 404：未知会话。
	if status, body := httpGet(t, ts.URL+"/api/sessions/not-exist/messages?scope=all"); status != http.StatusNotFound {
		t.Fatalf("unknown session = %d, want 404 (%s)", status, body)
	}
	// 403：当前单用户后端没有鉴权/权限中间件，无 403 语义（N/A），不是 401/403。
	t.Log("403 N/A: single-user backend has no auth/permission middleware")

	// 413：超过 50000 条全量消息上限；一次返回不伪造分页。
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		stmt, err := tx.PrepareContext(context.Background(), `INSERT INTO messages(
			id, session_id, role, text, at, status) VALUES (?, 'main', 'user', 'bulk', ?, 'done')`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		for i := 0; i < 50001; i++ {
			if _, err := stmt.ExecContext(context.Background(), "bulk-"+string(rune(65+i%26))+"-"+itoa(i), i); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	status, body := httpGet(t, ts.URL+"/api/sessions/main/messages?scope=all")
	if status != http.StatusRequestEntityTooLarge {
		t.Fatalf(">50000 messages = %d, want 413 (%s)", status, body)
	}
	var payload struct {
		OK    bool `json:"ok"`
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.OK || payload.Error.Code != "messages_too_many" {
		t.Fatalf("413 payload = %s err=%v", body, err)
	}
}

func itoa(value int) string {
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
