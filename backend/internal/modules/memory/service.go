package memory

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	corememory "simo/internal/core/memory"
)

const (
	defaultLimit    = 8
	defaultMaxChars = 1600
	maxLimit        = 50
)

// Submit æ˜¯å”¯ä¸€å†™å…¥å£ï¼šå€™é€‰ç”±å•å†™è€…åœ¨æ­¤åˆå¹¶ï¼Œè°ƒç”¨æ–¹ä¸èƒ½ç›´æŽ¥å†™ memory_itemsã€‚
func (m *Module) Submit(ctx context.Context, c corememory.Candidate) (corememory.SubmitResult, error) {
	c = normalizeCandidate(c)
	if c.Content == "" && c.Mode != "retract" {
		return corememory.SubmitResult{}, fmt.Errorf("è®°å¿†å€™é€‰ content ä¸èƒ½ä¸ºç©º")
	}
	if c.Scope == "" {
		c.Scope = corememory.ScopeGlobal
	}
	if utf8.RuneCountInString(c.Content) > 2000 {
		return corememory.SubmitResult{}, fmt.Errorf("记忆 content 超过 2000 字符")
	}
	if !validScope(c.Scope) {
		return corememory.SubmitResult{}, fmt.Errorf("éžæ³•ä½œç”¨åŸŸ %qï¼ˆå…è®¸ global/domain:*/task:*ï¼‰", c.Scope)
	}
	c.Kind = normalizeKind(c.Kind)
	c.Source = normalizeSource(c.Source)
	c.Authority = normalizeAuthority(c.Authority)
	if c.Confidence <= 0 || c.Confidence > 1 {
		c.Confidence = 0.8
	}
	if c.Importance <= 0 {
		c.Importance = 5
	}
	if c.Importance > 10 {
		c.Importance = 10
	}
	mode := strings.ToLower(strings.TrimSpace(c.Mode))
	if mode == "" {
		mode = "assert"
	}
	if mode != "assert" && mode != "replace" && mode != "retract" {
		return corememory.SubmitResult{}, fmt.Errorf("æœªçŸ¥å€™é€‰æ¨¡å¼ %q", mode)
	}

	var result corememory.SubmitResult
	c.Mode = mode
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		now := time.Now().UnixMilli()
		existing, err := findTargetTx(ctx, tx, c, mode)
		if err != nil {
			return err
		}

		switch mode {
		case "retract":
			if existing == nil {
				result.Outcome = "ignored"
				return insertCandidateTx(ctx, tx, c, now, result, "")
			}
			if err := snapshotItemTx(ctx, tx, *existing); err != nil {
				return err
			}
			existing.Status = corememory.StatusRetracted
			existing.Version++
			existing.UpdatedAt = now
			if err := updateItemTx(ctx, tx, *existing); err != nil {
				return err
			}
			result.Item = *existing
			result.Outcome = "retracted"
		case "replace":
			if existing == nil {
				item := newItem(c, now)
				if err := insertItemTx(ctx, tx, item); err != nil {
					return err
				}
				result.Item = item
				result.Outcome = "accepted"
				break
			}
			if normalizeText(existing.Content) == normalizeText(c.Content) {
				if err := snapshotItemTx(ctx, tx, *existing); err != nil {
					return err
				}
				existing.Version++
				existing.UpdatedAt = now
				if err := updateItemTx(ctx, tx, *existing); err != nil {
					return err
				}
				result.Item = *existing
				result.Outcome = "merged"
				break
			}
			// 偏好是单值槽位：重复写入更新现有 active（版本/历史），不因共用 key 转 disputed。
			if isPreferenceSlot(existing, c) {
				if isPreferenceContradiction(existing.Content, c.Content) {
					result, err = markDisputedTx(ctx, tx, c, *existing, now)
					if err != nil {
						return err
					}
					break
				}
				result.Item, err = updatePreferenceTx(ctx, tx, *existing, c, now)
				if err != nil {
					return err
				}
				result.Outcome = "merged"
				break
			}
			// 显式“改成”仍可能是语义冲突（契约验收 §7.4：A/B 都保留并 disputed）。
			result, err = markDisputedTx(ctx, tx, c, *existing, now)
			if err != nil {
				return err
			}
		default:
			if existing == nil {
				item := newItem(c, now)
				if err := insertItemTx(ctx, tx, item); err != nil {
					return err
				}
				result.Item = item
				result.Outcome = "accepted"
				break
			}
			if normalizeText(existing.Content) == normalizeText(c.Content) {
				if err := snapshotItemTx(ctx, tx, *existing); err != nil {
					return err
				}
				if c.Confidence > existing.Confidence {
					existing.Confidence = c.Confidence
				}
				if c.Importance > existing.Importance {
					existing.Importance = c.Importance
				}
				existing.Version++
				existing.UpdatedAt = now
				if err := updateItemTx(ctx, tx, *existing); err != nil {
					return err
				}
				result.Item = *existing
				result.Outcome = "merged"
				break
			}
			// 结构冲突可裁决：user_confirmed 优先于 inferred，但不原地覆盖旧值。
			if isPreferenceSlot(existing, c) {
				if isPreferenceContradiction(existing.Content, c.Content) {
					result, err = markDisputedTx(ctx, tx, c, *existing, now)
					if err != nil {
						return err
					}
					break
				}
				result.Item, err = updatePreferenceTx(ctx, tx, *existing, c, now)
				if err != nil {
					return err
				}
				result.Outcome = "merged"
				break
			}
			if authorityRank(c.Authority) > authorityRank(existing.Authority) {
				if err := snapshotItemTx(ctx, tx, *existing); err != nil {
					return err
				}
				existing.Status = corememory.StatusRetracted
				existing.Version++
				existing.UpdatedAt = now
				if err := updateItemTx(ctx, tx, *existing); err != nil {
					return err
				}
				newItemValue := newItem(c, now)
				if err := insertItemTx(ctx, tx, newItemValue); err != nil {
					return err
				}
				result.Item = newItemValue
				result.Outcome = "accepted"
				break
			}
			// 语义冲突：两条并存，标 disputed，写 conflict。
			result, err = markDisputedTx(ctx, tx, c, *existing, now)
			if err != nil {
				return err
			}
		}
		if result.Item.ID != "" {
			if err := m.syncV3Tx(ctx, tx, c, result.Item, now); err != nil {
				return err
			}
		}
		return insertCandidateTx(ctx, tx, c, now, result, result.Item.ID)
	})
	return result, err
}

