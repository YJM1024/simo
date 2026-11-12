package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestM86SpecMirrorConversationsRecursive(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	status, body := postJSON(t, ts.URL+"/api/sessions", map[string]any{
		"parentId": "main", "title": "子会话", "draft": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("create child = %d %s", status, body)
	}
	var created struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Session.ID == "" {
		t.Fatalf("child JSON: %v %s", err, body)
	}
	child := created.Session.ID
	status, body = postJSON(t, ts.URL+"/api/sessions", map[string]any{
		"parentId": child, "title": "孙会话", "draft": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("create grandchild = %d %s", status, body)
	}
	var grand struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
	}
	if err := json.Unmarshal(body, &grand); err != nil || grand.Session.ID == "" {
		t.Fatalf("grandchild JSON: %v %s", err, body)
	}
	childSpec := filepath.Join(a.sandbox.Workspace, "specs", "main", "conversations", child, "spec.md")
	grandSpec := filepath.Join(a.sandbox.Workspace, "specs", "main", "conversations", child, "conversations", grand.Session.ID, "spec.md")
	for path, wantID := range map[string]string{childSpec: child, grandSpec: grand.Session.ID} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("spec mirror missing %s: %v", path, err)
		}
		if !strings.Contains(string(data), wantID) || !strings.Contains(string(data), "DB 是权威源") {
			t.Fatalf("spec mirror content %s = %s", path, data)
		}
	}
}
