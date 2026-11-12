package tasks

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
)

// contentDisposition 生成安全的 inline/attachment 头；download=1 时使用 RFC 5987 文件名。
func contentDisposition(filename string, download bool) string {
	safe := safeArtifactFilename(filename)
	encoded := rfc5987Escape(safe)
	mode := "inline"
	if download {
		mode = "attachment"
	}
	fallback := asciiArtifactFallback(safe)
	return fmt.Sprintf(`%s; filename="%s"; filename*=UTF-8''%s`, mode, fallback, encoded)
}

func safeArtifactFilename(name string) string {
	name = strings.ReplaceAll(name, `\`, "/")
	name = filepath.Base(name)
	var b strings.Builder
	for _, r := range name {
		if r < 32 || r == 127 || strings.ContainsRune(`<>:"/\|?*`, r) {
			continue
		}
		b.WriteRune(r)
	}
	safe := strings.TrimSpace(b.String())
	if safe == "" {
		safe = "download"
	}
	runes := []rune(safe)
	if len(runes) > 120 {
		safe = string(runes[:120])
	}
	return safe
}

func asciiArtifactFallback(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if len(ext) > 12 {
		ext = ""
	}
	for _, r := range ext {
		if r != '.' && !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') {
			ext = ""
			break
		}
	}
	return "download" + ext
}

func rfc5987Escape(value string) string {
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		c := value[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
			continue
		}
		b.WriteString(fmt.Sprintf("%%%02X", c))
	}
	return b.String()
}

func isDownloadRequest(r *http.Request) bool {
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get("download"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
