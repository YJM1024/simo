package chat

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	coretask "simo/internal/core/task"
)

const maxGeneratedBytes = 20 << 20

var scriptTagRE = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)

type generatedArtifact struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Mime        string `json:"mime"`
	Size        int64  `json:"size"`
	Path        string `json:"path"`
	PreviewURL  string `json:"previewUrl"`
	DownloadURL string `json:"downloadUrl"`
}

func (m *Module) toolMakePDF(ctx context.Context, sessionID string, args map[string]any) string {
	htmlInput := strings.TrimSpace(stringArg(args, "html"))
	markdown := stringArg(args, "markdown")
	if htmlInput == "" && markdown == "" {
		return "Error: 需要 html 或 markdown (code=bad_arguments)"
	}
	title := strings.TrimSpace(stringArg(args, "title"))
	if title == "" {
		title = "文档"
	}
	var doc string
	if htmlInput != "" {
		doc = htmlInput
	} else {
		doc = markdownToHTML(markdown, title)
	}
	doc = scriptTagRE.ReplaceAllString(doc, "")
	chrome := m.chromeExecutable()
	if chrome == "" {
		return "Error: 未找到 Chrome；请配置 tools.chrome 或 SIMO_CHROME (code=chrome_missing)"
	}
	name := sanitizeGeneratedName(stringArg(args, "filename"), "document.pdf")
	if !strings.HasSuffix(strings.ToLower(name), ".pdf") {
		name += ".pdf"
	}
	target, err := m.generatedPath(sessionID, name)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	tmpRoot, err := m.generatedTempRoot()
	if err != nil {
		return fmt.Sprintf("Error: 创建临时目录失败: %v (code=io_error)", err)
	}
	tmpDir, err := os.MkdirTemp(tmpRoot, "pdf-")
	if err != nil {
		return fmt.Sprintf("Error: 创建临时目录失败: %v (code=io_error)", err)
	}
	defer os.RemoveAll(tmpDir)
	htmlPath := filepath.Join(tmpDir, "input.html")
	if err := os.WriteFile(htmlPath, []byte(doc), 0o600); err != nil {
		return fmt.Sprintf("Error: 写入 HTML 失败: %v (code=io_error)", err)
	}
	profile := filepath.Join(tmpDir, "profile")
	cmdCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cmdCtx, chrome,
		"--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
		"--no-default-browser-check", "--disable-extensions",
		"--user-data-dir="+profile, "--print-to-pdf="+target,
		"file:///"+filepath.ToSlash(htmlPath))
	cmd.Env = append(os.Environ(), "TMP="+tmpRoot, "TEMP="+tmpRoot, "TMPDIR="+tmpRoot)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		m.log.Warn("Chrome 导出 PDF 失败，使用内置 PDF 回退", "err", err, "stderr", truncateRunes(stderr.String(), 300))
		if fallbackErr := writeFallbackPDF(target, title, markdown); fallbackErr != nil {
			return fmt.Sprintf("Error: Chrome 导出 PDF 失败: %v %s (code=pdf_failed)", err, truncateRunes(stderr.String(), 300))
		}
	}
	return m.finishGenerated(sessionID, name, "application/pdf", "pdf", target)
}

func (m *Module) toolMakeOffice(ctx context.Context, sessionID, tool string, args map[string]any) string {
	python := m.pythonExecutable()
	if python == "" {
		return "Error: 未找到 Python；请配置 tools.python 或 SIMO_PYTHON (code=python_missing)"
	}
	script := m.officeHelperPath()
	if script == "" {
		return "Error: 未找到 scripts/office_helper.py (code=helper_missing)"
	}
	kind, ext, mime := "", ".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	switch tool {
	case "make_docx":
		kind = "docx"
	case "make_xlsx":
		kind, ext, mime = "xlsx", ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	case "make_pptx":
		kind, ext, mime = "pptx", ".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	case "make_image":
		kind, ext, mime = "image", ".png", "image/png"
	}
	base := sanitizeGeneratedName(stringArg(args, "filename"), "document"+ext)
	if !strings.HasSuffix(strings.ToLower(base), strings.ToLower(ext)) {
		base += ext
	}
	tmpRoot, err := m.generatedTempRoot()
	if err != nil {
		return fmt.Sprintf("Error: 创建临时目录失败: %v (code=io_error)", err)
	}
	target, err := m.generatedPath(sessionID, base)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	input := map[string]any{"kind": kind, "output": target}
	for key, value := range args {
		switch key {
		case "filename", "sandbox_permissions", "justification":
			continue
		default:
			input[key] = value
		}
	}
	raw, _ := json.Marshal(input)
	cmdCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cmdCtx, python, script)
	cmd.Stdin = bytes.NewReader(raw)
	cmd.Env = append(os.Environ(), "TMP="+tmpRoot, "TEMP="+tmpRoot, "TMPDIR="+tmpRoot)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Sprintf("Error: Python helper 失败: %v %s (code=helper_failed)", err, truncateRunes(stderr.String(), 400))
	}
	var helperResult struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &helperResult); err != nil {
		return fmt.Sprintf("Error: Python helper 输出非法: %s (code=helper_failed)", truncateRunes(stdout.String(), 300))
	}
	if !helperResult.OK {
		return fmt.Sprintf("Error: %s (code=helper_failed)", truncateRunes(helperResult.Error, 400))
	}
	return m.finishGenerated(sessionID, base, mime, strings.TrimPrefix(ext, "."), target)
}

