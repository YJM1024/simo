package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"simo/internal/platform/sqlite"
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
		{
			Version: 6,
			Name:    "classify task artifacts as user delivery or internal",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `ALTER TABLE task_artifacts ADD COLUMN delivery_kind TEXT NOT NULL DEFAULT ''`); err != nil {
					return err
				}
				// 历史兼容：会话级生成物是用户交付物；任务作业产物（report-attempt/log/checkpoint）是内部过程文件。
				_, err := tx.ExecContext(ctx, `UPDATE task_artifacts SET delivery_kind = CASE
					WHEN task_id LIKE 'session:%' THEN 'user_delivery'
					ELSE 'internal'
				END WHERE delivery_kind = ''`)
				return err
			},
		},
		{
			Version: 7,
			Name:    "M82 workspace artifact storage scope",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE task_artifacts ADD COLUMN storage_scope TEXT NOT NULL DEFAULT 'legacy_artifacts'`,
					`ALTER TABLE task_artifacts ADD COLUMN workspace_rel_path TEXT NOT NULL DEFAULT ''`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 8,
			Name:    "P1-CONV-009 task session fields",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE tasks ADD COLUMN mode TEXT NOT NULL DEFAULT 'plan'`,
					`ALTER TABLE tasks ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN goal TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN inputs_json TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE tasks ADD COLUMN constraints_json TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE tasks ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}'`,
					`ALTER TABLE tasks ADD COLUMN waiting_reason TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN waiting_since INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN finished_at INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN fail_reason TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE tasks ADD COLUMN deadline_at INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN deadline_reminded_at INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE tasks ADD COLUMN trigger_count INTEGER NOT NULL DEFAULT 0`,
					`CREATE INDEX IF NOT EXISTS idx_tasks_session_updated ON tasks(session_id, updated_at)`,
					`CREATE INDEX IF NOT EXISTS idx_tasks_batch ON tasks(batch_id)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 9,
			Name:    "P1-CONV-009 steps, traces, batches, deps",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS task_steps (
						id TEXT PRIMARY KEY,
						task_id TEXT NOT NULL,
						seq INTEGER NOT NULL,
						title TEXT NOT NULL,
						status TEXT NOT NULL,
						summary TEXT NOT NULL DEFAULT '',
						fail_reason TEXT NOT NULL DEFAULT '',
						started_at INTEGER NOT NULL DEFAULT 0,
						finished_at INTEGER NOT NULL DEFAULT 0
					)`,
					`CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id, seq)`,
					`CREATE UNIQUE INDEX IF NOT EXISTS uq_task_steps_seq ON task_steps(task_id, seq)`,
					`CREATE TABLE IF NOT EXISTS task_traces (
						id TEXT PRIMARY KEY,
						task_id TEXT NOT NULL,
						step_id TEXT NOT NULL DEFAULT '',
						seq INTEGER NOT NULL,
						category TEXT NOT NULL,
						tool TEXT NOT NULL DEFAULT '',
						text TEXT NOT NULL,
						at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_task_traces_task ON task_traces(task_id, seq)`,
					`CREATE TABLE IF NOT EXISTS task_batches (
						id TEXT PRIMARY KEY,
						session_id TEXT NOT NULL,
						client_mutation_id TEXT NOT NULL DEFAULT '',
						task_count INTEGER NOT NULL,
						message_id TEXT NOT NULL DEFAULT '',
						created_at INTEGER NOT NULL
					)`,
					`CREATE UNIQUE INDEX IF NOT EXISTS uq_task_batches_mutation
						ON task_batches(session_id, client_mutation_id) WHERE client_mutation_id <> ''`,
					`CREATE TABLE IF NOT EXISTS task_deps (
						task_id TEXT NOT NULL,
						dep_id TEXT NOT NULL,
						join_mode TEXT NOT NULL DEFAULT 'all',
						created_at INTEGER NOT NULL,
						PRIMARY KEY (task_id, dep_id)
					)`,
					`CREATE INDEX IF NOT EXISTS idx_task_deps_dep ON task_deps(dep_id)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				// 回填旧 steps JSON；解析失败的行跳过，旧列保留只读。
				rows, err := tx.QueryContext(ctx, `SELECT id, steps FROM tasks`)
				if err != nil {
					return err
				}
				type legacyTask struct {
					id    string
					steps string
				}
				var legacy []legacyTask
				for rows.Next() {
					var item legacyTask
					if err := rows.Scan(&item.id, &item.steps); err != nil {
						rows.Close()
						return err
					}
					legacy = append(legacy, item)
				}
				if err := rows.Err(); err != nil {
					rows.Close()
					return err
				}
				rows.Close()
				for _, item := range legacy {
					var steps []struct {
						ID     string `json:"id"`
						Title  string `json:"title"`
						Status string `json:"status"`
					}
					if err := json.Unmarshal([]byte(item.steps), &steps); err != nil {
						continue
					}
					for i, step := range steps {
						title := step.Title
						if title == "" {
							title = step.ID
						}
						status := step.Status
						switch status {
						case "pending", "running", "done", "failed", "skipped":
						default:
							status = "pending"
						}
						if status == "running" {
							status = "pending"
						}
						if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO task_steps
							(id, task_id, seq, title, status, summary, fail_reason, started_at, finished_at)
							VALUES (?, ?, ?, ?, ?, '', '', 0, 0)`,
							"step-"+randomHex(8), item.id, i+1, title, status); err != nil {
							return err
						}
					}
				}
				return nil
			},
		},
		{
			Version: 10,
			Name:    "P2-TASK-003 end message",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, `ALTER TABLE tasks ADD COLUMN end_message_id TEXT NOT NULL DEFAULT ''`)
				return err
			},
		},
		{
			Version: 11,
			Name:    "P2-TASK-004 complexity and task plans",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				// 历史任务不回填分级：空串表示「历史任务·未分级」，前端据此显示。
				if _, err := tx.ExecContext(ctx, `ALTER TABLE tasks ADD COLUMN complexity TEXT NOT NULL DEFAULT ''`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS task_plans (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					complexity TEXT NOT NULL,
					status TEXT NOT NULL,
					plan_message_id TEXT NOT NULL DEFAULT '',
					plan_steps_json TEXT NOT NULL DEFAULT '[]',
					child_session_ids TEXT NOT NULL DEFAULT '[]',
					task_ids_json TEXT NOT NULL DEFAULT '[]',
					request_text TEXT NOT NULL DEFAULT '',
					task_count INTEGER NOT NULL DEFAULT 0,
					child_session_count INTEGER NOT NULL DEFAULT 0,
					attempt INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					decided_at INTEGER NOT NULL DEFAULT 0,
					expires_at INTEGER NOT NULL DEFAULT 0,
					rejected_reason TEXT NOT NULL DEFAULT ''
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_task_plans_session_status ON task_plans(session_id, status)`)
				return err
			},
		},
	}
}
