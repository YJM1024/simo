package memory

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"strings"

	corememory "agentd/internal/core/memory"
)

func canonicalIDFor(text string, refs []string) string {
	raw, _ := json.Marshal(refs)
	material := strings.Join(refs, "|") + "|v0.3|" + text + "|" + string(raw)
	sum := sha256.Sum256([]byte(material))
	return "can-" + hex.EncodeToString(sum[:12])
}

func contentHash(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:16])
}

// syncV3Tx 双写 v0.3 主表；与旧 memory_items 同一事务。
func (m *Module) syncV3Tx(ctx context.Context, tx *sql.Tx, c corememory.Candidate, item corememory.Item, now int64) error {
	itemType := strings.TrimSpace(c.Type)
	if itemType == "" {
		switch c.Kind {
		case "experience":
			itemType = "procedural"
		case "progress":
			itemType = "working"
		case "preference", "decision":
			itemType = "norm"
		default:
			itemType = "semantic"
		}
	}
	owner := strings.TrimSpace(c.OwnerAgent)
	if owner == "" {
		owner = "agent:simo"
	}
	assertion := strings.TrimSpace(c.Assertion)
	if assertion == "" {
		assertion = "fact"
	}
	if assertion == "opinion" && strings.TrimSpace(c.AttributedTo) == "" {
		assertion = "fact"
	}
	factKey := strings.TrimSpace(c.FactKey)
	if factKey == "" && itemType == "semantic" && assertion == "fact" {
		factKey = "legacy|" + contentHash(item.Content)
	}
	refs := c.CanonicalRefs
	if len(refs) == 0 {
		refs = []string{canonicalIDFor(item.Content, c.Refs)}
	}
	canonicalID := refs[0]
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO canonical_units(
		id, canonical_key, canonical_text, raw_refs_json, frame_json, intent, status, canonicalizer_version, created_at)
		VALUES (?, ?, ?, ?, '{}', 'assert', 'ok', 'v0.3', ?)`,
		canonicalID, canonicalID, item.Content, mustJSON(c.Refs), now); err != nil {
		return err
	}
	status := item.Status
	if status == "" {
		status = corememory.StatusActive
	}
	if factKey != "" && status == corememory.StatusActive {
		var existingID, existingContent string
		err := tx.QueryRowContext(ctx, `SELECT id, content FROM memories
			WHERE type='semantic' AND status='active' AND fact_key=? AND id<>? LIMIT 1`, factKey, item.ID).
			Scan(&existingID, &existingContent)
		if err == nil && normalizeText(existingContent) != normalizeText(item.Content) {
			status = corememory.StatusDisputed
			conflictID := newID("conf")
			_, _ = tx.ExecContext(ctx, `INSERT OR IGNORE INTO conflicts(
				id, type, memory_a, memory_b, status, ask_policy, reason, created_at, updated_at)
				VALUES (?, 'fact_contradiction', ?, ?, 'open', 'defer', '同 factKey 不同值', ?, ?)`,
				conflictID, existingID, item.ID, now, now)
			item.ConflictWith = appendUnique(item.ConflictWith, existingID)
		}
	}
	sensitivity := strings.TrimSpace(c.Sensitivity)
	if sensitivity == "" {
		sensitivity = "normal"
	}
	rawRefs := mustJSON(c.Refs)
	canonicalRefs := mustJSON(refs)
	conflicts := mustJSON(item.ConflictWith)
	layer := item.Layer
	if layer == 0 {
		switch itemType {
		case "scene":
			layer = 0
		case "semantic", "norm":
			layer = 1
		case "procedural":
			layer = 2
		case "working":
			layer = 0
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO memories(
		id,type,sub_type,owner_agent,assertion,attributed_to,fact_key,content,canonical_refs_json,
		raw_refs_json,source,authority,confidence,status,version,layer,importance,strength,last_used_at,
		valid_from,valid_until,sensitivity,canonicalizer_version,content_hash,canonical_missing,
		legacy_kind,legacy_scope,conflict_with_json,created_at,updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(id) DO UPDATE SET
			type=excluded.type, sub_type=excluded.sub_type, owner_agent=excluded.owner_agent,
			assertion=excluded.assertion, attributed_to=excluded.attributed_to, fact_key=excluded.fact_key,
			content=excluded.content, canonical_refs_json=excluded.canonical_refs_json,
			raw_refs_json=excluded.raw_refs_json, source=excluded.source, authority=excluded.authority,
			confidence=excluded.confidence, status=excluded.status, version=excluded.version,
			layer=excluded.layer, importance=excluded.importance, strength=excluded.strength,
			valid_from=excluded.valid_from, valid_until=excluded.valid_until,
			sensitivity=excluded.sensitivity, canonicalizer_version=excluded.canonicalizer_version,
			content_hash=excluded.content_hash, canonical_missing=0,
			legacy_kind=excluded.legacy_kind, legacy_scope=excluded.legacy_scope,
			conflict_with_json=excluded.conflict_with_json, updated_at=excluded.updated_at`,
		item.ID, itemType, c.Kind, owner, assertion, strings.TrimSpace(c.AttributedTo), factKey,
		item.Content, canonicalRefs, rawRefs, item.Source, item.Authority, item.Confidence, status,
		item.Version, layer, item.Importance, item.Strength, item.UpdatedAt, item.CreatedAt, 0,
		sensitivity, "v0.3", contentHash(item.Content), 0, item.Kind, item.Scope, conflicts,
		item.CreatedAt, item.UpdatedAt); err != nil {
		return err
	}
	if assertion == "opinion" && c.AttributedTo != "" {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO attribution(
			id, memory_id, attributed_to, stance, confidence, source, created_at)
			VALUES (?, ?, ?, 'assert', ?, 'canonical', ?)`,
			newID("attr"), item.ID, c.AttributedTo, item.Confidence, now); err != nil {
			return err
		}
	}
	entityIDs := c.EntityRefs
	if len(entityIDs) == 0 && item.Scope != "" {
		entityIDs = []string{entityIDForScope(item.Scope)}
	}
	if len(entityIDs) == 0 {
		entityIDs = []string{"ent-agent-simo"}
	}
	for _, entityID := range entityIDs {
		if entityID == "" {
			continue
		}
		_, _ = tx.ExecContext(ctx, `INSERT OR IGNORE INTO entities(
			id,kind,name,canonical_name,owner_agent,created_at,updated_at)
			VALUES (?, 'domain', ?, ?, ?, ?, ?)`, entityID, entityID, entityID, owner, now, now)
		_, _ = tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_entities(memory_id,entity_id,role,source)
			VALUES (?, ?, 'primary', 'canonical')`, item.ID, entityID)
	}
	if factKey != "" {
		disputed := "[]"
		if status == corememory.StatusDisputed {
			disputed = mustJSON([]string{item.ID})
		}
		active := item.ID
		if status != corememory.StatusActive {
			active = ""
		}
		_, _ = tx.ExecContext(ctx, `INSERT INTO entity_facts(fact_key,subject_entity,predicate,qualifier_json,
			active_memory_id,active_since,disputed_memory_ids_json,updated_at)
			VALUES (?, ?, 'legacy', '{}', ?, ?, ?, ?)
			ON CONFLICT(fact_key) DO UPDATE SET
				active_memory_id=CASE WHEN excluded.active_memory_id<>'' THEN excluded.active_memory_id ELSE entity_facts.active_memory_id END,
				disputed_memory_ids_json=excluded.disputed_memory_ids_json, updated_at=excluded.updated_at`,
			factKey, firstEntity(entityIDs), active, now, disputed, now)
	}
	if len(entityIDs) > 0 && item.Content != "" {
		for _, view := range []string{"what_happened", "what_is", "what_should", "how_to", "current_state"} {
			nodeID := "pyr-" + item.ID + "-" + view
			_, _ = tx.ExecContext(ctx, `INSERT OR REPLACE INTO pyramid_nodes(
				id, entity_id, level, view, text, coverage, status, config_version, created_at, invalid_at)
				VALUES (?, ?, 0, ?, ?, 1.0, 'active', 'v1', ?, 0)`,
				nodeID, entityIDs[0], view, item.Content, now)
			_, _ = tx.ExecContext(ctx, `INSERT OR IGNORE INTO pyramid_sources(node_id, source_kind, source_id, source_version)
				VALUES (?, 'memory', ?, ?)`, nodeID, item.ID, item.Version)
		}
	}
	_, _ = tx.ExecContext(ctx, `DELETE FROM memory_fts_v3 WHERE memory_id = ?`, item.ID)
	if status != corememory.StatusRetracted {
		_, _ = tx.ExecContext(ctx, `INSERT INTO memory_fts_v3(memory_id,content) VALUES (?,?)`, item.ID, item.Content)
	}
	if item.ConflictWith != nil {
		for _, other := range item.ConflictWith {
			_, _ = tx.ExecContext(ctx, `INSERT OR IGNORE INTO conflicts(
				id,type,memory_a,memory_b,status,reason,created_at,updated_at)
				VALUES (?, 'fact_contradiction', ?, ?, 'open', 'legacy conflict', ?, ?)`,
				"conf-"+item.ID+"-"+other, item.ID, other, now, now)
		}
	}
	return nil
}

