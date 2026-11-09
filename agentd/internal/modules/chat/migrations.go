package chat

import (
	"context"
	"database/sql"

	"agentd/internal/platform/sqlite"
)

// migrations 创建 messages 表（v1）与 M2 的 turns/decisions（v2）。
func migrations() []sqlite.Migration {
	return []sqlite.Migration{
		{
			Version: 1,
			Name:    "create messages",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS messages (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					role TEXT NOT NULL,
					text TEXT NOT NULL,
					at INTEGER NOT NULL,
					status TEXT NOT NULL
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_messages_session_at ON messages(session_id, at)`)
				return err
			},
		},
		{
			Version: 2,
			Name:    "create turns and decisions",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS turns (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					status TEXT NOT NULL,
					started_at INTEGER NOT NULL,
					ended_at INTEGER NOT NULL DEFAULT 0
				)`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, started_at)`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS decisions (
					id TEXT PRIMARY KEY,
					turn_id TEXT NOT NULL,
					kind TEXT NOT NULL,
					payload TEXT NOT NULL,
					created_at INTEGER NOT NULL
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_decisions_turn ON decisions(turn_id, created_at)`)
				return err
			},
		},
		{
			Version: 3,
			Name:    "create tool approvals",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS approvals (
					id TEXT PRIMARY KEY,
					tool TEXT NOT NULL,
					args TEXT NOT NULL,
					status TEXT NOT NULL,
					result TEXT NOT NULL DEFAULT '',
					created_at INTEGER NOT NULL,
					decided_at INTEGER NOT NULL DEFAULT 0
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at)`)
				return err
			},
		},
		{
			Version: 4,
			Name:    "create uploads and message attachments",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS uploads (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					name TEXT NOT NULL,
					rel_path TEXT NOT NULL,
					mime TEXT NOT NULL,
					size INTEGER NOT NULL,
					created_at INTEGER NOT NULL
				)`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_uploads_session ON uploads(session_id, created_at)`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS message_attachments (
					id TEXT PRIMARY KEY,
					message_id TEXT NOT NULL,
					upload_id TEXT NOT NULL,
					name TEXT NOT NULL,
					rel_path TEXT NOT NULL,
					mime TEXT NOT NULL,
					size INTEGER NOT NULL,
					created_at INTEGER NOT NULL
				)`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, created_at)`)
				return err
			},
		},
		{
			Version: 5,
			Name:    "extend approvals for M9 sandbox",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				columns := []string{
					`ALTER TABLE approvals ADD COLUMN risk TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE approvals ADD COLUMN sandbox TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE approvals ADD COLUMN session_id TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE approvals ADD COLUMN decision TEXT NOT NULL DEFAULT ''`,
				}
				for _, statement := range columns {
					if _, err := tx.ExecContext(ctx, statement); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 6,
			Name:    "create session approval grants",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS approval_grants (
					id TEXT PRIMARY KEY,
					session_id TEXT NOT NULL,
					tool TEXT NOT NULL,
					grant_key TEXT NOT NULL,
					created_at INTEGER NOT NULL,
					UNIQUE(session_id, tool, grant_key)
				)`); err != nil {
					return err
				}
				return nil
			},
		},
		{
			Version: 7,
			Name:    "add message task and workflow metadata",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE messages ADD COLUMN task_id TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE messages ADD COLUMN workflow_id TEXT NOT NULL DEFAULT ''`,
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
			Name:    "add message approval report metadata",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`ALTER TABLE messages ADD COLUMN tool TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE messages ADD COLUMN approval_id TEXT NOT NULL DEFAULT ''`,
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
			Name:    "create schedules",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS schedules (
						id TEXT PRIMARY KEY,
						session_id TEXT NOT NULL,
						title TEXT NOT NULL DEFAULT '',
						trigger_type TEXT NOT NULL,
						trigger_expr TEXT NOT NULL,
						timezone TEXT NOT NULL DEFAULT '',
						prompt TEXT NOT NULL,
						enabled INTEGER NOT NULL DEFAULT 1,
						next_run_at INTEGER NOT NULL DEFAULT 0,
						last_run_at INTEGER NOT NULL DEFAULT 0,
						last_status TEXT NOT NULL DEFAULT 'pending',
						run_count INTEGER NOT NULL DEFAULT 0,
						created_at INTEGER NOT NULL,
						updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(enabled, next_run_at)`,
					`CREATE TABLE IF NOT EXISTS schedule_fires (
						schedule_id TEXT NOT NULL,
						due_at INTEGER NOT NULL,
						created_at INTEGER NOT NULL,
						PRIMARY KEY(schedule_id, due_at)
					)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 10,
			Name:    "add message category",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `ALTER TABLE messages ADD COLUMN category TEXT NOT NULL DEFAULT ''`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `UPDATE messages SET category = 'consultation' WHERE role = 'agent'`)
				return err
			},
		},
		{
			Version: 11,
			Name:    "add message reply_to",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, `ALTER TABLE messages ADD COLUMN reply_to_id TEXT NOT NULL DEFAULT ''`)
				return err
			},
		},
		{
			Version: 12,
			Name:    "M19 long runtime",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS tool_effects (
						effect_key TEXT PRIMARY KEY,
						session_id TEXT NOT NULL,
						task_id TEXT NOT NULL DEFAULT '',
						attempt INTEGER NOT NULL DEFAULT 1,
						tool TEXT NOT NULL,
						result_ref TEXT NOT NULL DEFAULT '',
						status TEXT NOT NULL,
						created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_tool_effects_session ON tool_effects(session_id)`,
					`CREATE TABLE IF NOT EXISTS runtime_checkpoints (
						id TEXT PRIMARY KEY,
						scope TEXT NOT NULL,
						ref_id TEXT NOT NULL,
						attempt INTEGER NOT NULL DEFAULT 1,
						at INTEGER NOT NULL,
						event_seq INTEGER NOT NULL DEFAULT 0,
						state_json TEXT NOT NULL DEFAULT '{}',
						reason TEXT NOT NULL DEFAULT '',
						created_at INTEGER NOT NULL,
						UNIQUE(scope, ref_id, attempt, at)
					)`,
					`CREATE TABLE IF NOT EXISTS recovery_actions (
						id TEXT PRIMARY KEY,
						at INTEGER NOT NULL,
						scope TEXT NOT NULL,
						ref_id TEXT NOT NULL,
						action TEXT NOT NULL,
						detail_json TEXT NOT NULL DEFAULT '{}',
						event_seq INTEGER NOT NULL DEFAULT 0
					)`,
					`CREATE TABLE IF NOT EXISTS report_log (
						report_key TEXT PRIMARY KEY,
						session_id TEXT NOT NULL,
						workflow_id TEXT NOT NULL DEFAULT '',
						task_id TEXT NOT NULL DEFAULT '',
						kind TEXT NOT NULL,
						message_id TEXT NOT NULL DEFAULT '',
						at INTEGER NOT NULL
					)`,
					`ALTER TABLE approvals ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE approvals ADD COLUMN timeout_action TEXT NOT NULL DEFAULT 'deny_and_pause'`,
					`ALTER TABLE approvals ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}'`,
					`ALTER TABLE approvals ADD COLUMN notified_at INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE approvals ADD COLUMN decided_by TEXT NOT NULL DEFAULT ''`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 13,
			Name:    "M24 team v1",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS teams (
						id TEXT PRIMARY KEY, name TEXT NOT NULL, lead_session_id TEXT NOT NULL,
						status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_teams_lead ON teams(lead_session_id)`,
					`CREATE TABLE IF NOT EXISTS team_members (
						id TEXT PRIMARY KEY, team_id TEXT NOT NULL, session_id TEXT NOT NULL UNIQUE,
						role_key TEXT NOT NULL DEFAULT '', role_type TEXT NOT NULL DEFAULT 'generic',
						agent_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id, status)`,
					`CREATE TABLE IF NOT EXISTS team_messages (
						id TEXT PRIMARY KEY, team_id TEXT NOT NULL, from_session_id TEXT NOT NULL,
						to_session_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'direct',
						payload_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'queued',
						correlation_id TEXT NOT NULL DEFAULT '', idempotency_key TEXT NOT NULL UNIQUE,
						created_at INTEGER NOT NULL, delivered_at INTEGER NOT NULL DEFAULT 0
					)`,
					`CREATE INDEX IF NOT EXISTS idx_team_messages_to ON team_messages(to_session_id, status, created_at)`,
					`CREATE TABLE IF NOT EXISTS team_triggers (
						id TEXT PRIMARY KEY, team_id TEXT NOT NULL, from_member_id TEXT NOT NULL DEFAULT '',
						to_member_id TEXT NOT NULL DEFAULT '', on_event TEXT NOT NULL DEFAULT '',
						condition_json TEXT NOT NULL DEFAULT '{}', action_json TEXT NOT NULL DEFAULT '{}',
						status TEXT NOT NULL DEFAULT 'active', retry_count INTEGER NOT NULL DEFAULT 0,
						max_retries INTEGER NOT NULL DEFAULT 2, idempotency_key TEXT NOT NULL UNIQUE,
						created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS team_deliverables (
						id TEXT PRIMARY KEY, team_id TEXT NOT NULL, from_member_id TEXT NOT NULL DEFAULT '',
						to_member_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'summary',
						artifact_id TEXT NOT NULL DEFAULT '', ref_path TEXT NOT NULL DEFAULT '',
						summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ready',
						created_at INTEGER NOT NULL
					)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 14,
			Name:    "M25 team v2 templates/triggers",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS team_templates (
						id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
						inherits_from TEXT NOT NULL DEFAULT '', base_persona TEXT NOT NULL DEFAULT 'simo',
						status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS team_template_roles (
						id TEXT PRIMARY KEY, template_id TEXT NOT NULL, role_key TEXT NOT NULL,
						title TEXT NOT NULL, role_type TEXT NOT NULL DEFAULT 'generic',
						agent_id TEXT NOT NULL DEFAULT '', persona_override TEXT NOT NULL DEFAULT '',
						tools_json TEXT NOT NULL DEFAULT '[]', model TEXT NOT NULL DEFAULT '',
						responsibilities TEXT NOT NULL DEFAULT '', inputs_json TEXT NOT NULL DEFAULT '[]',
						outputs_json TEXT NOT NULL DEFAULT '[]', inherits_from TEXT NOT NULL DEFAULT '',
						order_index INTEGER NOT NULL DEFAULT 0,
						UNIQUE(template_id, role_key)
					)`,
					`CREATE TABLE IF NOT EXISTS team_member_roles (
						team_id TEXT NOT NULL, member_id TEXT NOT NULL, template_id TEXT NOT NULL DEFAULT '',
						role_key TEXT NOT NULL DEFAULT '', persona_version TEXT NOT NULL DEFAULT 'v1',
						PRIMARY KEY(team_id, member_id)
					)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				// V2 团队可挂模板；V1 团队为空。
				for _, stmt := range []string{
					`ALTER TABLE teams ADD COLUMN template_id TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE teams ADD COLUMN template_version INTEGER NOT NULL DEFAULT 0`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 15,
			Name:    "M26 view schema pages",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS view_pages (
						id TEXT PRIMARY KEY, session_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
						schema_json TEXT NOT NULL, current_version INTEGER NOT NULL DEFAULT 0,
						status TEXT NOT NULL DEFAULT 'active', created_by TEXT NOT NULL DEFAULT 'agent',
						created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_view_pages_session ON view_pages(session_id, status, updated_at DESC)`,
					`CREATE TABLE IF NOT EXISTS view_versions (
						page_id TEXT NOT NULL, version INTEGER NOT NULL, schema_json TEXT NOT NULL,
						created_by TEXT NOT NULL, created_at INTEGER NOT NULL, base_version INTEGER NOT NULL DEFAULT 0,
						reason TEXT NOT NULL DEFAULT '', schema_hash TEXT NOT NULL DEFAULT '',
						PRIMARY KEY(page_id, version)
					)`,
					`CREATE INDEX IF NOT EXISTS idx_view_versions_page ON view_versions(page_id, version DESC)`,
				} {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 16,
			Name:    "M41 interactive cards",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS message_cards (
						id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL,
						schema_json TEXT NOT NULL, fallback_text TEXT NOT NULL,
						version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active',
						expires_at INTEGER NOT NULL DEFAULT 0,
						created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_message_cards_session ON message_cards(session_id, updated_at DESC)`,
					`CREATE INDEX IF NOT EXISTS idx_message_cards_message ON message_cards(message_id)`,
					`CREATE TABLE IF NOT EXISTS card_versions (
						card_id TEXT NOT NULL, version INTEGER NOT NULL, schema_json TEXT NOT NULL,
						fallback_text TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
						PRIMARY KEY(card_id, version)
					)`,
					`CREATE TABLE IF NOT EXISTS card_action_receipts (
						card_id TEXT NOT NULL, action_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
						idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'processing',
						result_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
						PRIMARY KEY(card_id, action_id, payload_hash)
					)`,
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
