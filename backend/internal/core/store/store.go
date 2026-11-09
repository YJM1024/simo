// Package store 是内核的"单写者门店"：所有业务模块的读写都经过它。
//
// 它不定义业务表（业务表由各模块的 Migrations 创建），只提供：
//   - Write：唯一写入口，串行事务；
//   - Query/QueryRow：只读查询；
//   - Flush：三屏障检查点最小版（写后/请求前调用）。
//
// 这样"单写者"只在一个地方实现，模块不需要各自加锁，也不会绕过事务。
package store

import (
	"context"
	"database/sql"

	"simo/internal/platform/sqlite"
)

// Store 包装平台 SQLite，作为内核单写者入口。
type Store struct {
	db *sqlite.DB
}

// New 创建 Store。
func New(db *sqlite.DB) *Store { return &Store{db: db} }

// Write 串行执行一个事务；所有写操作必须经这里。
func (s *Store) Write(ctx context.Context, fn func(*sql.Tx) error) error {
	return s.db.Write(ctx, fn)
}

// Query 执行只读查询。
func (s *Store) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return s.db.Query(ctx, query, args...)
}

// QueryRow 执行单行查询。
func (s *Store) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return s.db.QueryRow(ctx, query, args...)
}

// Flush 是事件/请求前的显式屏障（M1 最小版）。
func (s *Store) Flush(ctx context.Context) error { return s.db.Flush(ctx) }

// Path 返回数据库路径（诊断/日志用）。
func (s *Store) Path() string { return s.db.Path() }
