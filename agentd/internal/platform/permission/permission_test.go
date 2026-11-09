package permission

import (
	"context"
	"testing"
)

func TestDefaultPolicy(t *testing.T) {
	p := NewDefault()
	ctx := context.Background()

	read := p.Evaluate(ctx, Request{Tool: "read_file"})
	if read.Verdict != Allow || !read.AutoApproved || read.ReachedCanUseTool {
		t.Fatalf("read_file 应自动 allow 且不走 canUseTool: %+v", read)
	}
	write := p.Evaluate(ctx, Request{Tool: "write_file"})
	if write.Verdict != Ask {
		t.Fatalf("write_file 应进入 ask: %+v", write)
	}
	deleteVerdict := p.Evaluate(ctx, Request{Tool: "delete_file"})
	if deleteVerdict.Verdict != Deny {
		t.Fatalf("delete_file 应 deny: %+v", deleteVerdict)
	}
	// bypass 不能绕过 ask/deny。
	writeBypass := p.Evaluate(ctx, Request{Tool: "write_file", Mode: "bypass"})
	if writeBypass.Verdict != Ask {
		t.Fatalf("bypass 下 write 仍应 ask: %+v", writeBypass)
	}
}

func TestCanUseToolOnlyWhenNotAutoApproved(t *testing.T) {
	called := 0
	p := &Policy{
		AllowRules: []string{"read_file"},
		CanUseTool: func(_ context.Context, req Request) (Verdict, string) {
			called++
			return Allow, "ok"
		},
	}
	if got := p.Evaluate(context.Background(), Request{Tool: "read_file"}); got.Verdict != Allow || called != 0 {
		t.Fatalf("自动批准不应调用 canUseTool: %+v called=%d", got, called)
	}
	if got := p.Evaluate(context.Background(), Request{Tool: "unknown_tool"}); got.Verdict != Allow || called != 1 || !got.ReachedCanUseTool {
		t.Fatalf("未知工具应走 canUseTool: %+v called=%d", got, called)
	}
}

func TestHookDenyAndAskRule(t *testing.T) {
	p := &Policy{
		Hooks: []Hook{func(_ context.Context, req Request) (Verdict, string, bool) {
			if req.Tool == "danger" {
				return Deny, "hook says no", true
			}
			return "", "", false
		}},
		AskRules: []string{"ask_tool"},
	}
	if got := p.Evaluate(context.Background(), Request{Tool: "danger"}); got.Verdict != Deny {
		t.Fatalf("hook deny: %+v", got)
	}
	if got := p.Evaluate(context.Background(), Request{Tool: "ask_tool"}); got.Verdict != Ask {
		t.Fatalf("ask rule: %+v", got)
	}
	if got := p.Evaluate(context.Background(), Request{Tool: "unknown"}); got.Verdict != Deny {
		t.Fatalf("无规则应 fail-closed: %+v", got)
	}
}
