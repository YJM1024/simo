// Package sqlite 是平台层 SQLite 基础设施：打开、进程级文件锁、单写者事务、迁移执行器。
//
// 它不知道任何业务表，只负责：
//  1. 打开数据库（modernc.org/sqlite，纯 Go，无 cgo）；
//  2. 单写者：所有写必须经 Write()，内部串行化；
//  3. 迁移：按模块命名空间记录在 migration_version(module, version)；
//  4. Flush()：M1 三屏障检查点最小版，写后 checkpoint WAL，事件先落库再推送。
package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// ErrLocked 表示同一数据库已被另一个 simo 实例占用。
var ErrLocked = errors.New("数据库已被另一个 simo 实例占用")

// Migration 是一个模块的迁移步骤；Up 在事务里执行。
type Migration struct {
	Version int
	Name    string
	Up      func(context.Context, *sql.Tx) error
}

// DB 是单写者 SQLite 句柄。
type DB struct {
	path string

	db      *sql.DB
	writeMu sync.Mutex

	lockPath string
	lockFile *os.File

	closeOnce sync.Once
	closeErr  error
}

// 迁移表在这里只创建元表：schema_migrations(module, version)。
// 平台自身的数据库格式版本用模块名 "__platform__" 记一行 v1（契约 §2/§9 统一到一张表）。
func Open(path string) (*DB, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("解析数据库路径失败: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}

	lockPath := abs + ".lock"
	lockFile, err := acquireLockFile(lockPath)
	if err != nil {
		if !errors.Is(err, fs.ErrExist) {
			return nil, fmt.Errorf("获取数据库锁失败: %w", err)
		}
		// 崩溃进程可能留下 stale lock：锁里记录了 pid，若进程已不在则回收一次。
		owner, _ := os.ReadFile(lockPath)
		pid := parseLockPID(owner)
		if pid > 0 && !processAlive(pid) {
			if rmErr := os.Remove(lockPath); rmErr == nil || errors.Is(rmErr, fs.ErrNotExist) {
				lockFile, err = acquireLockFile(lockPath)
			}
		}
		if err != nil {
			return nil, fmt.Errorf("%w: %s（%s）；确认没有 simo 在运行后可删除该锁文件",
				ErrLocked, lockPath, strings.TrimSpace(string(owner)))
		}
	}

	// modernc.org/sqlite 的 DSN；WAL 让读写不互相阻塞，单写者仍由 Write() 保证。
	dsn := "file:" + filepath.ToSlash(abs) +
		"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)"
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		_ = lockFile.Close()
		_ = os.Remove(lockPath)
		return nil, fmt.Errorf("打开 SQLite 失败: %w", err)
	}
	sqlDB.SetMaxOpenConns(1) // 单连接 = 单写者 + 读也串行（M1 数据量小，简单优先）
	sqlDB.SetMaxIdleConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		_ = sqlDB.Close()
		_ = lockFile.Close()
		_ = os.Remove(lockPath)
		return nil, fmt.Errorf("连接 SQLite 失败: %w", err)
	}

	d := &DB{path: abs, db: sqlDB, lockPath: lockPath, lockFile: lockFile}
	if err := d.ensureMeta(ctx); err != nil {
		_ = d.Close()
		return nil, err
	}
	return d, nil
}

func acquireLockFile(lockPath string) (*os.File, error) {
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	if _, err := fmt.Fprintf(f, "pid=%d started=%d\n", os.Getpid(), time.Now().UnixMilli()); err != nil {
		_ = f.Close()
		_ = os.Remove(lockPath)
		return nil, fmt.Errorf("写数据库锁失败: %w", err)
	}
	return f, nil
}

func parseLockPID(data []byte) int {
	for _, field := range strings.Fields(string(data)) {
		if strings.HasPrefix(field, "pid=") {
			pid, err := strconv.Atoi(strings.TrimPrefix(field, "pid="))
			if err == nil {
				return pid
			}
		}
	}
	return 0
}

func (d *DB) ensureMeta(ctx context.Context) error {
	return d.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
			module TEXT NOT NULL,
			version INTEGER NOT NULL,
			PRIMARY KEY (module, version)
		)`); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO schema_migrations(module, version) VALUES ('__platform__', 1)`); err != nil {
			return err
		}
		return nil
	})
}

// Path 返回数据库绝对路径。
func (d *DB) Path() string { return d.path }

// Write 是唯一写入口：串行执行 fn 并在同一事务提交。
func (d *DB) Write(ctx context.Context, fn func(*sql.Tx) error) error {
	if d == nil || d.db == nil {
		return errors.New("数据库未打开")
	}
	if fn == nil {
		return errors.New("Write 需要事务函数")
	}
	d.writeMu.Lock()
	defer d.writeMu.Unlock()

	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("开启事务失败: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("提交事务失败: %w", err)
	}
	return nil
}

