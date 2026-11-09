package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	maxFetchBytes = 2 << 20
	webTimeout    = 15 * time.Second
)

var (
	htmlScriptRE = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	htmlStyleRE  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	htmlTagRE    = regexp.MustCompile(`(?s)<[^>]+>`)
	htmlSpaceRE  = regexp.MustCompile(`[ \t\r\f\v]+`)
	htmlLineRE   = regexp.MustCompile(`\n{3,}`)
)

type webSearchResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet"`
}

func urlHostKey(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	return strings.ToLower(parsed.Hostname())
}

func isForbiddenWebHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	if host == "" || host == "localhost" || strings.HasSuffix(host, ".localhost") ||
		strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return isForbiddenIP(ip)
	}
	return false
}

func isForbiddenIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsMulticast() {
		return true
	}
	// 169.254.169.254 等云元数据在 link-local 已覆盖；显式再兜底。
	if ip.String() == "169.254.169.254" {
		return true
	}
	return false
}

func (m *Module) resolveFetchURL(ctx context.Context, raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("url 不能为空 (code=bad_arguments)")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("url 非法 (code=bad_arguments)")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("只允许 http/https (code=unsupported_scheme)")
	}
	if parsed.User != nil {
		return nil, fmt.Errorf("url 不允许携带认证信息 (code=ssrf_denied)")
	}
	host := strings.ToLower(parsed.Hostname())
	if isForbiddenWebHost(host) {
		return nil, fmt.Errorf("拒绝环回/内网地址 (code=ssrf_denied)")
	}
	if ip := net.ParseIP(host); ip == nil {
		lookupCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		addrs, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
		if err != nil {
			return nil, fmt.Errorf("域名解析失败 (code=network_error)")
		}
		for _, addr := range addrs {
			if isForbiddenIP(addr.IP) {
				return nil, fmt.Errorf("拒绝内网解析结果 (code=ssrf_denied)")
			}
		}
	}
	return parsed, nil
}

func (m *Module) toolWebFetch(ctx context.Context, args map[string]any) string {
	target, err := m.resolveFetchURL(ctx, stringArg(args, "url"))
	if err != nil {
		return "Error: " + err.Error()
	}
	if m.mockMode {
		payload := map[string]any{
			"ok": true, "url": target.String(), "status": 200,
			"contentType": "text/html; charset=utf-8",
			"text":        "agentd M12 mock fixture page。这里是抓取到的公开页面正文，用于协议测试。",
			"truncated":   false, "domain": target.Hostname(), "bytes": 96,
		}
		raw, _ := json.Marshal(payload)
		return string(raw)
	}
	maxBytes := maxFetchBytes
	if value := intArg(args, "max_bytes", 0); value > 0 && value < maxBytes {
		maxBytes = value
	}
	client := &http.Client{
		Timeout: webTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("重定向过多")
			}
			if _, err := m.resolveFetchURL(req.Context(), req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return "Error: 构造请求失败 (code=bad_arguments)"
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; agentd/1.0; +https://localhost)")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,text/plain,*/*")
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Sprintf("Error: 抓取失败: %v (code=network_error)", err)
	}
	defer resp.Body.Close()
	limited := io.LimitReader(resp.Body, int64(maxBytes)+1)
	data, readErr := io.ReadAll(limited)
	truncated := len(data) > maxBytes
	if truncated {
		data = data[:maxBytes]
	}
	if readErr != nil && !truncated {
		return fmt.Sprintf("Error: 读取正文失败: %v (code=network_error)", readErr)
	}
	contentType := resp.Header.Get("Content-Type")
	text := htmlToText(string(data))
	if strings.Contains(strings.ToLower(contentType), "text/plain") {
		text = string(data)
	}
	if int64(len(text)) > int64(maxBytes) {
		text = text[:maxBytes]
	}
	payload := map[string]any{
		"ok": true, "url": target.String(), "status": resp.StatusCode,
		"contentType": contentType, "text": text, "truncated": truncated,
		"domain": target.Hostname(), "bytes": len(data),
	}
	raw, _ := json.Marshal(payload)
	return string(raw)
}

