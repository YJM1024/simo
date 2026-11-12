package workspace

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func newPolicy(t *testing.T) *Policy {
	t.Helper()
	home := t.TempDir()
	p, err := New(home, filepath.Join(home, "workspace"), filepath.Join(home, "artifacts"))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLayoutSessionTaskSpecWorkPaths(t *testing.T) {
	p := newPolicy(t)
	mainOutput, err := p.SessionArea([]string{"main"}, "output")
	if err != nil || filepath.Base(mainOutput) != "output" || !strings.Contains(mainOutput, "main") {
		t.Fatalf("main output = %q err=%v", mainOutput, err)
	}
	child, err := p.SessionArea([]string{"main", "child-1", "grand-1"}, "output")
	if err != nil || !strings.Contains(filepath.ToSlash(child), "main/conversations/child-1/conversations/grand-1/output") {
		t.Fatalf("child output = %q err=%v", child, err)
	}
	task, err := p.TaskArea([]string{"main", "child-1"}, "task-1", "_internal")
	if err != nil || !strings.HasSuffix(filepath.ToSlash(task), "conversations/child-1/tasks/task-1/_internal") {
		t.Fatalf("task area = %q err=%v", task, err)
	}
	spec, err := p.SpecFile([]string{"main", "child-1"})
	if err != nil || !strings.HasSuffix(filepath.ToSlash(spec), "specs/main/conversations/child-1/spec.md") {
		t.Fatalf("spec = %q err=%v", spec, err)
	}
	work, err := p.WorkPath([]string{"main", "child-1"}, "tmp/a.txt")
	if err != nil || !strings.Contains(filepath.ToSlash(work), "work/conversations/child-1/tmp/a.txt") {
		t.Fatalf("work = %q err=%v", work, err)
	}
	if !IsInsideRoot(p.Main, task) || IsInsideRoot(p.Main, filepath.Join(p.Home, "outside.txt")) {
		t.Fatalf("根判断错误")
	}
}

func TestLayoutRejectsTraversalAndInvalidAreas(t *testing.T) {
	p := newPolicy(t)
	if _, err := p.SessionArea([]string{"main", ".."}, "output"); !errors.Is(err, ErrInvalidSessionPath) {
		t.Fatalf("session traversal err = %v", err)
	}
	if _, err := p.SessionArea([]string{"main", "child/evil"}, "output"); !errors.Is(err, ErrInvalidSessionPath) {
		t.Fatalf("session separator err = %v", err)
	}
	if _, err := p.SessionArea([]string{"not-main"}, "output"); !errors.Is(err, ErrInvalidSessionPath) {
		t.Fatalf("root err = %v", err)
	}
	if _, err := p.SessionArea([]string{"main"}, "../output"); !errors.Is(err, ErrInvalidSessionPath) {
		t.Fatalf("area traversal err = %v", err)
	}
	if _, err := p.TaskArea([]string{"main"}, "task/evil", "output"); !errors.Is(err, ErrInvalidTaskPath) {
		t.Fatalf("task traversal err = %v", err)
	}
	if _, err := p.TaskArea([]string{"main"}, "task", "_internal/../output"); !errors.Is(err, ErrInvalidTaskPath) {
		t.Fatalf("task area err = %v", err)
	}
	if _, err := p.ResolveOutput([]string{"main"}, "../secret.txt"); err == nil {
		t.Fatalf("output traversal 应失败")
	}
}

func TestLayoutPathLengthLimit(t *testing.T) {
	p := newPolicy(t)
	longSegment := strings.Repeat("x", 260)
	if _, err := p.SessionArea([]string{"main", longSegment}, "output"); !errors.Is(err, ErrPathTooLong) {
		t.Fatalf("long session path err = %v", err)
	}
	if _, err := p.TaskArea([]string{"main"}, strings.Repeat("t", 260), "output"); !errors.Is(err, ErrPathTooLong) {
		t.Fatalf("long task path err = %v", err)
	}
}
