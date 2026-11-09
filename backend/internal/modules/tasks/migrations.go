package tasks

import (
	"simo/internal/platform/sqlite"
	"context"
	"database/sql"
)

// migrations 创建 tasks 表（M2）与 M5 的阶段/产物表。
func migrations() []sqlite.Migration {
	return []sqlite.Migration{
		{
			Version: 1,
			Name:    "create tasks",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS tasks (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					title TEXT NOT NULL,
					kind TEXT NOT NULL,
					status TEXT NOT NULL,
					payload TEXT NOT NULL,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id, created_at)`)
				return err
			},
		},
		{
			Version: 2,
			Name:    "add task phases and artifacts",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE tasks ADD COLUMN phases TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE tasks ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN summary TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN outcome TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1`,
					`CREATE TABLE IF NOT EXISTS task_artifacts (
						id TEXT PRIMARY KEY,
						task_id TEXT NOT NULL,
						name TEXT NOT NULL,
						rel_path TEXT NOT NULL,
						mime TEXT NOT NULL,
						size INTEGER NOT NULL,
						created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_task_artifacts_task ON task_artifacts(task_id, created_at)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 3,
			Name:    "create workflows and task dependencies",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS workflows (
						id TEXT PRIMARY KEY,
						session_id TEXT NOT NULL,
						title TEXT NOT NULL,
						status TEXT NOT NULL,
						plan_json TEXT NOT NULL DEFAULT '',
						summary TEXT NOT NULL DEFAULT '',
						created_at INTEGER NOT NULL,
						updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_workflows_session ON workflows(session_id, created_at)`,
					`CREATE TABLE IF NOT EXISTS workflow_events (
						id INTEGER PRIMARY KEY AUTOINCREMENT,
						workflow_id TEXT NOT NULL,
						type TEXT NOT NULL,
						payload TEXT NOT NULL,
						created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow ON workflow_events(workflow_id, created_at)`,
					`ALTER TABLE tasks ADD COLUMN workflow_id TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN depends_on_json TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE tasks ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN report_message_id TEXT NOT NULL DEFAULT ''`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 4,
			Name:    "add task budget",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, `ALTER TABLE tasks ADD COLUMN budget_json TEXT NOT NULL DEFAULT '{}'`)
				return err
			},
		},
		{
			Version: 5,
			Name:    "add spec task fields",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE tasks ADD COLUMN spec_id TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN acceptance_keys TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE tasks ADD COLUMN executor_agent_id TEXT NOT NULL DEFAULT ''`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
	}
}
