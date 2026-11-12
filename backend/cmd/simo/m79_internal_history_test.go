package main

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"testing"
)

func TestM79LegacyInternalMessagesHiddenFromAPI(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO messages(
			id,session_id,role,text,at,status,internal) VALUES
			('legacy-card','main','user','[卡片操作] cardId=x actionId=submit',10,'done',1)`); err != nil {
			return err
		}
		_, err := tx.ExecContext(context.Background(), `INSERT INTO messages(
			id,session_id,role,text,at,status,internal) VALUES
			('visible-user','main','user','可见用户消息',11,'done',0)`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	status, body := httpGet(t, ts.URL+"/api/messages?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("messages = %d", status)
	}
	if strings.Contains(string(body), "[卡片操作]") || strings.Contains(string(body), "legacy-card") {
		t.Fatalf("历史内部消息仍可见: %s", body)
	}
	if !strings.Contains(string(body), "可见用户消息") {
		t.Fatalf("正常消息被误隐藏: %s", body)
	}
	status, body = httpGet(t, ts.URL+"/api/messages/search?sessionId=main&q="+"%5B卡片操作%5D")
	if status != http.StatusOK || strings.Contains(string(body), "legacy-card") {
		t.Fatalf("搜索仍返回内部消息: %d %s", status, body)
	}
}
