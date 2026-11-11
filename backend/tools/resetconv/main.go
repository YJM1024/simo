package main

import (
	"database/sql"
	"fmt"
	"os"

	_ "modernc.org/sqlite"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: resetconv <db>")
		os.Exit(2)
	}
	db, err := sql.Open("sqlite", os.Args[1])
	if err != nil {
		panic(err)
	}
	defer db.Close()
	if _, err := db.Exec("PRAGMA foreign_keys=OFF"); err != nil {
		panic(err)
	}
	tables := []string{
		"message_attachments", "message_cards", "card_versions", "card_action_receipts", "message_routes",
		"messages", "approvals", "approval_grants", "turns", "session_overviews",
		"task_artifacts", "tasks", "workflow_events", "workflows", "schedule_fires", "schedules",
		"team_triggers", "team_messages", "team_deliverables", "team_member_roles", "team_members",
		"team_template_roles", "team_templates", "teams",
		"spec_evidence", "spec_transitions", "specs",
		"view_pages", "view_versions",
		"raw_messages", "raw_events", "decisions", "attribution", "runtime_checkpoints", "recovery_actions",
	}
	tx, err := db.Begin()
	if err != nil {
		panic(err)
	}
	for _, t := range tables {
		if _, err := tx.Exec("DELETE FROM " + t); err != nil {
			fmt.Println("skip", t, err)
		}
	}
	if _, err := tx.Exec("DELETE FROM sessions WHERE id <> 'main'"); err != nil {
		panic(err)
	}
	if err := tx.Commit(); err != nil {
		panic(err)
	}
	var sessions, messages int
	_ = db.QueryRow("SELECT COUNT(*) FROM sessions").Scan(&sessions)
	_ = db.QueryRow("SELECT COUNT(*) FROM messages").Scan(&messages)
	fmt.Printf("reset done: sessions=%d messages=%d\n", sessions, messages)
}