func snapshotItemTx(ctx context.Context, tx *sql.Tx, old corememory.Item) error {
	refs, _ := json.Marshal(old.Refs)
	_, err := tx.ExecContext(ctx, `INSERT INTO memory_item_history(
		item_id, kind, scope, content, source, authority, confidence, status, version, refs, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		old.ID, old.Kind, old.Scope, old.Content, old.Source, old.Authority, old.Confidence,
		old.Status, old.Version, string(refs), old.CreatedAt, old.UpdatedAt)
	return err
}

func isPreferenceSlot(existing *corememory.Item, c corememory.Candidate) bool {
	if existing == nil || existing.Kind != corememory.KindPreference || c.Kind != corememory.KindPreference {
		return false
	}
	return normalizeText(existing.Key) == normalizeText(c.Key) && existing.Key != ""
}

func updatePreferenceTx(ctx context.Context, tx *sql.Tx, existing corememory.Item, c corememory.Candidate, now int64) (corememory.Item, error) {
	if err := snapshotItemTx(ctx, tx, existing); err != nil {
		return corememory.Item{}, err
	}
	existing.Content = c.Content
	if c.Source != "" {
		existing.Source = c.Source
	}
	if c.Authority != "" {
		existing.Authority = c.Authority
	}
	if c.Confidence > existing.Confidence {
		existing.Confidence = c.Confidence
	}
	if c.Importance > existing.Importance {
		existing.Importance = c.Importance
	}
	existing.Version++
	existing.UpdatedAt = now
	if err := updateItemTx(ctx, tx, existing); err != nil {
		return corememory.Item{}, err
	}
	return existing, nil
}

// isPreferenceContradiction 只把“同一偏好极性相反”判为矛盾；
// “喜欢咖啡”→“喜欢茶”是偏好更新，不是冲突。
func isPreferenceContradiction(a, b string) bool {
	negA, baseA := preferencePolarity(a)
	negB, baseB := preferencePolarity(b)
	if baseA == "" || baseB == "" || baseA != baseB {
		return false
	}
	return negA != negB
}

func preferencePolarity(text string) (bool, string) {
	normalized := normalizeText(text)
	negative := []string{"不喜欢", "不偏好", "不习惯", "不想要", "不倾向", "不是", "讨厌", "不想", "不要", "不爱", "别", "不", "没"}
	negativeHit := false
	for _, marker := range negative {
		if strings.Contains(normalized, marker) {
			negativeHit = true
			normalized = strings.ReplaceAll(normalized, marker, "")
		}
	}
	remove := []string{"喜欢", "偏好", "习惯", "倾向", "想要", "希望", "爱", "我", "的", "是", "比较", "更", "很", "最", "一点", "些",
		"喝", "吃", "用", "去", "玩", "看", "听", " ", "\t", "\n", "。", "，", ",", ".", ";", "；", "!", "！", "?", "？", "、", "：", ":"}
	for _, token := range remove {
		normalized = strings.ReplaceAll(normalized, token, "")
	}
	return negativeHit, normalized
}

func markDisputedTx(ctx context.Context, tx *sql.Tx, c corememory.Candidate, existing corememory.Item, now int64) (corememory.SubmitResult, error) {
	if err := snapshotItemTx(ctx, tx, existing); err != nil {
		return corememory.SubmitResult{}, err
	}
	conflictID := newID("conf")
	newItemValue := newItem(c, now)
	newItemValue.Status = corememory.StatusDisputed
	newItemValue.ConflictWith = []string{existing.ID}
	existing.Status = corememory.StatusDisputed
	existing.ConflictWith = appendUnique(existing.ConflictWith, newItemValue.ID)
	existing.UpdatedAt = now
	if err := updateItemTx(ctx, tx, existing); err != nil {
		return corememory.SubmitResult{}, err
	}
	if err := insertItemTx(ctx, tx, newItemValue); err != nil {
		return corememory.SubmitResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO memory_conflicts(id, item_a, item_b, reason, created_at)
		VALUES (?, ?, ?, ?, ?)`, conflictID, existing.ID, newItemValue.ID, "semantic", now); err != nil {
		return corememory.SubmitResult{}, err
	}
	return corememory.SubmitResult{Item: newItemValue, Outcome: "disputed", ConflictID: conflictID}, nil
}

