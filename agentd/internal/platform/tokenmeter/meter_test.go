package tokenmeter

import "testing"

type fixedProvider struct{ usage ProviderUsage }

func (f fixedProvider) LastUsage() (ProviderUsage, bool) { return f.usage, true }

func TestEstimate(t *testing.T) {
	if got := Estimate(""); got != 0 {
		t.Fatalf("空串估算 = %d", got)
	}
	if got := Estimate("abcd"); got != 1 {
		t.Fatalf("ASCII 4 字符应约 1 token，得到 %d", got)
	}
	if got := Estimate("你好世界"); got != 4 {
		t.Fatalf("CJK 4 字应约 4 token，得到 %d", got)
	}
}

func TestProviderUsageWins(t *testing.T) {
	m := New()
	got := m.Resolve(fixedProvider{usage: ProviderUsage{InputTokens: 10, OutputTokens: 5}}, "很长的提示", "回复")
	if got.Estimated {
		t.Fatal("有 provider usage 时不应标估算")
	}
	if got.TotalTokens != 15 {
		t.Fatalf("TotalTokens = %d, want 15", got.TotalTokens)
	}
	if m.Calls() != 0 {
		t.Fatalf("provider usage 不应累计估算 calls，得到 %d", m.Calls())
	}

	estimated := m.Resolve(nil, "abcd", "你好")
	if !estimated.Estimated || estimated.TotalTokens <= 0 {
		t.Fatalf("无 provider usage 应估算: %+v", estimated)
	}
	if m.Calls() != 1 {
		t.Fatalf("估算 calls = %d, want 1", m.Calls())
	}
}
