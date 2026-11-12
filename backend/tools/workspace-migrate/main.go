package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"simo/internal/platform/sqlite"
)

type artifactEntry struct {
	ID           string `json:"id"`
	TaskID       string `json:"taskId"`
	SessionID    string `json:"sessionId"`
	Name         string `json:"name"`
	DeliveryKind string `json:"deliveryKind"`
	StorageScope string `json:"storageScope"`
	WorkspaceRel string `json:"workspaceRelPath"`
	Source       string `json:"source"`
	TargetAbs    string `json:"targetAbs"`
	SourceSHA256 string `json:"sourceSha256,omitempty"`
	TargetSHA256 string `json:"targetSha256,omitempty"`
	Status       string `json:"status"`
	Reason       string `json:"reason,omitempty"`
}

type planReport struct {
	Home      string          `json:"home"`
	Counts    map[string]int  `json:"counts"`
	Entries   []artifactEntry `json:"entries"`
	Conflicts []string        `json:"conflicts,omitempty"`
	LongPaths []string        `json:"longPaths,omitempty"`
	Missing   []string        `json:"missing,omitempty"`
}

func main() {
	mode := flag.String("mode", "plan", "plan|apply|verify|rollback")
	home := flag.String("home", "", "isolated SIMO_HOME")
	backup := flag.String("backup", "", "backup dir for apply/rollback")
	flag.Parse()
	if strings.TrimSpace(*home) == "" {
		fmt.Fprintln(os.Stderr, "-home is required")
		os.Exit(2)
	}
	var err error
	switch *mode {
	case "plan":
		var report planReport
		report, err = buildPlan(*home)
		if err == nil {
			err = writeJSON(report)
		}
	case "apply":
		var report planReport
		report, err = buildPlan(*home)
		if err == nil {
			err = applyPlan(*home, report, *backup)
		}
	case "verify":
		err = verifyHome(*home)
	case "rollback":
		if strings.TrimSpace(*backup) == "" {
			err = fmt.Errorf("-backup required for rollback")
		} else {
			err = rollbackHome(*home, *backup)
		}
	default:
		err = fmt.Errorf("unknown mode %q", *mode)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "workspace-migrate:", err)
		os.Exit(1)
	}
}