// Search 执行 FTS5 检索 + scope 过滤 + 多因子打分；返回前更新使用强度。
func (m *Module) Search(ctx context.Context, req corememory.SearchRequest) (corememory.SearchResult, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	maxChars := req.MaxChars
	if maxChars <= 0 {
		maxChars = defaultMaxChars
	}
	scopes := normalizeScopes(req.Scopes)
	query := strings.TrimSpace(req.Query)
	items := make([]corememory.Item, 0, limit)
	var err error
	if query == "" {
		items, err = m.listActive(ctx, scopes, limit)
	} else {
		items, err = m.searchFTS(ctx, query, scopes, limit)
		if err == nil && len(items) == 0 {
			items, err = m.searchLike(ctx, query, scopes, limit)
		}
	}
	if err != nil {
		return corememory.SearchResult{}, err
	}

	now := time.Now().UnixMilli()
	for i := range items {
		if items[i].Score == nil {
			items[i].Score = scoreItem(items[i], 0, now, false)
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].Score.Total > items[j].Score.Total
	})
	// é…é¢ï¼šæ¡ç›®æ•° + å­—ç¬¦é¢„ç®—ï¼ˆT3 æ£€ç´¢æ¡¶çš„æœ€å°å®žçŽ°ï¼‰ã€‚
	kept := make([]corememory.Item, 0, len(items))
	used := 0
	for _, item := range items {
		cost := utf8.RuneCountInString(item.Content)
		if len(kept) >= limit {
			break
		}
		if used+cost > maxChars && len(kept) > 0 {
			break
		}
		used += cost
		kept = append(kept, item)
	}
	if len(kept) > 0 {
		ids := make([]string, 0, len(kept))
		for _, item := range kept {
			ids = append(ids, item.ID)
		}
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			for _, id := range ids {
				if _, err := tx.ExecContext(ctx, `UPDATE memory_items SET strength = strength + 1, last_used_at = ? WHERE id = ?`, now, id); err != nil {
					return err
				}
			}
			return nil
		})
	}
	m.enrichV3(ctx, kept)
	return corememory.SearchResult{Items: kept, Query: query, Scopes: scopes, Budget: maxChars}, nil
}

