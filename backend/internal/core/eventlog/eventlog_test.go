package eventlog

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"simo/internal/core/store"
	"simo/internal/platform/sqlite"
)

func newLogger(t *testing.T) (*Logger, *sqlite.DB) {
	t.Helper()
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, "core/eventlog", Migrations()); err != nil {
		_ = db.Close()
		t.Fatalf("Migrate: %v", err)
	}
	return New(store.New(db)), db
}

func TestAppendReplayAndSubscribe(t *testing.T) {
	logger, db := newLogger(t)
	defer func() {
		logger.Close()
		_ = db.Close()
	}()
	ctx := context.Background()

	first, err := logger.Append(ctx, TypeStatus, map[string]string{"state": "thinking"})
	if err != nil {
		t.Fatalf("Append: %v", err)
	}
	second, err := logger.Append(ctx, TypeMessageDone, map[string]string{"id": "m1", "status": "done"})
	if err != nil {
		t.Fatalf("Append: %v", err)
	}
	if first.ID == 0 || second.ID <= first.ID {
		t.Fatalf("事件 id 应单调递增: %d, %d", first.ID, second.ID)
	}

	replay, err := logger.Replay(ctx, 0)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if len(replay) != 2 || replay[0].Type != TypeStatus {
		t.Fatalf("Replay 结果不符: %+v", replay)
	}
	if _, err := logger.Replay(ctx, first.ID); err != nil {
		t.Fatalf("Replay since: %v", err)
	}

	sub, cancel := logger.Subscribe(ctx)
	defer cancel()
	third, err := logger.Append(ctx, TypeMessageDelta, map[string]string{"id": "m1", "delta": "hi"})
	if err != nil {
		t.Fatalf("Append: %v", err)
	}
	select {
	case ev := <-sub:
		if ev.ID != third.ID || ev.Type != TypeMessageDelta {
			t.Fatalf("订阅事件不符: %+v", ev)
		}
	default:
		// 广播是异步写入 buffered channel，等待一小段。
		select {
		case ev := <-sub:
			if ev.ID != third.ID {
				t.Fatalf("订阅事件 id = %d, want %d", ev.ID, third.ID)
			}
		case <-ctx.Done():
		}
	}
}

func TestUnknownTypeRejected(t *testing.T) {
	logger, db := newLogger(t)
	defer func() {
		logger.Close()
		_ = db.Close()
	}()
	if _, err := logger.Append(context.Background(), "hello", map[string]string{}); !errors.Is(err, ErrUnknownEventType) {
		t.Fatalf("hello 不应落库，err = %v", err)
	}
}

func TestReplayPayloadValidJSON(t *testing.T) {
	logger, db := newLogger(t)
	defer func() {
		logger.Close()
		_ = db.Close()
	}()
	ctx := context.Background()
	if _, err := logger.Append(ctx, TypeMessageCreated, map[string]any{"id": "m1", "text": "hi"}); err != nil {
		t.Fatal(err)
	}
	replay, err := logger.Replay(ctx, 0)
	if err != nil || len(replay) != 1 {
		t.Fatalf("Replay = %v, err = %v", replay, err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(replay[0].Payload, &decoded); err != nil {
		t.Fatalf("payload 不是合法 JSON: %v", err)
	}
}