func htmlToText(source string) string {
	source = htmlScriptRE.ReplaceAllString(source, " ")
	source = htmlStyleRE.ReplaceAllString(source, " ")
	source = strings.ReplaceAll(source, "<br", "\n<br")
	source = strings.ReplaceAll(source, "</p>", "</p>\n")
	source = htmlTagRE.ReplaceAllString(source, " ")
	text := html.UnescapeString(source)
	text = htmlSpaceRE.ReplaceAllString(text, " ")
	text = strings.ReplaceAll(text, " \n", "\n")
	text = htmlLineRE.ReplaceAllString(text, "\n\n")
	return strings.TrimSpace(text)
}

func (m *Module) toolWebSearch(ctx context.Context, args map[string]any) string {
	query := strings.TrimSpace(stringArg(args, "query"))
	if query == "" {
		return "Error: query 不能为空 (code=bad_arguments)"
	}
	count := intArg(args, "count", 5)
	if count <= 0 {
		count = 5
	}
	if count > 10 {
		count = 10
	}
	if m.mockMode {
		results := make([]webSearchResult, 0, count)
		for i := 0; i < count; i++ {
			results = append(results, webSearchResult{
				Title:   fmt.Sprintf("%s 的搜索结果 %d", query, i+1),
				URL:     fmt.Sprintf("https://example.com/result/%d", i+1),
				Snippet: fmt.Sprintf("这是关于 %s 的第 %d 条 mock 搜索摘要。", query, i+1),
			})
		}
		raw, _ := json.Marshal(map[string]any{"results": results, "source": "mock", "query": query})
		return string(raw)
	}
	results, sourceName, err := m.searchDuckDuckGo(ctx, query, count)
	if err != nil || len(results) == 0 {
		results, sourceName, err = m.searchBing(ctx, query, count)
	}
	if err != nil {
		return fmt.Sprintf("Error: 搜索失败: %v (code=network_error)", err)
	}
	payload := map[string]any{"results": results, "source": sourceName, "query": query}
	raw, _ := json.Marshal(payload)
	return string(raw)
}

func (m *Module) fetchSearchPage(ctx context.Context, rawURL string) (string, error) {
	client := &http.Client{Timeout: webTimeout}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	return string(body), err
}

func (m *Module) searchDuckDuckGo(ctx context.Context, query string, count int) ([]webSearchResult, string, error) {
	body, err := m.fetchSearchPage(ctx, "https://html.duckduckgo.com/html/?q="+url.QueryEscape(query))
	if err != nil {
		return nil, "", err
	}
	resultRE := regexp.MustCompile(`(?is)<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetRE := regexp.MustCompile(`(?is)<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>`)
	links := resultRE.FindAllStringSubmatch(body, -1)
	snippets := snippetRE.FindAllStringSubmatch(body, -1)
	out := make([]webSearchResult, 0, count)
	for i, link := range links {
		if len(out) >= count {
			break
		}
		target := html.UnescapeString(link[1])
		if strings.HasPrefix(target, "//duckduckgo.com/l/?uddg=") {
			if parsed, err := url.Parse("https:" + target); err == nil {
				if decoded := parsed.Query().Get("uddg"); decoded != "" {
					target = decoded
				}
			}
		}
		if target == "" || strings.Contains(target, "duckduckgo.com/y.js") {
			continue
		}
		snippet := ""
		if i < len(snippets) {
			snippet = htmlToText(snippets[i][1])
		}
		out = append(out, webSearchResult{Title: htmlToText(link[2]), URL: target, Snippet: snippet})
	}
	return out, "duckduckgo", nil
}

func (m *Module) searchBing(ctx context.Context, query string, count int) ([]webSearchResult, string, error) {
	body, err := m.fetchSearchPage(ctx, "https://www.bing.com/search?q="+url.QueryEscape(query))
	if err != nil {
		return nil, "", err
	}
	itemRE := regexp.MustCompile(`(?is)<li class="b_algo".*?</li>`)
	linkRE := regexp.MustCompile(`(?is)<h2[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>`)
	snippetRE := regexp.MustCompile(`(?is)<p[^>]*>(.*?)</p>`)
	out := make([]webSearchResult, 0, count)
	for _, item := range itemRE.FindAllString(body, -1) {
		if len(out) >= count {
			break
		}
		link := linkRE.FindStringSubmatch(item)
		if len(link) < 3 {
			continue
		}
		snippet := ""
		if match := snippetRE.FindStringSubmatch(item); len(match) > 1 {
			snippet = htmlToText(match[1])
		}
		out = append(out, webSearchResult{
			Title: htmlToText(link[2]), URL: html.UnescapeString(link[1]), Snippet: snippet,
		})
	}
	return out, "bing", nil
}