func (m *Module) listActive(ctx context.Context, scopes []string, limit int) ([]corememory.Item, error) {
	query := itemSelect + ` WHERE status = 'active'`
	args := []any{}
	query, args = appendScopeFilter(query, args, scopes)
	query += ` ORDER BY importance DESC, updated_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("åˆ—è®°å¿†å¤±è´¥: %w", err)
	}
	defer rows.Close()
	return scanItems(rows)
}

func (m *Module) searchFTS(ctx context.Context, queryText string, scopes []string, limit int) ([]corememory.Item, error) {
	match := queryMatch(queryText)
	if match == "" {
		return nil, nil
	}
	query := `SELECT m.id, m.kind, m.scope, m.key, m.content, m.source, m.authority, m.confidence,
		m.status, m.version, m.importance, m.strength, m.refs, m.conflict_with, m.created_at, m.updated_at,
		bm25(memory_fts) AS rank
		FROM memory_fts JOIN memory_items m ON m.id = memory_fts.item_id
		WHERE memory_fts MATCH ? AND m.status = 'active'`
	args := []any{match}
	query, args = appendScopeFilter(query, args, scopes)
	query += ` ORDER BY rank ASC, m.importance DESC LIMIT ?`
	args = append(args, limit)
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("FTS æ£€ç´¢å¤±è´¥: %w", err)
	}
	defer rows.Close()
	now := time.Now().UnixMilli()
	items := make([]corememory.Item, 0, limit)
	for rows.Next() {
		var item corememory.Item
		var refs, conflicts string
		var rank float64
		if err := rows.Scan(&item.ID, &item.Kind, &item.Scope, &item.Key, &item.Content, &item.Source,
			&item.Authority, &item.Confidence, &item.Status, &item.Version, &item.Importance,
			&item.Strength, &refs, &conflicts, &item.CreatedAt, &item.UpdatedAt, &rank); err != nil {
			return nil, err
		}
		item.Refs = decodeStrings(refs)
		item.ConflictWith = decodeStrings(conflicts)
		item.Score = scoreItem(item, rank, now, true)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (m *Module) searchLike(ctx context.Context, queryText string, scopes []string, limit int) ([]corememory.Item, error) {
	query := itemSelect + ` WHERE status = 'active' AND content LIKE ?`
	args := []any{"%" + queryText + "%"}
	query, args = appendScopeFilter(query, args, scopes)
	query += ` ORDER BY importance DESC, updated_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items, err := scanItems(rows)
	if err != nil {
		return nil, err
	}
	now := time.Now().UnixMilli()
	for i := range items {
		items[i].Score = scoreItem(items[i], 2, now, false)
	}
	return items, nil
}

