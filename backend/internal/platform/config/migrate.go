package config

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Legacy migration constants are intentionally kept only here: renamed data is
// copied forward once, and the old files are never deleted.
const (
	legacyHomeDirName = "." + "agentd"
	legacyDBName      = "agent" + "d.db"
)

func migrateLegacyHome(newHome string) {
	if newHome == "" {
		return
	}
	if _, err := os.Stat(newHome); err == nil {
		return
	}
	defaultHome := legacyDefaultHome()
	if defaultHome == "" || filepath.Clean(defaultHome) == filepath.Clean(newHome) {
		return
	}
	if _, err := os.Stat(defaultHome); err != nil {
		return
	}
	if err := copyTree(defaultHome, newHome); err != nil {
		fmt.Fprintf(os.Stderr, "[simo] legacy home migration failed: %v\n", err)
		return
	}
	fmt.Fprintf(os.Stderr, "[simo] migrated legacy home %s -> %s (old data kept)\n", defaultHome, newHome)
}

func legacyDefaultHome() string {
	userHome, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(userHome) == "" {
		return ""
	}
	return filepath.Join(userHome, legacyHomeDirName)
}

func migrateLegacyDB(home, dbPath string) {
	if dbPath == "" || strings.TrimSpace(dbPath) == "" {
		return
	}
	if filepath.Base(dbPath) != "simo.db" {
		return
	}
	if _, err := os.Stat(dbPath); err == nil {
		return
	}
	legacyPath := filepath.Join(home, legacyDBName)
	if _, err := os.Stat(legacyPath); err != nil {
		return
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		src := legacyPath + suffix
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if err := copyFile(src, dbPath+suffix); err != nil {
			fmt.Fprintf(os.Stderr, "[simo] legacy db migration failed: %v\n", err)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "[simo] migrated legacy db %s -> %s (old data kept)\n", legacyPath, dbPath)
}

func copyTree(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return copyFile(src, dst)
	}
	if err := os.MkdirAll(dst, info.Mode().Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyTree(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(srcPath, dstPath); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