func buildPlan(home string) (planReport, error) {
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		return planReport{}, err
	}
	defer db.Close()
	sessions := map[string]string{}
	rows, err := db.Query(context.Background(), `SELECT id, COALESCE(parent_id,'') FROM sessions`)
	if err != nil {
		return planReport{}, err
	}
	for rows.Next() {
		var id, parent string
		if err := rows.Scan(&id, &parent); err == nil {
			sessions[id] = parent
		}
	}
	_ = rows.Close()
	tasks := map[string]string{}
	rows, err = db.Query(context.Background(), `SELECT id, COALESCE(session_id,'') FROM tasks`)
	if err != nil {
		return planReport{}, err
	}
	for rows.Next() {
		var id, session string
		if err := rows.Scan(&id, &session); err == nil {
			tasks[id] = session
		}
	}
	_ = rows.Close()
	report := planReport{Home: home, Counts: map[string]int{}}
	targets := map[string]int{}
	scopeExpr, workspaceExpr := "'legacy_artifacts'", "''"
	if hasColumn(db, "task_artifacts", "storage_scope") {
		scopeExpr = "COALESCE(storage_scope,'legacy_artifacts')"
	}
	if hasColumn(db, "task_artifacts", "workspace_rel_path") {
		workspaceExpr = "COALESCE(workspace_rel_path,'')"
	}
	rows, err = db.Query(context.Background(), `SELECT id, task_id, name, rel_path, delivery_kind,
		`+scopeExpr+`, `+workspaceExpr+`
		FROM task_artifacts ORDER BY created_at, id`)
	if err != nil {
		return planReport{}, err
	}
	for rows.Next() {
		var e artifactEntry
		var relPath string
		if err := rows.Scan(&e.ID, &e.TaskID, &e.Name, &relPath, &e.DeliveryKind, &e.StorageScope, &e.WorkspaceRel); err != nil {
			return planReport{}, err
		}
		if strings.HasPrefix(e.TaskID, "session:") {
			e.SessionID = strings.TrimPrefix(e.TaskID, "session:")
		} else {
			e.SessionID = tasks[e.TaskID]
		}
		e.Source = filepath.Join(home, "artifacts", relPath)
		segments := sessionSegments(e.SessionID, sessions)
		base := filepath.Join(home, "workspace", "main")
		for i := 2; i < len(segments); i += 2 {
			base = filepath.Join(base, "conversations", segments[i])
		}
		switch {
		case e.DeliveryKind == "user_delivery" && !strings.HasPrefix(e.TaskID, "session:"):
			base = filepath.Join(base, "tasks", e.TaskID, "output")
		case e.DeliveryKind == "user_delivery":
			base = filepath.Join(base, "output")
		default:
			base = filepath.Join(base, "tasks", e.TaskID, "_internal")
		}
		e.TargetAbs = filepath.Join(base, filepath.Base(e.Name))
		if rel, err := filepath.Rel(filepath.Join(home, "workspace"), e.TargetAbs); err == nil {
			e.WorkspaceRel = filepath.ToSlash(rel)
		}
		e.SourceSHA256, _ = fileSHA256(e.Source)
		switch {
		case !insidePath(filepath.Join(home, "artifacts"), e.Source):
			e.Status = "unsafe-source"
			e.Reason = "source outside artifacts root"
		case !insidePath(filepath.Join(home, "workspace"), e.TargetAbs):
			e.Status = "unsafe-target"
			e.Reason = "target outside workspace root"
		case !safeSegment(e.TaskID):
			e.Status = "unsafe-task"
			e.Reason = "taskId contains path separators or traversal"
		default:
			if _, err := os.Stat(e.Source); err != nil {
				e.Status = "missing-source"
				report.Missing = append(report.Missing, e.ID)
			} else if len([]byte(e.TargetAbs)) > 240 {
				e.Status = "path-too-long"
				report.LongPaths = append(report.LongPaths, e.TargetAbs)
			} else {
				e.Status = "ready"
			}
		}
		targets[e.TargetAbs]++
		report.Counts[e.DeliveryKind]++
		report.Entries = append(report.Entries, e)
	}
	if err := rows.Err(); err != nil {
		return planReport{}, err
	}
	_ = rows.Close()
	for target, count := range targets {
		if count > 1 {
			report.Conflicts = append(report.Conflicts, target)
		}
	}
	report.Counts["total"] = len(report.Entries)
	return report, nil
}

func sessionSegments(sessionID string, sessions map[string]string) []string {
	if sessionID == "" || sessionID == "main" {
		return []string{"main"}
	}
	reversed := []string{}
	seen := map[string]bool{}
	current := sessionID
	for current != "" && current != "main" && !seen[current] {
		seen[current] = true
		reversed = append(reversed, current)
		current = sessions[current]
	}
	segments := []string{"main"}
	for i := len(reversed) - 1; i >= 0; i-- {
		segments = append(segments, "conversations", reversed[i])
	}
	return segments
}