// Items æ˜¯åªè¯»åˆ—è¡¨ï¼›ä¸æä¾›ç¼–è¾‘å…¥å£ã€‚
func (m *Module) Items(ctx context.Context, filter corememory.ItemFilter) ([]corememory.Item, error) {
	query := itemSelect + ` WHERE 1=1`
	args := []any{}
	if scope := strings.TrimSpace(filter.Scope); scope != "" {
		query, args = appendScopeFilter(query, args, []string{scope})
	}
	status := strings.TrimSpace(filter.Status)
	if status == "" {
		status = corememory.StatusActive
	}
	if status != "all" {
		query += ` AND status = ?`
		args = append(args, status)
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	query += ` ORDER BY updated_at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("åˆ—è®°å¿†æ¡ç›®å¤±è´¥: %w", err)
	}
	defer rows.Close()
	items, err := scanItems(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	m.enrichV3(ctx, items)
	return items, nil
}

// Scopes è¿”å›žå„ä½œç”¨åŸŸæ¡ç›®æ•°ï¼ˆä¸å« retractedï¼‰ã€‚
func (m *Module) Scopes(ctx context.Context) ([]corememory.ScopeInfo, error) {
	rows, err := m.store.Query(ctx, `SELECT scope, count(*) FROM memory_items
		WHERE status != 'retracted' GROUP BY scope ORDER BY scope`)
	if err != nil {
		return nil, fmt.Errorf("åˆ—è®°å¿†ä½œç”¨åŸŸå¤±è´¥: %w", err)
	}
	defer rows.Close()
	out := make([]corememory.ScopeInfo, 0, 8)
	for rows.Next() {
		var info corememory.ScopeInfo
		if err := rows.Scan(&info.Scope, &info.Count); err != nil {
			return nil, err
		}
		out = append(out, info)
	}
	return out, rows.Err()
}

// Conflicts 返回 disputed 成对冲突。
func (m *Module) Conflicts(ctx context.Context) ([]corememory.Conflict, error) {
	rows, err := m.store.Query(ctx, `SELECT id, item_a, item_b, reason, created_at FROM memory_conflicts ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return nil, fmt.Errorf("列冲突失败: %w", err)
	}
	type pairRecord struct {
		id, itemA, itemB, reason string
		createdAt                int64
	}
	records := make([]pairRecord, 0, 8)
	for rows.Next() {
		var rec pairRecord
		if err := rows.Scan(&rec.id, &rec.itemA, &rec.itemB, &rec.reason, &rec.createdAt); err != nil {
			_ = rows.Close()
			return nil, err
		}
		records = append(records, rec)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	// 必须先关闭 rows，再逐条查 item；Store 是单连接。
	if err := rows.Close(); err != nil {
		return nil, err
	}
	pairs := make([]corememory.Conflict, 0, len(records))
	for _, rec := range records {
		itemA, err := m.getItem(ctx, rec.itemA)
		if err != nil {
			return nil, err
		}
		itemB, err := m.getItem(ctx, rec.itemB)
		if err != nil {
			return nil, err
		}
		pairs = append(pairs, corememory.Conflict{
			ID: rec.id, Scope: itemA.Scope, Kind: itemA.Kind, Status: corememory.StatusDisputed,
			Items: []corememory.Item{itemA, itemB}, Reason: rec.reason,
			AskCount: 0, AskPolicy: "defer", Deferred: true, CreatedAt: rec.createdAt,
		})
	}
	return pairs, nil
}

func (m *Module) getItem(ctx context.Context, id string) (corememory.Item, error) {
	row := m.store.QueryRow(ctx, itemSelect+` WHERE id = ?`, id)
	return scanItemRow(row)
}

// ---- SQL helpers ----

const itemSelect = `SELECT id, kind, scope, key, content, source, authority, confidence,
	status, version, importance, strength, refs, conflict_with, created_at, updated_at
	FROM memory_items`

func scanItemRow(row *sql.Row) (corememory.Item, error) {
	var item corememory.Item
	var refs, conflicts string
	if err := row.Scan(&item.ID, &item.Kind, &item.Scope, &item.Key, &item.Content, &item.Source,
		&item.Authority, &item.Confidence, &item.Status, &item.Version, &item.Importance,
		&item.Strength, &refs, &conflicts, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return corememory.Item{}, err
	}
	item.Refs = decodeStrings(refs)
	item.ConflictWith = decodeStrings(conflicts)
	return item, nil
}

func scanItems(rows *sql.Rows) ([]corememory.Item, error) {
	out := make([]corememory.Item, 0, 16)
	for rows.Next() {
		var item corememory.Item
		var refs, conflicts string
		if err := rows.Scan(&item.ID, &item.Kind, &item.Scope, &item.Key, &item.Content, &item.Source,
			&item.Authority, &item.Confidence, &item.Status, &item.Version, &item.Importance,
			&item.Strength, &refs, &conflicts, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		item.Refs = decodeStrings(refs)
		item.ConflictWith = decodeStrings(conflicts)
		out = append(out, item)
	}
	return out, rows.Err()
}

func appendScopeFilter(query string, args []any, scopes []string) (string, []any) {
	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)
		if scope == "" {
			continue
		}
		if strings.HasSuffix(scope, ":") {
			query += ` AND scope LIKE ?`
			args = append(args, scope+"%")
		} else {
			query += ` AND scope = ?`
			args = append(args, scope)
		}
	}
	return query, args
}

