package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestM85SpecMirrorFiles(t *testing.T) {
	a, _ := newM2App(t, nil, nil)
	mainSpec := filepath.Join(a.sandbox.Workspace, "specs", "main", "spec.md")
	data, err := os.ReadFile(mainSpec)
	if err != nil {
		t.Fatalf("main spec mirror missing: %v", err)
	}
	text := string(data)
	if !strings.Contains(text, "# 会话规格") || !strings.Contains(text, "DB 是权威源") {
		t.Fatalf("spec mirror content = %s", text)
	}
	if !strings.Contains(text, "会话：`main`") {
		t.Fatalf("spec mirror session wrong: %s", text)
	}
}
