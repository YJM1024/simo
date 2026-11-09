package memory

import (
	"context"
	"database/sql"
	"encoding/json"
	"math"
	"sort"
	"strings"
	"time"
)

// 本地字符 n-gram TF-IDF 向量；无第三方依赖，索引可整块重建。
type localVectorDoc struct {
	kind   string
	refID  string
	tokens []string
}

type vectorRecallStats struct {
	Documents int `json:"documents"`
	Terms     int `json:"terms"`
}

func (m *Module) buildRecallVectorDocs(ctx context.Context) ([]localVectorDoc, error) {
	docs := make([]localVectorDoc, 0, 64)
	rows, err := m.store.Query(ctx, `SELECT id,content FROM memories WHERE status IN ('active','disputed')
		AND content <> '' ORDER BY id`)
	if err == nil {
		for rows.Next() {
			var id, content string
			if rows.Scan(&id, &content) == nil {
				docs = append(docs, localVectorDoc{kind: "memory", refID: id, tokens: recallNGrams(content)})
			}
		}
		_ = rows.Close()
	} else {
		return nil, err
	}
	rows, err = m.store.Query(ctx, `SELECT id,name,canonical_name,aliases_json FROM entities
		WHERE status='active' AND entity_class='semantic' ORDER BY id`)
	if err == nil {
		for rows.Next() {
			var id, name, canonical, aliasesJSON string
			if rows.Scan(&id, &name, &canonical, &aliasesJSON) == nil {
				text := strings.Join([]string{name, canonical, strings.Join(decodeStringArray(aliasesJSON), " ")}, " ")
				docs = append(docs, localVectorDoc{kind: "entity", refID: id, tokens: recallNGrams(text)})
			}
		}
		_ = rows.Close()
	}
	return docs, nil
}

func (m *Module) rebuildRecallVectors(ctx context.Context) (vectorRecallStats, error) {
	docs, err := m.buildRecallVectorDocs(ctx)
	if err != nil {
		return vectorRecallStats{}, err
	}
	df := map[string]int{}
	for _, doc := range docs {
		seen := map[string]bool{}
		for _, term := range doc.tokens {
			if !seen[term] {
				seen[term] = true
				df[term]++
			}
		}
	}
	totalDocs := len(docs)
	if totalDocs == 0 {
		totalDocs = 1
	}
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `DELETE FROM recall_vectors`); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM recall_vector_terms`); err != nil {
			return err
		}
		for term, frequency := range df {
			if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO recall_vector_terms(term,df,updated_at)
				VALUES (?,?,?)`, term, frequency, now); err != nil {
				return err
			}
		}
		for _, doc := range docs {
			tf := map[string]int{}
			for _, term := range doc.tokens {
				tf[term]++
			}
			vector := map[string]float64{}
			norm := 0.0
			tokenCount := float64(len(doc.tokens))
			if tokenCount == 0 {
				continue
			}
			for term, count := range tf {
				idf := math.Log(float64(totalDocs+1)/float64(df[term]+1)) + 1.0
				weight := (float64(count) / tokenCount) * idf
				if weight > 0 {
					vector[term] = weight
					norm += weight * weight
				}
			}
			if len(vector) == 0 {
				continue
			}
			norm = math.Sqrt(norm)
			encoded, _ := json.Marshal(vector)
			if _, err := tx.ExecContext(ctx, `INSERT INTO recall_vectors(kind,ref_id,vector_json,norm,updated_at)
				VALUES (?,?,?,?,?)`, doc.kind, doc.refID, string(encoded), norm, now); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return vectorRecallStats{}, err
	}
	return vectorRecallStats{Documents: len(docs), Terms: len(df)}, nil
}

func recallNGrams(text string) []string {
	normalized := normalizeRecallText(text)
	runes := []rune(normalized)
	if len(runes) == 0 {
		return nil
	}
	out := make([]string, 0, len(runes)*2)
	for n := 2; n <= 3; n++ {
		for i := 0; i+n <= len(runes); i++ {
			term := string(runes[i : i+n])
			if strings.TrimSpace(term) == "" {
				continue
			}
			out = append(out, string(rune('0'+n))+":"+term)
		}
	}
	return out
}

func (m *Module) localVectorSearch(ctx context.Context, query string, topK int) ([]VectorHit, error) {
	if topK <= 0 {
		topK = 20
	}
	terms := map[string]int{}
	rows, err := m.store.Query(ctx, `SELECT term,df FROM recall_vector_terms`)
	if err != nil {
		return nil, ErrVectorUnavailable
	}
	for rows.Next() {
		var term string
		var df int
		if rows.Scan(&term, &df) == nil {
			terms[term] = df
		}
	}
	_ = rows.Close()
	var docCount int
	_ = m.store.QueryRow(ctx, `SELECT COUNT(*) FROM recall_vectors`).Scan(&docCount)
	if docCount == 0 || len(terms) == 0 {
		return nil, ErrVectorUnavailable
	}
	queryTF := map[string]int{}
	for _, term := range recallNGrams(query) {
		queryTF[term]++
	}
	queryVector := map[string]float64{}
	queryNorm := 0.0
	for term, count := range queryTF {
		df := terms[term]
		idf := math.Log(float64(docCount+1)/float64(df+1)) + 1.0
		weight := (float64(count) / float64(len(queryTF))) * idf
		queryVector[term] = weight
		queryNorm += weight * weight
	}
	if queryNorm <= 0 {
		return nil, ErrVectorUnavailable
	}
	queryNorm = math.Sqrt(queryNorm)
	vectorRows, err := m.store.Query(ctx, `SELECT kind,ref_id,vector_json,norm FROM recall_vectors`)
	if err != nil {
		return nil, ErrVectorUnavailable
	}
	hits := make([]VectorHit, 0, topK*2)
	for vectorRows.Next() {
		var kind, refID, vectorJSON string
		var norm float64
		if vectorRows.Scan(&kind, &refID, &vectorJSON, &norm) != nil {
			continue
		}
		var vector map[string]float64
		if json.Unmarshal([]byte(vectorJSON), &vector) != nil || norm <= 0 {
			continue
		}
		dot := 0.0
		for term, weight := range queryVector {
			if value, ok := vector[term]; ok {
				dot += weight * value
			}
		}
		if dot <= 0 {
			continue
		}
		score := dot / (queryNorm * norm)
		hit := VectorHit{Score: score}
		if kind == "memory" {
			hit.ItemID = refID
		} else {
			hit.EntityID = refID
		}
		hits = append(hits, hit)
	}
	_ = vectorRows.Close()
	sort.Slice(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		return firstNonEmpty(hits[i].ItemID, hits[i].EntityID) < firstNonEmpty(hits[j].ItemID, hits[j].EntityID)
	})
	if len(hits) > topK {
		hits = hits[:topK]
	}
	if len(hits) == 0 {
		return nil, ErrVectorUnavailable
	}
	return hits, nil
}
