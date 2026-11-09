package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStaleLockReclaimed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "simo.db")
	if err := os.WriteFile(path+".lock", []byte("pid=2000000000 started=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	db, err := Open(path)
	if err != nil {
		t.Fatalf("崩溃进程留下的 stale lock 应被回收，得到: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	if _, err := os.Stat(path + ".lock"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("优雅 Close 后不应留下 lock 文件: %v", err)
	}
}

func TestFutureSchemaVersionRejected(t *testing.T) {
	path := filepath.Join(t.TempDir(), "simo.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	up := func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS demo (id TEXT)`)
		return err
	}
	if err := db.Migrate(ctx, "demo", []Migration{{Version: 1, Name: "v1", Up: up}, {Version: 2, Name: "v2", Up: up}}); err != nil {
		t.Fatal(err)
	}
	err = db.Migrate(ctx, "demo", []Migration{{Version: 1, Name: "v1", Up: up}})
	if err == nil || !strings.Contains(err.Error(), "高于当前程序支持") {
		t.Fatalf("未来 schema 应 fail-closed，得到 %v", err)
	}
}

func TestSingleWriterLockAndRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "simo.db")
	db1, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if _, err := Open(path); !errors.Is(err, ErrLocked) {
		t.Fatalf("第二个实例应因文件锁失败，得到 %v", err)
	}
	if err := db1.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	db2, err := Open(path)
	if err != nil {
		t.Fatalf("重新 Open: %v", err)
	}
	defer db2.Close()
	if err := db2.Migrate(context.Background(), "demo", []Migration{{
		Version: 1,
		Name:    "create demo",
		Up: func(ctx context.Context, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `CREATE TABLE demo (id TEXT PRIMARY KEY, note TEXT NOT NULL)`)
			return err
		},
	}}); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if err := db2.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO demo(id, note) VALUES ('a', 'ok')`)
		return err
	}); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if err := db2.Flush(context.Background()); err != nil {
		t.Fatalf("Flush: %v", err)
	}
	// 迁移幂等：同版本重复执行不报错。
	if err := db2.Migrate(context.Background(), "demo", []Migration{{
		Version: 1,
		Name:    "create demo",
		Up: func(ctx context.Context, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `CREATE TABLE demo (id TEXT PRIMARY KEY, note TEXT NOT NULL)`)
			return err
		},
	}}); err != nil {
		t.Fatalf("重复 Migrate 应幂等: %v", err)
	}

	var version int
	if err := db2.QueryRow(context.Background(),
		`SELECT MAX(version) FROM schema_migrations WHERE module = 'demo'`).Scan(&version); err != nil {
		t.Fatalf("读 schema_migrations: %v", err)
	}
	if version != 1 {
		t.Fatalf("迁移版本 = %d, want 1", version)
	}
}
