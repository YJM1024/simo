package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateLegacyDBKeepsOldAndCopiesWAL(t *testing.T) {
	home := t.TempDir()
	oldPath := filepath.Join(home, legacyDBName)
	newPath := filepath.Join(home, "simo.db")
	if err := os.WriteFile(oldPath, []byte("legacy-db"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(oldPath+"-wal", []byte("legacy-wal"), 0o644); err != nil {
		t.Fatal(err)
	}
	migrateLegacyDB(home, newPath)
	if got, err := os.ReadFile(newPath); err != nil || string(got) != "legacy-db" {
		t.Fatalf("new db = %q err=%v", got, err)
	}
	if got, err := os.ReadFile(newPath + "-wal"); err != nil || string(got) != "legacy-wal" {
		t.Fatalf("new wal = %q err=%v", got, err)
	}
	if _, err := os.Stat(oldPath); err != nil {
		t.Fatalf("old db must be kept: %v", err)
	}
	if _, err := os.Stat(oldPath + "-wal"); err != nil {
		t.Fatalf("old wal must be kept: %v", err)
	}
}

func TestMigrateLegacyDBDoesNotOverwriteNewDB(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, legacyDBName), []byte("legacy"), 0o644); err != nil {
		t.Fatal(err)
	}
	newPath := filepath.Join(home, "simo.db")
	if err := os.WriteFile(newPath, []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}
	migrateLegacyDB(home, newPath)
	if got, _ := os.ReadFile(newPath); string(got) != "new" {
		t.Fatalf("new db overwritten: %q", got)
	}
}

func TestMigrateLegacyHomeCopiesWithoutDeleting(t *testing.T) {
	userHome := t.TempDir()
	t.Setenv("USERPROFILE", userHome)
	t.Setenv("HOME", userHome)
	oldHome := filepath.Join(userHome, legacyHomeDirName)
	if err := os.MkdirAll(filepath.Join(oldHome, "workspace"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldHome, "config.local.json"), []byte(`{"model":"mock"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(oldHome, "workspace", "note.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	newHome := filepath.Join(userHome, ".simo")
	migrateLegacyHome(newHome)
	if got, err := os.ReadFile(filepath.Join(newHome, "config.local.json")); err != nil || string(got) != `{"model":"mock"}` {
		t.Fatalf("migrated config = %q err=%v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(newHome, "workspace", "note.txt")); err != nil || string(got) != "hello" {
		t.Fatalf("migrated note = %q err=%v", got, err)
	}
	if _, err := os.Stat(filepath.Join(oldHome, "config.local.json")); err != nil {
		t.Fatalf("old home must be kept: %v", err)
	}
}
