package memory

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"

	"agentd/internal/core/eventlog"
	corememory "agentd/internal/core/memory"
	"agentd/internal/core/module"
	"agentd/internal/core/store"
)

// Module 同时实现 core/module.Module 与 core/memory.Service。
type Module struct {
	store           *store.Store
	events          *eventlog.Logger
	log             *slog.Logger
	v3Read          bool
	vectorRetriever VectorRetriever

	ctx    context.Context
	cancel context.CancelFunc
	unsub  func()
	wg     sync.WaitGroup

	taskMu    sync.Mutex
	taskTitle map[string]string
}

var _ corememory.Service = (*Module)(nil)
var _ module.Module = (*Module)(nil)

// New 创建 memory 模块。
func New(st *store.Store, events *eventlog.Logger, logger *slog.Logger) *Module {
	v3 := true
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AGENTD_MEMORY_V3"))) {
	case "0", "false", "off", "v2":
		v3 = false
	}
	return &Module{store: st, events: events, log: logger, v3Read: v3, taskTitle: make(map[string]string)}
}

// SetVectorRetriever 注入 R2 向量检索实现；默认 nil 表示降级。
func (m *Module) SetVectorRetriever(retriever VectorRetriever) { m.vectorRetriever = retriever }

// ID 实现 module.Module。
func (m *Module) ID() string { return "memory" }

func (m *Module) debugRecallEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AGENTD_DEBUG"))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// DependsOn 实现 module.Module；memory 不依赖业务模块，Task done 经事件触发。
func (m *Module) DependsOn() []string { return nil }

// Migrations 实现 module.Module。
func (m *Module) Migrations() []module.Migration { return migrations() }

// Register 实现 module.Module：只读 API，无编辑入口。
func (m *Module) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/memory", m.handleSearch)
	mux.HandleFunc("GET /api/memory/scopes", m.handleScopes)
	mux.HandleFunc("GET /api/memory/items", m.handleItems)
	mux.HandleFunc("GET /api/memory/conflicts", m.handleConflicts)
	m.registerV3(mux)
	m.registerRecall(mux)
	m.registerConsolidation(mux)
}

// Start 订阅事件总线，用于 Task done → 候选写回。
func (m *Module) Start(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	m.ctx, m.cancel = context.WithCancel(ctx)
	sub, unsub := m.events.Subscribe(m.ctx)
	m.unsub = unsub
	m.wg.Add(1)
	go m.consumeEvents(sub)
	if consolidationEnabled() {
		m.wg.Add(1)
		go m.consolidationLoop()
	}
	m.log.Debug("module started", "module", m.ID())
	return nil
}

// Stop 取消事件订阅并等待消费 goroutine。
func (m *Module) Stop(ctx context.Context) error {
	if m.cancel != nil {
		m.cancel()
	}
	if m.unsub != nil {
		m.unsub()
	}
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		m.log.Debug("module stopped", "module", m.ID())
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (m *Module) consumeEvents(ch <-chan eventlog.Event) {
	defer m.wg.Done()
	for ev := range ch {
		switch ev.Type {
		case eventlog.TypeMessageCreated:
			var payload struct {
				ID        string `json:"id"`
				SessionID string `json:"sessionId"`
				Role      string `json:"role"`
				Text      string `json:"text"`
				At        int64  `json:"at"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID != "" {
				_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
					_, err := tx.ExecContext(context.Background(), `INSERT OR IGNORE INTO raw_messages(
						id, session_id, role, text, canonical_state, created_at) VALUES (?,?,?,?, 'pending', ?)`,
						payload.ID, payload.SessionID, payload.Role, payload.Text, payload.At)
					return err
				})
				m.maybeConsolidateTrigger(payload.SessionID)
			}
		case eventlog.TypeToolCall, eventlog.TypeTaskReport:
			_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
				_, err := tx.ExecContext(context.Background(), `INSERT OR IGNORE INTO raw_events(
					id, type, payload, canonical_state, created_at) VALUES (?,?,?, 'pending', ?)`,
					ev.ID, ev.Type, string(ev.Payload), ev.At)
				return err
			})
		case eventlog.TypeTaskCreated:
			var payload struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID != "" {
				m.taskMu.Lock()
				m.taskTitle[payload.ID] = payload.Title
				m.taskMu.Unlock()
			}
		case eventlog.TypeTaskUpdated:
			var payload struct {
				ID      string `json:"id"`
				Status  string `json:"status"`
				Summary string `json:"summary"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err != nil || payload.ID == "" {
				continue
			}
			if payload.Status != "done" {
				continue
			}
			m.taskMu.Lock()
			title := m.taskTitle[payload.ID]
			m.taskMu.Unlock()
			if strings.TrimSpace(title) == "" {
				title = "后台任务"
			}
			content := "任务完成：" + title
			if strings.TrimSpace(payload.Summary) != "" && !strings.Contains(payload.Summary, title) {
				content += "；" + strings.TrimSpace(payload.Summary)
			}
			_, err := m.Submit(context.Background(), corememory.Candidate{
				Kind:       corememory.KindProgress,
				Scope:      "task:" + payload.ID,
				Key:        "task:" + payload.ID,
				Content:    content,
				Source:     corememory.SourceConversation,
				Authority:  corememory.AuthorityInferred,
				Confidence: 0.7,
				Importance: 6,
				Refs:       []string{payload.ID},
			})
			if err != nil {
				m.log.Warn("Task done 写记忆候选失败", "err", err, "taskId", payload.ID)
			}
		}
	}
}
