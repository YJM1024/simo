package memory

import "testing"

func TestM30FactKeyExtraction(t *testing.T) {
	if got := consolidationFactKey("项目代号是 Orion"); got == "" {
		t.Fatalf("项目代号未生成 factKey")
	}
	if got := consolidationFactKey("项目代号是 Vega"); got != "project|code|{}" {
		t.Fatalf("factKey = %q", got)
	}
}

func TestM30ConsolidationDefaultEnabled(t *testing.T) {
	t.Setenv("AGENTD_MEMORY_CONSOLIDATE", "")
	if !consolidationEnabled() {
		t.Fatalf("未设置时应默认开启自动巩固")
	}
	t.Setenv("AGENTD_MEMORY_CONSOLIDATE", "0")
	if consolidationEnabled() {
		t.Fatalf("=0 应关闭自动巩固")
	}
}