func safeSegment(value string) bool {
	if strings.TrimSpace(value) == "" || value == "." || value == ".." {
		return false
	}
	if strings.ContainsAny(value, `/\`) || filepath.IsAbs(value) || filepath.VolumeName(value) != "" {
		return false
	}
	return true
}

func insidePath(root, candidate string) bool {
	rel, err := filepath.Rel(filepath.Clean(root), filepath.Clean(candidate))
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func fileSHA256(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func writeManifest(dir string, report planReport) error {
	if strings.TrimSpace(dir) == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "manifest.json"), raw, 0o644)
}

func applyPlan(home string, report planReport, backupDir string) error {
	backupDir = strings.TrimSpace(backupDir)
	if backupDir == "" {
		backupDir = filepath.Join(home, "backups", "workspace-migrate-"+time.Now().Format("20060102-150405"))
	}
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return err
	}
	if err := writeManifest(backupDir, report); err != nil {
		return err
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		src := filepath.Join(home, "simo.db"+suffix)
		if _, err := os.Stat(src); err == nil {
			if err := copyFile(src, filepath.Join(backupDir, "simo.db"+suffix)); err != nil {
				return err
			}
		}
	}
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	if err := ensureArtifactColumns(db); err != nil {
		return err
	}
	for i := range report.Entries {
		entry := &report.Entries[i]
		if entry.Status != "ready" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(entry.TargetAbs), 0o755); err != nil {
			return err
		}
		if err := copyFile(entry.Source, entry.TargetAbs); err != nil {
			return err
		}
		targetHash, err := fileSHA256(entry.TargetAbs)
		if err != nil {
			return err
		}
		entry.TargetSHA256 = targetHash
		if entry.SourceSHA256 != "" && targetHash != entry.SourceSHA256 {
			return fmt.Errorf("hash mismatch after copy: %s", entry.ID)
		}
	}
	err = db.Write(context.Background(), func(tx *sql.Tx) error {
		for _, entry := range report.Entries {
			if entry.Status != "ready" {
				continue
			}
			if _, err := tx.ExecContext(context.Background(), `UPDATE task_artifacts
				SET storage_scope='workspace', workspace_rel_path=? WHERE id=?`,
				filepath.ToSlash(entry.WorkspaceRel), entry.ID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return writeManifest(backupDir, report)
}

func verifyHome(home string) error {
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.Query(context.Background(), `SELECT id, COALESCE(storage_scope,'legacy_artifacts'),
		COALESCE(workspace_rel_path,''), COALESCE(rel_path,'') FROM task_artifacts`)
	if err != nil {
		return err
	}
	defer rows.Close()
	missing := 0
	mismatch := 0
	workspace := 0
	for rows.Next() {
		var id, scope, rel, legacyRel string
		if err := rows.Scan(&id, &scope, &rel, &legacyRel); err != nil {
			return err
		}
		if scope != "workspace" {
			continue
		}
		workspace++
		target := filepath.Join(home, "workspace", filepath.FromSlash(rel))
		if _, err := os.Stat(target); err != nil {
			missing++
			continue
		}
		if legacyRel == "" {
			continue
		}
		source := filepath.Join(home, "artifacts", filepath.FromSlash(legacyRel))
		if _, err := os.Stat(source); err != nil {
			continue
		}
		sourceHash, err1 := fileSHA256(source)
		targetHash, err2 := fileSHA256(target)
		if err1 != nil || err2 != nil || sourceHash != targetHash {
			mismatch++
		}
	}
	if missing > 0 {
		return fmt.Errorf("verify failed: %d workspace artifact(s) missing", missing)
	}
	if mismatch > 0 {
		return fmt.Errorf("verify failed: %d artifact(s) hash mismatch", mismatch)
	}
	fmt.Printf("verify ok: workspace_artifacts=%d hash_checked=%d\n", workspace, workspace)
	return nil
}

func rollbackHome(home, backupDir string) error {
	src := filepath.Join(backupDir, "simo.db")
	if _, err := os.Stat(src); err != nil {
		return fmt.Errorf("backup db not found: %s", src)
	}
	return copyFile(src, filepath.Join(home, "simo.db"))
}

func writeJSON(value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	fmt.Println(string(raw))
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

func hasColumn(db *sqlite.DB, table, column string) bool {
	rows, err := db.Query(context.Background(), `PRAGMA table_info(`+table+`)`)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var defaultValue any
		if err := rows.Scan(&cid, &name, &typ, &notNull, &defaultValue, &pk); err != nil {
			continue
		}
		if name == column {
			return true
		}
	}
	return false
}

func ensureArtifactColumns(db *sqlite.DB) error {
	for _, stmt := range []struct {
		column string
		sql    string
	}{
		{"storage_scope", `ALTER TABLE task_artifacts ADD COLUMN storage_scope TEXT NOT NULL DEFAULT 'legacy_artifacts'`},
		{"workspace_rel_path", `ALTER TABLE task_artifacts ADD COLUMN workspace_rel_path TEXT NOT NULL DEFAULT ''`},
	} {
		if hasColumn(db, "task_artifacts", stmt.column) {
			continue
		}
		if err := db.Write(context.Background(), func(tx *sql.Tx) error {
			_, err := tx.ExecContext(context.Background(), stmt.sql)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}
