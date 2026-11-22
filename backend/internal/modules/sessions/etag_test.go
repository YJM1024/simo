package sessions

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"
)

type httpResult struct {
	status int
	header http.Header
	body   []byte
}

func doGET(t *testing.T, url string, header map[string]string) httpResult {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range header {
		req.Header.Set(key, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return httpResult{status: resp.StatusCode, header: resp.Header, body: body}
}

type etagSessionNode struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	HasUnread *bool  `json:"hasUnread"`
}

type etagListBody struct {
	Sessions []etagSessionNode `json:"sessions"`
}

func decodeETagList(t *testing.T, result httpResult) etagListBody {
	t.Helper()
	var payload etagListBody
	if err := json.Unmarshal(result.body, &payload); err != nil {
		t.Fatalf("列表响应不是 JSON（status=%d）: %v", result.status, err)
	}
	return payload
}

func findETagNode(nodes []etagSessionNode, id string) *etagSessionNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
	}
	return nil
}

func newETagServer(t *testing.T) (*Module, *httptest.Server) {
	t.Helper()
	mod, _, db := newTestSessions(t)
	t.Cleanup(func() { _ = db.Close() })
	mux := http.NewServeMux()
	mod.registerHTTP(mux)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return mod, ts
}

// 首请求 200 且带稳定格式的强 ETag，响应体仍是既有的 sessions 信封。
func TestSessionListETagFirstResponse(t *testing.T) {
	mod, ts := newETagServer(t)
	child, err := mod.Create(context.Background(), DefaultSessionID, "ETag 首请求")
	if err != nil {
		t.Fatal(err)
	}

	result := doGET(t, ts.URL+"/api/sessions", nil)
	if result.status != http.StatusOK {
		t.Fatalf("status = %d, want 200", result.status)
	}
	etag := result.header.Get("ETag")
	if matched, _ := regexp.MatchString(`^"sess-[0-9a-f]{16}"$`, etag); !matched {
		t.Fatalf("ETag = %q, want 形如 \"sess-<16 hex>\"", etag)
	}
	if payload := decodeETagList(t, result); findETagNode(payload.Sessions, child.ID) == nil {
		t.Fatalf("响应缺少会话 %s: %+v", child.ID, payload.Sessions)
	}
}

// 二次请求带 If-None-Match 命中 304、空 body、保留 ETag；列表与 ?q= 搜索两条路径都成立。
func TestSessionListETagNotModified(t *testing.T) {
	mod, ts := newETagServer(t)
	if _, err := mod.Create(context.Background(), DefaultSessionID, "ETag 304 会话"); err != nil {
		t.Fatal(err)
	}

	first := doGET(t, ts.URL+"/api/sessions", nil)
	etag := first.header.Get("ETag")
	if first.status != http.StatusOK || etag == "" {
		t.Fatalf("首请求 status = %d, ETag = %q", first.status, etag)
	}

	second := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": etag})
	if second.status != http.StatusNotModified {
		t.Fatalf("条件请求 status = %d, want 304", second.status)
	}
	if len(second.body) != 0 {
		t.Fatalf("304 body = %q, want 空", string(second.body))
	}
	if got := second.header.Get("ETag"); got != etag {
		t.Fatalf("304 ETag = %q, want %q", got, etag)
	}

	searchFirst := doGET(t, ts.URL+"/api/sessions?q=304", nil)
	searchETag := searchFirst.header.Get("ETag")
	if searchFirst.status != http.StatusOK || searchETag == "" {
		t.Fatalf("搜索首请求 status = %d, ETag = %q", searchFirst.status, searchETag)
	}
	searchSecond := doGET(t, ts.URL+"/api/sessions?q=304", map[string]string{"If-None-Match": searchETag})
	if searchSecond.status != http.StatusNotModified {
		t.Fatalf("搜索条件请求 status = %d, want 304", searchSecond.status)
	}
	if len(searchSecond.body) != 0 {
		t.Fatalf("搜索 304 body = %q, want 空", string(searchSecond.body))
	}
}

// 数据或投影变化后旧 ETag 必须回 200 并给出新 ETag；hasUnread 每次现算，不沿用缓存值。
func TestSessionListETagChangesAfterMutation(t *testing.T) {
	mod, ts := newETagServer(t)
	ctx := context.Background()
	child, err := mod.Create(ctx, DefaultSessionID, "ETag 变更前")
	if err != nil {
		t.Fatal(err)
	}

	first := doGET(t, ts.URL+"/api/sessions", nil)
	etag1 := first.header.Get("ETag")
	if first.status != http.StatusOK || etag1 == "" {
		t.Fatalf("首请求 status = %d, ETag = %q", first.status, etag1)
	}

	// 会话元数据没变，只有未读投影翻转：ETag 仍必须变化。
	mod.SetUnreadSource(fakeUnreadSource{flags: map[string]bool{child.ID: true}})
	second := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": etag1})
	if second.status != http.StatusOK {
		t.Fatalf("未读翻转后 status = %d, want 200（不能沿用旧 ETag 判 304）", second.status)
	}
	etag2 := second.header.Get("ETag")
	if etag2 == etag1 {
		t.Fatalf("未读翻转后 ETag 未变: %q", etag2)
	}
	if node := findETagNode(decodeETagList(t, second).Sessions, child.ID); node == nil || node.HasUnread == nil || !*node.HasUnread {
		t.Fatalf("未读翻转后 hasUnread 未重新计算: %+v", node)
	}

	// 标题变更：ETag 再变，body 是改名后的内容。
	if _, err := mod.Rename(ctx, child.ID, "ETag 变更后"); err != nil {
		t.Fatal(err)
	}
	third := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": etag2})
	if third.status != http.StatusOK {
		t.Fatalf("改名后 status = %d, want 200", third.status)
	}
	etag3 := third.header.Get("ETag")
	if etag3 == etag1 || etag3 == etag2 {
		t.Fatalf("改名后 ETag = %q, 应与 %q / %q 都不同", etag3, etag1, etag2)
	}
	if node := findETagNode(decodeETagList(t, third).Sessions, child.ID); node == nil || node.Title != "ETag 变更后" {
		t.Fatalf("改名后 body 未同步: %+v", node)
	}
}

// 过期或无法识别的 If-None-Match 回 200 而不是 500；`*` 按 RFC 命中任意当前表示。
func TestSessionListETagInvalidOrStale(t *testing.T) {
	mod, ts := newETagServer(t)
	if _, err := mod.Create(context.Background(), DefaultSessionID, "ETag 非法值"); err != nil {
		t.Fatal(err)
	}

	first := doGET(t, ts.URL+"/api/sessions", nil)
	etag := first.header.Get("ETag")
	if first.status != http.StatusOK || etag == "" {
		t.Fatalf("首请求 status = %d, ETag = %q", first.status, etag)
	}

	for name, validator := range map[string]string{
		"过期标签": `"sess-0000000000000000"`,
		"裸值":   "not-a-validator",
		"空标签":  `""`,
		"垃圾多值": `"broken", ,"also-broken"`,
	} {
		result := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": validator})
		if result.status != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200（不得回 500）", name, result.status)
		}
		if payload := decodeETagList(t, result); len(payload.Sessions) == 0 {
			t.Fatalf("%s: 200 响应体为空", name)
		}
		if got := result.header.Get("ETag"); got != etag {
			t.Fatalf("%s: ETag = %q, want %q", name, got, etag)
		}
	}

	if result := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": "*"}); result.status != http.StatusNotModified {
		t.Fatalf("If-None-Match: * status = %d, want 304", result.status)
	}
}
