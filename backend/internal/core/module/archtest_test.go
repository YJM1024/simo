package module_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

// TestNoCrossModuleImports 是契约 §9 的强制架构测试：
// 扫描 internal/modules/<A>/*.go 的 import 图，只要发现 A import B（B 是另一个业务模块）即失败。
func TestNoCrossModuleImports(t *testing.T) {
	root := moduleRoot(t)
	modulesDir := filepath.Join(root, "internal", "modules")
	entries, err := os.ReadDir(modulesDir)
	if err != nil {
		t.Fatalf("读取模块目录失败: %v", err)
	}

	moduleDirs := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		moduleDirs++
		moduleID := entry.Name()
		files, err := filepath.Glob(filepath.Join(modulesDir, moduleID, "*.go"))
		if err != nil {
			t.Fatalf("列模块文件失败: %v", err)
		}
		for _, file := range files {
			imports := parseImports(t, file)
			for _, imp := range imports {
				if !strings.HasPrefix(imp, "simo/internal/modules/") {
					continue
				}
				rest := strings.TrimPrefix(imp, "simo/internal/modules/")
				target := strings.SplitN(rest, "/", 2)[0]
				if target != moduleID {
					t.Errorf("跨模块 import：%s import 了 %q（模块 A 禁止直接 import 模块 B，请走 core 接口/事件）",
						filepath.ToSlash(filepath.Join("internal", "modules", moduleID, filepath.Base(file))), imp)
				}
			}
		}
	}
	if moduleDirs == 0 {
		t.Fatal("internal/modules 下没有任何模块")
	}
}

// TestLayerDirections 保证依赖方向：platform ← core ← modules，平台不反向依赖内核/业务。
func TestLayerDirections(t *testing.T) {
	root := moduleRoot(t)
	cases := []struct {
		dir       string
		forbidden []string
	}{
		{dir: "internal/platform", forbidden: []string{"simo/internal/core", "simo/internal/modules"}},
		{dir: "internal/core", forbidden: []string{"simo/internal/modules"}},
	}
	for _, tc := range cases {
		files := listGoFiles(t, filepath.Join(root, tc.dir))
		if len(files) == 0 {
			t.Fatalf("%s 下没有 Go 文件", tc.dir)
		}
		for _, file := range files {
			for _, imp := range parseImports(t, file) {
				for _, bad := range tc.forbidden {
					if strings.HasPrefix(imp, bad) {
						t.Errorf("分层依赖违规：%s import %q", filepath.ToSlash(file), imp)
					}
				}
			}
		}
	}
}

func moduleRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("无法定位 archtest 源文件")
	}
	// .../simo/internal/core/module/archtest_test.go → .../simo
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}

func listGoFiles(t *testing.T, dir string) []string {
	t.Helper()
	var out []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".go") {
			out = append(out, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("遍历 %s 失败: %v", dir, err)
	}
	return out
}

func parseImports(t *testing.T, file string) []string {
	t.Helper()
	fset := token.NewFileSet()
	parsed, err := parser.ParseFile(fset, file, nil, parser.ImportsOnly)
	if err != nil {
		t.Fatalf("解析 %s 失败: %v", file, err)
	}
	out := make([]string, 0, len(parsed.Imports))
	for _, imp := range parsed.Imports {
		path, err := strconv.Unquote(imp.Path.Value)
		if err != nil {
			t.Fatalf("解析 import 路径失败 %s: %v", file, err)
		}
		out = append(out, path)
	}
	return out
}
