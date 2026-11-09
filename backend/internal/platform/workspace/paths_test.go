package workspace

import (
	"errors"
	"path/filepath"
	"testing"
)

func TestResolveInsideRoots(t *testing.T) {
	home := t.TempDir()
	p, err := New(home, filepath.Join(home, "workspace"), filepath.Join(home, "artifacts"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	got, err := p.ResolveWorkspace("notes/a.txt")
	if err != nil {
		t.Fatalf("ResolveWorkspace: %v", err)
	}
	want := filepath.Join(home, "workspace", "notes", "a.txt")
	if got != want {
		t.Fatalf("ResolveWorkspace = %q, want %q", got, want)
	}
}

func TestResolveRejectsEscapes(t *testing.T) {
	home := t.TempDir()
	p, err := New(home, filepath.Join(home, "workspace"), filepath.Join(home, "artifacts"))
	if err != nil {
		t.Fatal(err)
	}
	cases := []string{"", "../outside.txt", "a/../../outside.txt", "C:\\Windows\\x", "/etc/passwd"}
	for _, rel := range cases {
		if _, err := p.ResolveWorkspace(rel); !errors.Is(err, ErrEscape) {
			t.Errorf("ResolveWorkspace(%q) err = %v, want ErrEscape", rel, err)
		}
	}
}