func scoreItem(item corememory.Item, rank float64, now int64, fromFTS bool) *corememory.Score {
	rel := 0.5
	if fromFTS {
		rel = 1 / (1 + math.Abs(rank))
		if rel > 1 {
			rel = 1
		}
	}
	imp := float64(item.Importance) / 10
	ageDays := float64(now-item.UpdatedAt) / float64(24*3600*1000)
	if ageDays < 0 {
		ageDays = 0
	}
	rec := math.Exp(-ageDays / 30)
	str := math.Min(1, float64(item.Strength)/5)
	total := 0.55*rel + 0.20*imp + 0.15*rec + 0.10*str
	return &corememory.Score{Relevance: rel, Importance: imp, Recency: rec, Strength: str, Total: total}
}

// ---- item/candidate helpers ----

func findTargetTx(ctx context.Context, tx *sql.Tx, c corememory.Candidate, mode string) (*corememory.Item, error) {
	if c.TargetID != "" {
		row := tx.QueryRowContext(ctx, itemSelect+` WHERE id = ?`, c.TargetID)
		item, err := scanItemRow(row)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return &item, nil
	}
	query := itemSelect + ` WHERE status = 'active' AND scope = ?`
	args := []any{c.Scope}
	if c.Kind != "" {
		query += ` AND kind = ?`
		args = append(args, c.Kind)
	}
	if c.Key != "" {
		query += ` AND key = ?`
		args = append(args, c.Key)
	} else if mode == "assert" {
		// 无结构 key 的断言只做“完全相同内容”的去重，不把无关事实误判为冲突。
		query += ` AND content = ?`
		args = append(args, c.Content)
	}
	query += ` ORDER BY updated_at DESC, created_at DESC LIMIT 1`
	row := tx.QueryRowContext(ctx, query, args...)
	item, err := scanItemRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = mode
	return &item, nil
}

