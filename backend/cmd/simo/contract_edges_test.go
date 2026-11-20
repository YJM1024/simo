package main

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

// doContractRequest 发送无 body 的请求，用于边界契约测试。
func doContractRequest(t *testing.T, method, url string) (int, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

// P5-E1/E2：空库读取、非法查询参数、未知条目必须返回统一 JSON 错误，不能 500/HTML。
func TestP5MemoryEmptyAndUnknownContract(t *testing.T) {
	_, ts := newM2App(t, nil, nil)

	status, body := httpGet(t, ts.URL+"/api/memory/items?scope=global&status=all&limit=abc")
	if status != http.StatusOK {
		t.Fatalf("空库 memory items = %d %s", status, body)
	}
	if !strings.Contains(string(body), `"ok":true`) || !strings.Contains(string(body), `"items":[]`) {
		t.Fatalf("空库 memory items 形状错误: %s", body)
	}

	status, body = httpGet(t, ts.URL+"/api/memory/items?type=fact&limit=abc")
	if status != http.StatusOK {
		t.Fatalf("V3 空库 memory items = %d %s", status, body)
	}
	if !strings.Contains(string(body), `"ok":true`) || !strings.Contains(string(body), `"total":0`) {
		t.Fatalf("V3 空库 memory items 形状错误: %s", body)
	}

	status, body = httpGet(t, ts.URL+"/api/memory/items/does-not-exist")
	if status != http.StatusNotFound {
		t.Fatalf("未知记忆条目 = %d %s", status, body)
	}
	if !strings.Contains(string(body), `"ok":false`) || !strings.Contains(string(body), `"error"`) {
		t.Fatalf("未知记忆条目缺少统一错误信封: %s", body)
	}

	status, body = httpGet(t, ts.URL+"/api/memory/scopes")
	if status != http.StatusOK || !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("空库 scopes = %d %s", status, body)
	}
}

// P7-E1/E2：空列表、未知 id 的 GET/PATCH/DELETE 必须 404 JSON，非法 JSON 必须 400 JSON。
func TestP7ScheduleEmptyAndNotFoundContract(t *testing.T) {
	_, ts := newM2App(t, nil, nil)

	status, body := httpGet(t, ts.URL+"/api/schedules")
	if status != http.StatusOK || !strings.Contains(string(body), `"schedules":[]`) {
		t.Fatalf("空调度列表 = %d %s", status, body)
	}
	if got := listSchedules(t, ts.URL); len(got) != 0 {
		t.Fatalf("空调度列表应 0 条，得到 %+v", got)
	}

	for _, tc := range []struct {
		method string
		url    string
	}{
		{http.MethodGet, ts.URL + "/api/schedules/does-not-exist"},
		{http.MethodDelete, ts.URL + "/api/schedules/does-not-exist"},
		{http.MethodPost, ts.URL + "/api/schedules/does-not-exist/run-now"},
	} {
		status, body := doContractRequest(t, tc.method, tc.url)
		if status != http.StatusNotFound {
			t.Fatalf("%s %s = %d %s", tc.method, tc.url, status, body)
		}
		if !strings.Contains(string(body), `"ok":false`) || !strings.Contains(string(body), `"error"`) {
			t.Fatalf("%s %s 缺少统一错误信封: %s", tc.method, tc.url, body)
		}
	}

	status, body = patchJSON(t, ts.URL+"/api/schedules/does-not-exist", map[string]any{"enabled": false})
	if status != http.StatusNotFound {
		t.Fatalf("PATCH 未知调度 = %d %s", status, body)
	}
	if !strings.Contains(string(body), `"ok":false`) || !strings.Contains(string(body), `"error"`) {
		t.Fatalf("PATCH 未知调度缺少统一错误信封: %s", body)
	}

	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/schedules", strings.NewReader(`{"sessionId":`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("非法 JSON 调度 = %d %s", resp.StatusCode, raw)
	}
	if !strings.Contains(string(raw), `"ok":false`) || !strings.Contains(string(raw), `"error"`) {
		t.Fatalf("非法 JSON 调度缺少统一错误信封: %s", raw)
	}
}