func entityIDForScope(scope string) string {
	return "ent-" + strings.ReplaceAll(scope, ":", "-")
}

func firstEntity(ids []string) string {
	if len(ids) > 0 {
		return ids[0]
	}
	return ""
}

func mustJSON(value any) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}
func (m *Module) enrichV3(ctx context.Context, items []corememory.Item) {
	if !m.v3Read {
		return
	}
	for i := range items {
		var itemType, subType, owner, assertion, attributedTo, factKey, canonicalRefs, contentHashValue string
		var layer, validFrom, validUntil int64
		err := m.store.QueryRow(ctx, `SELECT type,sub_type,owner_agent,assertion,attributed_to,fact_key,
			canonical_refs_json,layer,valid_from,valid_until,content_hash FROM memories WHERE id=?`, items[i].ID).
			Scan(&itemType, &subType, &owner, &assertion, &attributedTo, &factKey,
				&canonicalRefs, &layer, &validFrom, &validUntil, &contentHashValue)
		if err != nil {
			continue
		}
		items[i].Type = itemType
		items[i].SubType = subType
		items[i].OwnerAgent = owner
		items[i].Assertion = assertion
		items[i].AttributedTo = attributedTo
		items[i].FactKey = factKey
		items[i].Layer = int(layer)
		items[i].ValidFrom = validFrom
		items[i].ValidUntil = validUntil
		_ = json.Unmarshal([]byte(canonicalRefs), &items[i].CanonicalRefs)
		var entityIDs []string
		if rows, err := m.store.Query(ctx, `SELECT entity_id FROM memory_entities WHERE memory_id=?`, items[i].ID); err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					entityIDs = append(entityIDs, id)
				}
			}
			_ = rows.Close()
		}
		items[i].EntityRefs = entityIDs
		if rows, err := m.store.Query(ctx, `SELECT attributed_to,stance,confidence,source FROM attribution WHERE memory_id=?`, items[i].ID); err == nil {
			for rows.Next() {
				var attribution corememory.Attribution
				if rows.Scan(&attribution.AttributedTo, &attribution.Stance, &attribution.Confidence, &attribution.Source) == nil {
					items[i].Attribution = append(items[i].Attribution, attribution)
				}
			}
			_ = rows.Close()
		}
	}
}
