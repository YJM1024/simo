package module

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

type fakeModule struct {
	id      string
	deps    []string
	started *[]string
	stopped *[]string
}

func (f *fakeModule) ID() string                { return f.id }
func (f *fakeModule) DependsOn() []string       { return f.deps }
func (f *fakeModule) Migrations() []Migration   { return nil }
func (f *fakeModule) Register(_ *http.ServeMux) {}
func (f *fakeModule) Start(_ context.Context) error {
	if f.started != nil {
		*f.started = append(*f.started, f.id)
	}
	return nil
}
func (f *fakeModule) Stop(_ context.Context) error {
	if f.stopped != nil {
		*f.stopped = append(*f.stopped, f.id)
	}
	return nil
}

func TestRegistryOrdersByDependencies(t *testing.T) {
	var started, stopped []string
	r := NewRegistry()
	// 故意先注册依赖者，验证拓扑排序仍然先启动被依赖模块。
	if err := r.Register(&fakeModule{id: "chat", deps: []string{"sessions"}, started: &started, stopped: &stopped}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(&fakeModule{id: "sessions", started: &started, stopped: &stopped}); err != nil {
		t.Fatal(err)
	}
	if err := r.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if err := r.Start(context.Background()); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if got := strings.Join(started, ">"); got != "sessions>chat" {
		t.Fatalf("启动顺序 = %q, want sessions>chat", got)
	}
	if err := r.Stop(context.Background()); err != nil {
		t.Fatalf("Stop: %v", err)
	}
	if got := strings.Join(stopped, ">"); got != "chat>sessions" {
		t.Fatalf("停止顺序 = %q, want chat>sessions", got)
	}
}

func TestRegistryRejectsCycleAndMissingDependency(t *testing.T) {
	r := NewRegistry()
	_ = r.Register(&fakeModule{id: "a", deps: []string{"b"}})
	_ = r.Register(&fakeModule{id: "b", deps: []string{"a"}})
	if err := r.Validate(); err == nil || !strings.Contains(err.Error(), "环") {
		t.Fatalf("依赖环未被拒绝: %v", err)
	}

	r2 := NewRegistry()
	_ = r2.Register(&fakeModule{id: "chat", deps: []string{"sessions"}})
	if err := r2.Validate(); err == nil || !strings.Contains(err.Error(), "未注册") {
		t.Fatalf("缺失依赖未被拒绝: %v", err)
	}
}

func TestRegistryRejectsDuplicateID(t *testing.T) {
	r := NewRegistry()
	if err := r.Register(&fakeModule{id: "sessions"}); err != nil {
		t.Fatal(err)
	}
	if err := r.Register(&fakeModule{id: "sessions"}); err == nil {
		t.Fatal("重复模块 ID 未被拒绝")
	}
}