func (m *Module) finishGenerated(sessionID, name, mime, ext, target string) string {
	info, err := os.Stat(target)
	if err != nil || info.IsDir() {
		return fmt.Sprintf("Error: 生成文件不存在 (code=io_error)")
	}
	if info.Size() > maxGeneratedBytes {
		_ = os.Remove(target)
		return fmt.Sprintf("Error: 生成文件超过 20MB (code=file_too_large)")
	}
	artifact, err := m.registerGeneratedArtifact(context.Background(), sessionID, name, mime, info.Size(), target)
	if err != nil {
		return fmt.Sprintf("Error: 登记产物失败: %v (code=artifact_failed)", err)
	}
	payload := map[string]any{"ok": true, "artifact": artifact}
	raw, _ := json.Marshal(payload)
	return string(raw)
}

func (m *Module) registerGeneratedArtifact(ctx context.Context, sessionID, name, mime string, size int64, absPath string) (generatedArtifact, error) {
	rel, err := filepath.Rel(m.sandbox.Artifacts, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return generatedArtifact{}, fmt.Errorf("产物路径越界")
	}
	rel = filepath.ToSlash(rel)
	id := newID("artifact")
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO task_artifacts(
			id, task_id, name, rel_path, mime, size, created_at, delivery_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			id, "session:"+sessionID, name, rel, mime, size, time.Now().UnixMilli(), coretask.ArtifactDeliveryKindUser)
		return err
	}); err != nil {
		return generatedArtifact{}, err
	}
	return generatedArtifact{
		ID: id, Name: name, Mime: mime, Size: size, Path: "artifacts/" + sessionID + "/" + name,
		PreviewURL: "/api/artifacts/" + id + "/content", DownloadURL: "/api/artifacts/" + id + "/content?download=1",
	}, nil
}

func (m *Module) generatedTempRoot() (string, error) {
	if m.sandbox == nil || strings.TrimSpace(m.sandbox.Home) == "" {
		return "", fmt.Errorf("SIMO_HOME 未配置")
	}
	root := filepath.Join(m.sandbox.Home, "tmp")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}
	return root, nil
}

func (m *Module) generatedPath(sessionID, name string) (string, error) {
	if m.sandbox == nil {
		return "", fmt.Errorf("workspace 未配置")
	}
	rel := filepath.ToSlash(filepath.Join(sessionID, name))
	abs, err := m.sandbox.ResolveArtifact(rel)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return "", err
	}
	return abs, nil
}

func sanitizeGeneratedName(input, fallback string) string {
	name := strings.TrimSpace(input)
	if name == "" {
		name = fallback
	}
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			return r
		case r == '.' || r == '-' || r == '_':
			return r
		case r > 127:
			return r
		}
		return '-'
	}, name)
	name = strings.Trim(name, ".- ")
	if name == "" || name == "." || name == ".." {
		name = fallback
	}
	return name
}

