package sessions

import (
	"context"
	"database/sql"
	"time"

	"simo/internal/platform/sqlite"
)

// migrations 创建 sessions 表，并种下默认会话 main；v2 增加会话树 parent_id。
func migrations() []sqlite.Migration {
	return []sqlite.Migration{
		{
			Version: 1,
			Name:    "create sessions and seed default",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS sessions (
					id TEXT PRIMARY KEY,
					title TEXT NOT NULL,
					created_at INTEGER NOT NULL,
					archived INTEGER NOT NULL DEFAULT 0
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx,
					`INSERT OR IGNORE INTO sessions(id, title, created_at, archived) VALUES (?, ?, ?, 0)`,
					DefaultSessionID, DefaultSessionTitle, time.Now().UnixMilli())
				return err
			},
		},
		{
			Version: 2,
			Name:    "add sessions parent_id",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `UPDATE sessions SET parent_id = '' WHERE id = ?`, DefaultSessionID); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id, created_at)`)
				return err
			},
		},
		{
			Version: 3,
			Name:    "create session specs",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS specs (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL UNIQUE,
					status TEXT NOT NULL,
					version INTEGER NOT NULL,
					acceptance_keys TEXT NOT NULL DEFAULT '[]',
					evidence TEXT NOT NULL DEFAULT '[]',
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				)`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_specs_session ON specs(session_id)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO specs(id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at)
					SELECT 'spec-' || id, id, 'draft', 1, '[]', '[]', created_at, created_at FROM sessions`)
				return err
			},
		},
		{
			Version: 4,
			Name:    "create session overviews",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS session_overviews (
					session_id TEXT PRIMARY KEY,
					goal TEXT NOT NULL DEFAULT '',
					constraints TEXT NOT NULL DEFAULT '',
					current TEXT NOT NULL DEFAULT '',
					completed TEXT NOT NULL DEFAULT '',
					pending TEXT NOT NULL DEFAULT '',
					notes TEXT NOT NULL DEFAULT '',
					timeline TEXT NOT NULL DEFAULT '',
					version INTEGER NOT NULL DEFAULT 1,
					updated_at INTEGER NOT NULL DEFAULT 0
				)`)
				return err
			},
		},
		{
			Version: 5,
			Name:    "add pinned and owner agent",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE sessions ADD COLUMN owner_agent_id TEXT NOT NULL DEFAULT 'simo'`,
					`UPDATE sessions SET owner_agent_id = 'simo' WHERE owner_agent_id = ''`,
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
			Name:    "M18 spec core",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE specs ADD COLUMN goal TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE specs ADD COLUMN constraints TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE specs ADD COLUMN current TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE specs ADD COLUMN plan TEXT NOT NULL DEFAULT '{}'`,
					`ALTER TABLE specs ADD COLUMN executor_agent_id TEXT NOT NULL DEFAULT 'agent:task-npc'`,
					`ALTER TABLE specs ADD COLUMN state_reason TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE specs ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE specs ADD COLUMN last_injected_version INTEGER NOT NULL DEFAULT 0`,
					`UPDATE specs SET executor_agent_id = 'agent:task-npc' WHERE executor_agent_id = ''`,
					`CREATE TABLE IF NOT EXISTS spec_transitions (
						id TEXT PRIMARY KEY,
						spec_id TEXT NOT NULL,
						session_id TEXT NOT NULL,
						from_status TEXT NOT NULL,
						to_status TEXT NOT NULL,
						version INTEGER NOT NULL,
						reason TEXT NOT NULL DEFAULT '',
						actor TEXT NOT NULL DEFAULT 'system',
						created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_spec_transitions_spec ON spec_transitions(spec_id, version)`,
					`CREATE TABLE IF NOT EXISTS spec_evidence (
						id TEXT PRIMARY KEY,
						spec_id TEXT NOT NULL,
						session_id TEXT NOT NULL,
						acceptance_key TEXT NOT NULL,
						task_id TEXT NOT NULL DEFAULT '',
						kind TEXT NOT NULL,
						ref TEXT NOT NULL,
						hash TEXT NOT NULL DEFAULT '',
						created_at INTEGER NOT NULL,
						invalidated_at INTEGER NOT NULL DEFAULT 0,
						invalid_reason TEXT NOT NULL DEFAULT '',
						UNIQUE(spec_id, acceptance_key, ref)
					)`,
					`ALTER TABLE session_overviews ADD COLUMN source_spec_version INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE session_overviews ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0`,
					`INSERT OR IGNORE INTO spec_evidence(id, spec_id, session_id, acceptance_key, task_id, kind, ref, hash, created_at)
					 SELECT 'ev-migrate-' || id, id, session_id, 'legacy', '', 'user_confirm', id, '', updated_at FROM specs`,
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