// Query 执行只读查询。
func (d *DB) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return d.db.QueryContext(ctx, query, args...)
}

// QueryRow 执行单行查询。
func (d *DB) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return d.db.QueryRowContext(ctx, query, args...)
}

// Flush 是 M1 三屏障检查点最小版：把 WAL 内容 checkpoint 到主库。
//
// 契约 §2 要求"事件先落库再返回/推送（Flush() + 写前调用）"；
// SQLite 事务提交本身已保证可见性，这里再做一次 checkpoint 作为显式屏障，
// 同时为 M2 接 fsync/检查点服务留出同名接口。
func (d *DB) Flush(ctx context.Context) error {
	if d == nil || d.db == nil {
		return errors.New("数据库未打开")
	}
	if _, err := d.db.ExecContext(ctx, `PRAGMA wal_checkpoint(PASSIVE)`); err != nil {
		return fmt.Errorf("Flush checkpoint 失败: %w", err)
	}
	return nil
}

// Migrate 按模块命名空间执行迁移；启动时幂等，只前进不回滚。
func (d *DB) Migrate(ctx context.Context, module string, migrations []Migration) error {
	module = strings.TrimSpace(module)
	if module == "" {
		return errors.New("迁移模块名不能为空")
	}
	if len(migrations) == 0 {
		return nil
	}
	sorted := make([]Migration, len(migrations))
	copy(sorted, migrations)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Version < sorted[j].Version })

	seen := make(map[int]bool, len(sorted))
	for _, m := range sorted {
		if m.Version <= 0 {
			return fmt.Errorf("模块 %s 迁移版本必须 >0（得到 %d）", module, m.Version)
		}
		if m.Up == nil {
			return fmt.Errorf("模块 %s v%d 缺少 Up", module, m.Version)
		}
		if seen[m.Version] {
			return fmt.Errorf("模块 %s 迁移版本 %d 重复", module, m.Version)
		}
		seen[m.Version] = true
	}

	current, err := d.currentVersion(ctx, module)
	if err != nil {
		return err
	}
	maxSupported := sorted[len(sorted)-1].Version
	if current > maxSupported {
		return fmt.Errorf("模块 %s 的数据库 schema 版本 v%d 高于当前程序支持 v%d；请升级 simo 或恢复旧版 SIMO_HOME 备份", module, current, maxSupported)
	}
	for _, m := range sorted {
		if m.Version <= current {
			continue
		}
		if err := d.Write(ctx, func(tx *sql.Tx) error {
			if err := m.Up(ctx, tx); err != nil {
				return err
			}
			_, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(module, version) VALUES (?, ?)`, module, m.Version)
			return err
		}); err != nil {
			return fmt.Errorf("模块 %s 迁移 v%d(%s) 失败: %w", module, m.Version, m.Name, err)
		}
		current = m.Version
	}
	return nil
}

func (d *DB) currentVersion(ctx context.Context, module string) (int, error) {
	var version int
	err := d.QueryRow(ctx, `SELECT COALESCE(MAX(version), 0) FROM schema_migrations WHERE module = ?`, module).Scan(&version)
	if err != nil {
		return 0, fmt.Errorf("读取模块 %s 迁移版本失败: %w", module, err)
	}
	return version, nil
}

// CurrentVersion 返回模块当前 schema 版本（启动 preflight/升级提示用）。
func (d *DB) CurrentVersion(ctx context.Context, module string) (int, error) {
	if d == nil {
		return 0, errors.New("数据库未打开")
	}
	return d.currentVersion(ctx, strings.TrimSpace(module))
}

// Ping 用于 readiness 探针。
func (d *DB) Ping(ctx context.Context) error {
	if d == nil || d.db == nil {
		return errors.New("数据库未打开")
	}
	var one int
	return d.db.QueryRowContext(ctx, `SELECT 1`).Scan(&one)
}

// Close 释放数据库与文件锁；可重复调用。
func (d *DB) Close() error {
	if d == nil {
		return nil
	}
	d.closeOnce.Do(func() {
		var errs []error
		if d.db != nil {
			if err := d.db.Close(); err != nil {
				errs = append(errs, err)
			}
		}
		if d.lockFile != nil {
			if err := d.lockFile.Close(); err != nil {
				errs = append(errs, err)
			}
			if err := os.Remove(d.lockPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
				errs = append(errs, err)
			}
		}
		d.closeErr = errors.Join(errs...)
	})
	return d.closeErr
}
