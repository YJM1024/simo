package main

import (
	"context"
	"database/sql"
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
		e.WorkspaceRel = filepath.ToSlash(strings.TrimPrefix(strings.TrimPrefix(e.TargetAbs, filepath.Join(home, "workspace")), string(filepath.Separator)))
		if _, err := os.Stat(e.Source); err != nil {
			e.Status = "missing-source"
			report.Missing = append(report.Missing, e.ID)
		} else if len([]byte(e.TargetAbs)) > 240 {
			e.Status = "path-too-long"
			report.LongPaths = append(report.LongPaths, e.TargetAbs)
		} else {
			e.Status = "ready"
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

func applyPlan(home string, report planReport, backupDir string) error {
	backupDir = strings.TrimSpace(backupDir)
	if backupDir == "" {
		backupDir = filepath.Join(home, "backups", "workspace-migrate-"+time.Now().Format("20060102-150405"))
	}
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
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
	for _, entry := range report.Entries {
		if entry.Status != "ready" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(entry.TargetAbs), 0o755); err != nil {
			return err
		}
		if err := copyFile(entry.Source, entry.TargetAbs); err != nil {
			return err
		}
	}
	return db.Write(context.Background(), func(tx *sql.Tx) error {
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
}

func verifyHome(home string) error {
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.Query(context.Background(), `SELECT id, COALESCE(storage_scope,'legacy_artifacts'), COALESCE(workspace_rel_path,'')
		FROM task_artifacts`)
	if err != nil {
		return err
	}
	defer rows.Close()
	missing := 0
	workspace := 0
	for rows.Next() {
		var id, scope, rel string
		if err := rows.Scan(&id, &scope, &rel); err != nil {
			return err
		}
		if scope != "workspace" {
			continue
		}
		workspace++
		if _, err := os.Stat(filepath.Join(home, "workspace", filepath.FromSlash(rel))); err != nil {
			missing++
		}
	}
	if missing > 0 {
		return fmt.Errorf("verify failed: %d workspace artifact(s) missing", missing)
	}
	fmt.Printf("verify ok: workspace_artifacts=%d\n", workspace)
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