func newItem(c corememory.Candidate, now int64) corememory.Item {
	refs := c.Refs
	if refs == nil {
		refs = []string{}
	}
	return corememory.Item{
		ID:         newID("mem"),
		Kind:       c.Kind,
		Scope:      c.Scope,
		Key:        c.Key,
		Content:    c.Content,
		Source:     c.Source,
		Authority:  c.Authority,
		Confidence: c.Confidence,
		Status:     corememory.StatusActive,
		Version:    1,
		Importance: c.Importance,
		Refs:       refs,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

func insertItemTx(ctx context.Context, tx *sql.Tx, item corememory.Item) error {
	refs, _ := json.Marshal(item.Refs)
	conflicts, _ := json.Marshal(item.ConflictWith)
	if _, err := tx.ExecContext(ctx, `INSERT INTO memory_items(
		id, kind, scope, key, content, source, authority, confidence, status, version,
		importance, strength, refs, conflict_with, last_used_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		item.ID, item.Kind, item.Scope, item.Key, item.Content, item.Source, item.Authority,
		item.Confidence, item.Status, item.Version, item.Importance, item.Strength,
		string(refs), string(conflicts), item.UpdatedAt, item.CreatedAt, item.UpdatedAt); err != nil {
		return err
	}
	return syncFTS(ctx, tx, item.ID, item.Content)
}

func updateItemTx(ctx context.Context, tx *sql.Tx, item corememory.Item) error {
	refs, _ := json.Marshal(item.Refs)
	conflicts, _ := json.Marshal(item.ConflictWith)
	if _, err := tx.ExecContext(ctx, `UPDATE memory_items SET
		kind = ?, scope = ?, key = ?, content = ?, source = ?, authority = ?, confidence = ?,
		status = ?, version = ?, importance = ?, strength = ?, refs = ?, conflict_with = ?,
		created_at = ?, updated_at = ? WHERE id = ?`,
		item.Kind, item.Scope, item.Key, item.Content, item.Source, item.Authority, item.Confidence,
		item.Status, item.Version, item.Importance, item.Strength, string(refs), string(conflicts),
		item.CreatedAt, item.UpdatedAt, item.ID); err != nil {
		return err
	}
	return syncFTS(ctx, tx, item.ID, item.Content)
}

func syncFTS(ctx context.Context, tx *sql.Tx, id, content string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM memory_fts WHERE item_id = ?`, id); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO memory_fts(item_id, content) VALUES (?, ?)`, id, content)
	return err
}

func insertCandidateTx(ctx context.Context, tx *sql.Tx, c corememory.Candidate, now int64, result corememory.SubmitResult, itemID string) error {
	refs, _ := json.Marshal(c.Refs)
	op := "add"
	switch c.Mode {
	case "replace":
		op = "update"
	case "retract":
		op = "retract"
	}
	status := result.Outcome
	if status == "" {
		status = "ignored"
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO memory_candidates(
		id, op, kind, scope, content, source, authority, confidence, refs,
		base_version, status, item_id, conflict_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		newID("cand"), op, c.Kind, c.Scope, c.Content, c.Source, c.Authority, c.Confidence,
		string(refs), 0, status, itemID, result.ConflictID, now)
	return err
}

func normalizeCandidate(c corememory.Candidate) corememory.Candidate {
	c.Mode = strings.ToLower(strings.TrimSpace(c.Mode))
	c.Kind = strings.TrimSpace(c.Kind)
	c.Scope = strings.TrimSpace(c.Scope)
	c.Key = strings.TrimSpace(c.Key)
	c.Content = strings.TrimSpace(c.Content)
	c.Source = strings.TrimSpace(c.Source)
	c.Authority = strings.TrimSpace(c.Authority)
	c.Refs = append([]string(nil), c.Refs...)
	return c
}

func validScope(scope string) bool {
	scope = strings.TrimSpace(scope)
	if scope == corememory.ScopeGlobal {
		return true
	}
	if strings.HasPrefix(scope, "domain:") && len(strings.TrimPrefix(scope, "domain:")) > 0 {
		return true
	}
	if strings.HasPrefix(scope, "task:") && len(strings.TrimPrefix(scope, "task:")) > 0 {
		return true
	}
	return false
}

func normalizeKind(kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case corememory.KindFact, corememory.KindDecision, corememory.KindRequirement,
		corememory.KindProgress, corememory.KindExperience, corememory.KindPreference:
		return strings.ToLower(strings.TrimSpace(kind))
	default:
		return corememory.KindFact
	}
}

func normalizeSource(source string) string {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case corememory.SourceConversation, corememory.SourceTool, corememory.SourceInferred, corememory.SourceUser:
		return strings.ToLower(strings.TrimSpace(source))
	default:
		return corememory.SourceConversation
	}
}

func normalizeAuthority(authority string) string {
	switch strings.ToLower(strings.TrimSpace(authority)) {
	case corememory.AuthorityUserConfirmed, corememory.AuthoritySystemVerified, corememory.AuthorityInferred:
		return strings.ToLower(strings.TrimSpace(authority))
	default:
		return corememory.AuthorityInferred
	}
}

func authorityRank(authority string) int {
	switch authority {
	case corememory.AuthorityUserConfirmed:
		return 3
	case corememory.AuthoritySystemVerified:
		return 2
	default:
		return 1
	}
}

func normalizeText(text string) string {
	return strings.Join(strings.Fields(strings.ToLower(text)), " ")
}

func normalizeScopes(scopes []string) []string {
	out := make([]string, 0, len(scopes))
	seen := make(map[string]bool)
	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)
		if scope == "" || seen[scope] || !validScope(scope) {
			continue
		}
		seen[scope] = true
		out = append(out, scope)
	}
	return out
}

func decodeStrings(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	if out == nil {
		return []string{}
	}
	return out
}

func appendUnique(list []string, value string) []string {
	for _, item := range list {
		if item == value {
			return list
		}
	}
	return append(list, value)
}

func newID(prefix string) string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return prefix + "-" + hex.EncodeToString(buf)
}
