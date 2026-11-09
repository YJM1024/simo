package memory

import (
	"context"
	"database/sql"

	"simo/internal/platform/sqlite"
)

// migrations 是记忆地基的表结构（模块命名空间 memory）。
//
// 检索方案结论（本机实测）：
//   - FTS5 trigram：>=3 字中文子串可命中（“项目记忆”命中），2 字查询召回 0；
//   - 因此按 m3-contract §4：>=3 字走 FTS5 trigram，<3 字回退 LIKE。
//   - unicode61 不适合中文短查询（CJK 连续串会被当成整词），V1 不采用。
func migrations() []sqlite.Migration {
	return []sqlite.Migration{
		{
			Version: 1,
			Name:    "create memory tables and fts",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				stmts := []string{
					`CREATE TABLE IF NOT EXISTS memory_items (
					id TEXT PRIMARY KEY,
					kind TEXT NOT NULL,
					scope TEXT NOT NULL,
					key TEXT NOT NULL DEFAULT '',
					content TEXT NOT NULL,
					source TEXT NOT NULL,
					authority TEXT NOT NULL,
					confidence REAL NOT NULL,
					status TEXT NOT NULL,
					version INTEGER NOT NULL,
					importance INTEGER NOT NULL,
					strength INTEGER NOT NULL DEFAULT 0,
					refs TEXT NOT NULL DEFAULT '[]',
					conflict_with TEXT NOT NULL DEFAULT '[]',
					last_used_at INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_scope_status ON memory_items(scope, status)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_kind_status ON memory_items(kind, status)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_items(scope, kind, key)`,
					`CREATE TABLE IF NOT EXISTS memory_item_history (
					history_id INTEGER PRIMARY KEY AUTOINCREMENT,
					item_id TEXT NOT NULL,
					kind TEXT NOT NULL,
					scope TEXT NOT NULL,
					content TEXT NOT NULL,
					source TEXT NOT NULL,
					authority TEXT NOT NULL,
					confidence REAL NOT NULL,
					status TEXT NOT NULL,
					version INTEGER NOT NULL,
					refs TEXT NOT NULL DEFAULT '[]',
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_history_item ON memory_item_history(item_id, version)`,
					`CREATE TABLE IF NOT EXISTS memory_candidates (
					id TEXT PRIMARY KEY,
					op TEXT NOT NULL,
					kind TEXT NOT NULL,
					scope TEXT NOT NULL,
					content TEXT NOT NULL,
					source TEXT NOT NULL,
					authority TEXT NOT NULL,
					confidence REAL NOT NULL,
					refs TEXT NOT NULL DEFAULT '[]',
					base_version INTEGER NOT NULL DEFAULT 0,
					status TEXT NOT NULL,
					item_id TEXT NOT NULL DEFAULT '',
					conflict_id TEXT NOT NULL DEFAULT '',
					created_at INTEGER NOT NULL
				)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_candidates_scope ON memory_candidates(scope, created_at)`,
					`CREATE TABLE IF NOT EXISTS memory_conflicts (
					id TEXT PRIMARY KEY,
					item_a TEXT NOT NULL,
					item_b TEXT NOT NULL,
					reason TEXT NOT NULL,
					created_at INTEGER NOT NULL
				)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_conflicts_pair ON memory_conflicts(item_a, item_b)`,
					`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
					item_id UNINDEXED,
					content,
					tokenize='trigram'
				)`,
				}
				for _, stmt := range stmts {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			Version: 2,
			Name:    "memory v0.3 entities canonical pyramid",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				statements := []string{
					`CREATE TABLE IF NOT EXISTS entities (
						id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
						canonical_name TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]',
						parent_id TEXT NOT NULL DEFAULT '', owner_agent TEXT NOT NULL DEFAULT '',
						attrs_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'active',
						merged_into TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
						sensitivity TEXT NOT NULL DEFAULT 'normal', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind, status)`,
					`CREATE TABLE IF NOT EXISTS entity_relations (
						id TEXT PRIMARY KEY, from_entity TEXT NOT NULL, to_entity TEXT NOT NULL,
						rel_type TEXT NOT NULL, attrs_json TEXT NOT NULL DEFAULT '{}', source TEXT NOT NULL,
						confidence REAL NOT NULL DEFAULT 0.5, valid_from INTEGER NOT NULL,
						valid_to INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
						UNIQUE(from_entity, to_entity, rel_type, valid_from)
					)`,
					`CREATE TABLE IF NOT EXISTS entity_edges (
						from_entity TEXT NOT NULL, to_entity TEXT NOT NULL, rel_type TEXT NOT NULL,
						weight REAL NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL,
						PRIMARY KEY(from_entity, to_entity, rel_type)
					)`,
					`CREATE TABLE IF NOT EXISTS memories (
						id TEXT PRIMARY KEY, type TEXT NOT NULL, sub_type TEXT NOT NULL DEFAULT '',
						owner_agent TEXT NOT NULL DEFAULT 'agent:simo', assertion TEXT NOT NULL DEFAULT 'fact',
						attributed_to TEXT NOT NULL DEFAULT '', fact_key TEXT NOT NULL DEFAULT '',
						content TEXT NOT NULL, canonical_refs_json TEXT NOT NULL DEFAULT '[]',
						raw_refs_json TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL,
						authority TEXT NOT NULL, confidence REAL NOT NULL, status TEXT NOT NULL,
						version INTEGER NOT NULL DEFAULT 1, layer INTEGER NOT NULL DEFAULT 0,
						importance INTEGER NOT NULL DEFAULT 5, strength INTEGER NOT NULL DEFAULT 0,
						last_used_at INTEGER NOT NULL DEFAULT 0, valid_from INTEGER NOT NULL DEFAULT 0,
						valid_until INTEGER NOT NULL DEFAULT 0, sensitivity TEXT NOT NULL DEFAULT 'normal',
						canonicalizer_version TEXT NOT NULL DEFAULT '', content_hash TEXT NOT NULL DEFAULT '',
						canonical_missing INTEGER NOT NULL DEFAULT 0, legacy_kind TEXT NOT NULL DEFAULT '',
						legacy_scope TEXT NOT NULL DEFAULT '', conflict_with_json TEXT NOT NULL DEFAULT '[]',
						created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_memories_type_status ON memories(type,status)`,
					`CREATE INDEX IF NOT EXISTS idx_memories_owner ON memories(owner_agent,status)`,
					`CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_fact_unique ON memories(fact_key)
						WHERE type='semantic' AND status='active' AND fact_key<>''`,
					`CREATE TABLE IF NOT EXISTS mentions (
						id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL, raw_id TEXT NOT NULL DEFAULT '',
						entity_id TEXT NOT NULL DEFAULT '', mention_text TEXT NOT NULL,
						start_offset INTEGER NOT NULL DEFAULT 0, end_offset INTEGER NOT NULL DEFAULT 0,
						role TEXT NOT NULL DEFAULT 'other', resolved INTEGER NOT NULL DEFAULT 0,
						confidence REAL NOT NULL DEFAULT 0.5, created_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS memory_entities (
						memory_id TEXT NOT NULL, entity_id TEXT NOT NULL, role TEXT NOT NULL,
						source TEXT NOT NULL DEFAULT 'canonical',
						PRIMARY KEY(memory_id, entity_id, role)
					)`,
					`CREATE TABLE IF NOT EXISTS entity_facts (
						fact_key TEXT PRIMARY KEY, subject_entity TEXT NOT NULL DEFAULT '',
						predicate TEXT NOT NULL DEFAULT '', qualifier_json TEXT NOT NULL DEFAULT '{}',
						active_memory_id TEXT NOT NULL DEFAULT '', active_since INTEGER NOT NULL DEFAULT 0,
						disputed_memory_ids_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS attribution (
						id TEXT PRIMARY KEY, memory_id TEXT NOT NULL, attributed_to TEXT NOT NULL,
						stance TEXT NOT NULL DEFAULT 'assert', confidence REAL NOT NULL DEFAULT 0.5,
						source TEXT NOT NULL DEFAULT 'canonical', created_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS conflicts (
						id TEXT PRIMARY KEY, type TEXT NOT NULL, memory_a TEXT NOT NULL, memory_b TEXT NOT NULL,
						status TEXT NOT NULL DEFAULT 'open', ask_policy TEXT NOT NULL DEFAULT 'defer',
						ask_count INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '',
						created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS canonical_units (
						id TEXT PRIMARY KEY, canonical_key TEXT NOT NULL UNIQUE,
						canonical_text TEXT NOT NULL, raw_refs_json TEXT NOT NULL DEFAULT '[]',
						frame_json TEXT NOT NULL DEFAULT '{}', intent TEXT NOT NULL DEFAULT '',
						status TEXT NOT NULL DEFAULT 'ok', canonicalizer_version TEXT NOT NULL DEFAULT 'v0.3',
						created_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS raw_messages (
						id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
						text TEXT NOT NULL, canonical_state TEXT NOT NULL DEFAULT 'pending',
						created_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS raw_events (
						id TEXT PRIMARY KEY, type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}',
						canonical_state TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS agent_memory (
						id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, memory_id TEXT NOT NULL DEFAULT '',
						source_conversation_ids_json TEXT NOT NULL DEFAULT '[]',
						source_canonical_ids_json TEXT NOT NULL DEFAULT '[]',
						job_key TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
					)`,
					`CREATE TABLE IF NOT EXISTS pyramid_views (
						id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
					)`,
					`CREATE TABLE IF NOT EXISTS pyramid_nodes (
						id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, level INTEGER NOT NULL,
						view TEXT NOT NULL, text TEXT NOT NULL, coverage REAL NOT NULL DEFAULT 1,
						status TEXT NOT NULL DEFAULT 'active', config_version TEXT NOT NULL DEFAULT 'v1',
						created_at INTEGER NOT NULL, invalid_at INTEGER NOT NULL DEFAULT 0
					)`,
					`CREATE INDEX IF NOT EXISTS idx_pyramid_nodes_entity ON pyramid_nodes(entity_id, level, view, status)`,
					`CREATE TABLE IF NOT EXISTS pyramid_sources (
						node_id TEXT NOT NULL, source_kind TEXT NOT NULL, source_id TEXT NOT NULL,
						source_version INTEGER NOT NULL DEFAULT 1,
						PRIMARY KEY(node_id, source_kind, source_id)
					)`,
					`CREATE TABLE IF NOT EXISTS maintenance_jobs (
						job_key TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
						payload_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL,
						updated_at INTEGER NOT NULL
					)`,
					`ALTER TABLE memory_item_history ADD COLUMN type TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_item_history ADD COLUMN sub_type TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_item_history ADD COLUMN owner_agent TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_item_history ADD COLUMN assertion TEXT NOT NULL DEFAULT 'fact'`,
					`ALTER TABLE memory_item_history ADD COLUMN attributed_to TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_item_history ADD COLUMN fact_key TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_item_history ADD COLUMN canonical_refs_json TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE memory_item_history ADD COLUMN raw_refs_json TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE memory_item_history ADD COLUMN layer INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE memory_item_history ADD COLUMN valid_from INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE memory_item_history ADD COLUMN valid_until INTEGER NOT NULL DEFAULT 0`,
					`ALTER TABLE memory_item_history ADD COLUMN sensitivity TEXT NOT NULL DEFAULT 'normal'`,
					`ALTER TABLE memory_item_history ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN candidate_key TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN type TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN sub_type TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN owner_agent TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN assertion TEXT NOT NULL DEFAULT 'fact'`,
					`ALTER TABLE memory_candidates ADD COLUMN attributed_to TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN fact_key TEXT NOT NULL DEFAULT ''`,
					`ALTER TABLE memory_candidates ADD COLUMN canonical_refs_json TEXT NOT NULL DEFAULT '[]'`,
					`ALTER TABLE memory_candidates ADD COLUMN entity_refs_json TEXT NOT NULL DEFAULT '[]'`,
					`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts_v3 USING fts5(
						memory_id UNINDEXED, content, tokenize='trigram'
					)`,
					`INSERT OR IGNORE INTO pyramid_views(id,name,description) VALUES
						('what_happened','发生了什么','按时间组织事实与事件'),
						('what_is','是什么','实体/属性/状态'),
						('what_should','应该怎样','规范/偏好/约束'),
						('how_to','怎么做','流程/经验'),
						('current_state','当前状态','当前有效事实与待办')`,
					`INSERT OR IGNORE INTO entities(id,kind,name,canonical_name,owner_agent,created_at,updated_at)
						VALUES ('ent-agent-simo','agent','司墨','司墨','agent:simo',0,0)`,
				}
				for _, stmt := range statements {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				// 回填主实体与 memories。
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO entities(id,kind,name,canonical_name,created_at,updated_at)
					SELECT 'ent-' || replace(scope,':','-'), CASE
						WHEN scope LIKE 'task:%' THEN 'task' WHEN scope LIKE 'domain:%' THEN 'domain' ELSE 'domain' END,
						scope, scope, 0, 0 FROM memory_items WHERE scope<>''`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO memories(
					id,type,sub_type,owner_agent,assertion,fact_key,content,source,authority,confidence,status,version,
					importance,strength,valid_from,legacy_kind,legacy_scope,created_at,updated_at,canonical_missing)
					SELECT id,
						CASE kind WHEN 'experience' THEN 'procedural' WHEN 'progress' THEN 'working'
							WHEN 'preference' THEN 'norm' WHEN 'decision' THEN 'norm' ELSE 'semantic' END,
						kind,'agent:simo','fact','',content,source,authority,confidence,status,version,
						importance,strength,created_at,kind,scope,created_at,updated_at,1
					FROM memory_items`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_entities(memory_id,entity_id,role,source)
					SELECT id, 'ent-' || replace(scope,':','-'), 'primary', 'migration' FROM memory_items WHERE scope<>''`); err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO conflicts(id,type,memory_a,memory_b,status,reason,created_at,updated_at)
					SELECT id,'fact_contradiction',item_a,item_b,'open',reason,created_at,created_at FROM memory_conflicts`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_fts_v3(memory_id,content)
					SELECT id,content FROM memory_items WHERE status<>'retracted'`)
				return err
			},
		},
		{
			Version: 3,
			Name:    "M22 recall derived layer",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				statements := []string{
					`ALTER TABLE entities ADD COLUMN entity_class TEXT NOT NULL DEFAULT 'mount'`,
					`UPDATE entities SET entity_class='semantic' WHERE kind IN ('person','place','org','item','event','time','document','project','concept','unknown')`,
					`CREATE INDEX IF NOT EXISTS ix_entities_class ON entities(entity_class, kind, status)`,
					`CREATE TABLE IF NOT EXISTS memory_item_entities (
						item_id TEXT NOT NULL, item_version INTEGER NOT NULL DEFAULT 0, entity_id TEXT NOT NULL,
						role TEXT NOT NULL DEFAULT 'mention', confidence REAL NOT NULL DEFAULT 0.5,
						source TEXT NOT NULL DEFAULT 'extracted', created_at INTEGER NOT NULL DEFAULT 0,
						PRIMARY KEY(item_id, item_version, entity_id, role)
					)`,
					`CREATE INDEX IF NOT EXISTS ix_mie_entity ON memory_item_entities(entity_id, item_version)`,
					`CREATE TABLE IF NOT EXISTS recall_relation_registry (
						rel_type TEXT PRIMARY KEY, domain_kinds TEXT NOT NULL DEFAULT '[]',
						range_kinds TEXT NOT NULL DEFAULT '[]', trigger_terms TEXT NOT NULL DEFAULT '[]',
						directional INTEGER NOT NULL DEFAULT 1, description TEXT NOT NULL DEFAULT '',
						version INTEGER NOT NULL DEFAULT 1
					)`,
					`CREATE TABLE IF NOT EXISTS recall_aliases (
						alias TEXT NOT NULL, entity_id TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'canonical',
						weight REAL NOT NULL DEFAULT 1.0, updated_at INTEGER NOT NULL,
						PRIMARY KEY(alias, entity_id)
					)`,
					`CREATE INDEX IF NOT EXISTS ix_alias_entity ON recall_aliases(entity_id)`,
					`CREATE VIRTUAL TABLE IF NOT EXISTS recall_entity_fts USING fts5(
						entity_id UNINDEXED, name, aliases, tokenize='trigram'
					)`,
					`CREATE TABLE IF NOT EXISTS recall_entity_facts (
						id INTEGER PRIMARY KEY AUTOINCREMENT, subject_entity TEXT NOT NULL,
						predicate TEXT NOT NULL, object_entity TEXT, object_literal TEXT,
						fact_key TEXT NOT NULL DEFAULT '', source_item TEXT NOT NULL,
						source_version INTEGER NOT NULL, confidence REAL NOT NULL DEFAULT 0.5,
						valid_from INTEGER, valid_to INTEGER, created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS ix_ref_subject ON recall_entity_facts(subject_entity, predicate)`,
					`CREATE INDEX IF NOT EXISTS ix_ref_object ON recall_entity_facts(object_entity, predicate)`,
					`CREATE TABLE IF NOT EXISTS recall_edges (
						edge_id TEXT NOT NULL, direction TEXT NOT NULL, src_entity TEXT NOT NULL,
						rel_type TEXT NOT NULL, dst_entity TEXT NOT NULL, source_item TEXT NOT NULL DEFAULT '',
						source_version INTEGER NOT NULL DEFAULT 0, confidence REAL NOT NULL DEFAULT 0.5,
						valid_from INTEGER, valid_to INTEGER, PRIMARY KEY(edge_id, direction)
					)`,
					`CREATE INDEX IF NOT EXISTS ix_edges_src ON recall_edges(src_entity, rel_type, direction)`,
					`CREATE INDEX IF NOT EXISTS ix_edges_dst ON recall_edges(dst_entity, rel_type, direction)`,
					`CREATE TABLE IF NOT EXISTS recall_meta (
						key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`INSERT OR IGNORE INTO recall_relation_registry(rel_type,domain_kinds,range_kinds,trigger_terms,description) VALUES
						('located_in','["org","place"]','["place"]','["位于","在"]','位于'),
						('purchased_at','["item"]','["org","place"]','["买","购买","买于"]','购买于'),
						('works_at','["person"]','["org"]','["任职","工作"]','任职'),
						('part_of','[]','[]','["属于","一部分"]','属于'),
						('attended','["person"]','["event"]','["参加","出席"]','参加'),
						('held_at','["event"]','["place","time"]','["发生","举行"]','发生于'),
						('belongs_to','[]','[]','["属于"]','归属'),
						('about','[]','[]','["关于"]','关于'),
						('owned_by','[]','[]','["负责","拥有"]','负责'),
						('references','[]','[]','["引用"]','引用')`,
				}
				for _, stmt := range statements {
					if _, err := tx.ExecContext(ctx, stmt); err != nil {
						return err
					}
				}
				_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO recall_edges(
					edge_id,direction,src_entity,rel_type,dst_entity,source_item,source_version,confidence,valid_from,valid_to)
					SELECT id,'forward',from_entity,rel_type,to_entity,'',0,confidence,valid_from,valid_to FROM entity_relations`)
				return err
			},
		},
		{
			Version: 4,
			Name:    "normalize agent brand",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, `UPDATE entities SET name='司墨', canonical_name='司墨' WHERE id='ent-agent-simo'`)
				return err
			},
		},
		{
			Version: 5,
			Name:    "M30 memory consolidation",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS memory_consolidation_jobs (
						id TEXT PRIMARY KEY, session_id TEXT NOT NULL, agent_id TEXT NOT NULL DEFAULT 'agent:simo',
						trigger TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'done',
						source_json TEXT NOT NULL DEFAULT '[]', candidate_count INTEGER NOT NULL DEFAULT 0,
						created_count INTEGER NOT NULL DEFAULT 0, merged_count INTEGER NOT NULL DEFAULT 0,
						conflict_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0,
						reason TEXT NOT NULL DEFAULT '', idempotency_key TEXT NOT NULL UNIQUE,
						created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_jobs_session ON memory_consolidation_jobs(session_id, created_at DESC)`,
					`CREATE TABLE IF NOT EXISTS memory_consolidation_state (
						session_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL DEFAULT 'agent:simo',
						last_message_id TEXT NOT NULL DEFAULT '', last_run_at INTEGER NOT NULL DEFAULT 0,
						processed_messages INTEGER NOT NULL DEFAULT 0
					)`,
					`CREATE TABLE IF NOT EXISTS memory_writeback_audit (
						id TEXT PRIMARY KEY, job_id TEXT NOT NULL, session_id TEXT NOT NULL,
						agent_id TEXT NOT NULL, target TEXT NOT NULL DEFAULT 'session',
						memory_id TEXT NOT NULL DEFAULT '', content_hash TEXT NOT NULL DEFAULT '',
						outcome TEXT NOT NULL DEFAULT '', source_json TEXT NOT NULL DEFAULT '[]',
						created_at INTEGER NOT NULL
					)`,
					`CREATE INDEX IF NOT EXISTS idx_memory_writeback_job ON memory_writeback_audit(job_id, target)`,
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
			Name:    "M32 local TF-IDF recall vectors",
			Up: func(ctx context.Context, tx *sql.Tx) error {
				for _, stmt := range []string{
					`CREATE TABLE IF NOT EXISTS recall_vectors (
						kind TEXT NOT NULL, ref_id TEXT NOT NULL, vector_json TEXT NOT NULL,
						norm REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
						PRIMARY KEY(kind, ref_id)
					)`,
					`CREATE INDEX IF NOT EXISTS idx_recall_vectors_kind ON recall_vectors(kind)`,
					`CREATE TABLE IF NOT EXISTS recall_vector_terms (
						term TEXT PRIMARY KEY, df INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
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