func writeFallbackPDF(target, title, markdown string) error {
	var text strings.Builder
	text.WriteString(title)
	text.WriteString("\n\n")
	for _, line := range strings.Split(markdown, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			text.WriteString("\n")
			continue
		}
		text.WriteString(line)
		text.WriteString("\n")
	}
	lines := strings.Split(text.String(), "\n")
	if len(lines) > 55 {
		lines = lines[:55]
	}
	var content strings.Builder
	content.WriteString("BT\n/F1 12 Tf\n16 TL\n50 780 Td\n")
	for _, line := range lines {
		line = toPDFASCII(line)
		line = strings.ReplaceAll(line, `\`, `\\`)
		line = strings.ReplaceAll(line, "(", `\(`)
		line = strings.ReplaceAll(line, ")", `\)`)
		content.WriteString("(")
		content.WriteString(line)
		content.WriteString(") Tj\nT*\n")
	}
	content.WriteString("ET\n")
	stream := content.String()
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(stream), stream),
	}
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects)+1)
	for i, object := range objects {
		offsets[i+1] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objects)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return os.WriteFile(target, buf.Bytes(), 0o644)
}

func toPDFASCII(text string) string {
	var b strings.Builder
	for _, r := range text {
		if r >= 32 && r <= 126 {
			b.WriteRune(r)
		} else if r == '\t' {
			b.WriteString("    ")
		} else {
			b.WriteByte('?')
		}
	}
	return b.String()
}

func (m *Module) chromeExecutable() string {
	if strings.TrimSpace(m.chromePath) != "" {
		return m.chromePath
	}
	candidates := []string{
		`C:\Program Files\Google\Chrome\Application\chrome.exe`,
		`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
		`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	if found, err := exec.LookPath("chrome"); err == nil {
		return found
	}
	return ""
}

func (m *Module) pythonExecutable() string {
	if configured := strings.TrimSpace(m.pythonPath); configured != "" {
		if info, err := os.Stat(configured); err == nil && !info.IsDir() {
			return configured
		}
		return ""
	}
	candidates := []string{
		`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`,
		`C:\Python313\python.exe`,
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	if found, err := exec.LookPath("python"); err == nil {
		return found
	}
	return ""
}

func (m *Module) officeHelperPath() string {
	root, err := m.generatedTempRoot()
	if err != nil {
		return ""
	}
	helper := filepath.Join(root, "office_helper.py")
	if err := os.WriteFile(helper, officeHelperScript, 0o600); err != nil {
		return ""
	}
	return helper
}

func markdownToHTML(markdown, title string) string {
	var b strings.Builder
	b.WriteString("<!doctype html><html><head><meta charset=\"utf-8\"><title>")
	b.WriteString(htmlEscape(title))
	b.WriteString("</title><style>body{font-family:'Microsoft YaHei',sans-serif;line-height:1.7;margin:40px;}h1,h2{color:#222;}pre{background:#f4f4f4;padding:8px;}code{background:#f4f4f4;padding:1px 3px;}</style></head><body>")
	lines := strings.Split(markdown, "\n")
	inList := false
	inCode := false
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "```") {
			if inCode {
				b.WriteString("</pre>\n")
				inCode = false
			} else {
				b.WriteString("<pre>")
				inCode = true
			}
			continue
		}
		if inCode {
			b.WriteString(htmlEscape(line) + "\n")
			continue
		}
		if trim == "" {
			if inList {
				b.WriteString("</ul>\n")
				inList = false
			}
			continue
		}
		if strings.HasPrefix(trim, "- ") || strings.HasPrefix(trim, "* ") {
			if !inList {
				b.WriteString("<ul>\n")
				inList = true
			}
			b.WriteString("<li>" + inlineMarkdown(trim[2:]) + "</li>\n")
			continue
		}
		if inList {
			b.WriteString("</ul>\n")
			inList = false
		}
		switch {
		case strings.HasPrefix(trim, "### "):
			b.WriteString("<h3>" + inlineMarkdown(trim[4:]) + "</h3>\n")
		case strings.HasPrefix(trim, "## "):
			b.WriteString("<h2>" + inlineMarkdown(trim[3:]) + "</h2>\n")
		case strings.HasPrefix(trim, "# "):
			b.WriteString("<h1>" + inlineMarkdown(trim[2:]) + "</h1>\n")
		default:
			b.WriteString("<p>" + inlineMarkdown(trim) + "</p>\n")
		}
	}
	if inList {
		b.WriteString("</ul>\n")
	}
	if inCode {
		b.WriteString("</pre>\n")
	}
	b.WriteString("</body></html>")
	return b.String()
}

func inlineMarkdown(text string) string {
	escaped := htmlEscape(text)
	bold := regexp.MustCompile(`\*\*([^*]+)\*\*`)
	escaped = bold.ReplaceAllString(escaped, "<strong>$1</strong>")
	return escaped
}

func htmlEscape(text string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return replacer.Replace(text)
}
