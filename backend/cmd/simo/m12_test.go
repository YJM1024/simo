package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func waitPendingApproval(t *testing.T, baseURL string) string {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		_, body := httpGet(t, baseURL+"/api/approvals")
		var payload struct {
			Approvals []struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			} `json:"approvals"`
		}
		if json.Unmarshal(body, &payload) == nil {
			for _, approval := range payload.Approvals {
				if approval.Status == "pending" {
					return approval.ID
				}
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("等待 pending approval 超时")
	return ""
}

func allowApproval(t *testing.T, baseURL, id string) []byte {
	t.Helper()
	status, body := postJSON(t, baseURL+"/api/approvals/"+id, map[string]any{"decision": "allow_once"})
	if status != http.StatusOK {
		t.Fatalf("allow = %d %s", status, body)
	}
	return body
}

func listArtifacts(t *testing.T, baseURL string) []map[string]any {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/artifacts?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("artifacts = %d %s", status, body)
	}
	var payload struct {
		Artifacts []map[string]any `json:"artifacts"`
	}
	if json.Unmarshal(body, &payload) != nil {
		t.Fatalf("artifacts JSON = %s", body)
	}
	return payload.Artifacts
}

func TestM12PDFGenerationApprovalAndPreview(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:make-pdf 请导出 PDF"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	approvalID := waitPendingApproval(t, ts.URL)
	result := string(allowApproval(t, ts.URL, approvalID))
	if !strings.Contains(result, "artifact") {
		t.Fatalf("审批执行未返回 artifact: %s", result)
	}
	deadline := time.Now().Add(20 * time.Second)
	var artifacts []map[string]any
	for time.Now().Before(deadline) {
		artifacts = listArtifacts(t, ts.URL)
		if len(artifacts) > 0 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if len(artifacts) == 0 {
		t.Fatal("PDF 产物未登记")
	}
	var pdfArtifact map[string]any
	for _, artifact := range artifacts {
		name, _ := artifact["name"].(string)
		if strings.HasSuffix(strings.ToLower(name), ".pdf") {
			pdfArtifact = artifact
			break
		}
	}
	if pdfArtifact == nil {
		t.Fatalf("未找到 PDF 产物: %+v", artifacts)
	}
	id, _ := pdfArtifact["id"].(string)
	name, _ := pdfArtifact["name"].(string)
	if id == "" || !strings.HasSuffix(strings.ToLower(name), ".pdf") {
		t.Fatalf("PDF 产物元数据 = %+v", artifacts[0])
	}
	status, body := httpGet(t, ts.URL+"/api/artifacts/"+id+"/content")
	if status != http.StatusOK || len(body) < 100 {
		t.Fatalf("PDF 下载 = %d len=%d", status, len(body))
	}
	if !strings.HasPrefix(string(body), "%PDF") {
		t.Fatalf("下载内容不是 PDF: %q", body[:minInt(len(body), 20)])
	}
}

func TestM12DocxAndXlsxHelpers(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for _, prompt := range []string{"mock:make-docx", "mock:make-xlsx", "mock:make-pptx", "mock:make-image"} {
		if status, _ := postChat(t, ts.URL, prompt); status != http.StatusAccepted {
			t.Fatalf("%s chat = %d", prompt, status)
		}
		approvalID := waitPendingApproval(t, ts.URL)
		result := string(allowApproval(t, ts.URL, approvalID))
		if !strings.Contains(result, "artifact") {
			t.Fatalf("%s 执行结果 = %s", prompt, result)
		}
	}
	deadline := time.Now().Add(20 * time.Second)
	var artifacts []map[string]any
	for time.Now().Before(deadline) {
		artifacts = listArtifacts(t, ts.URL)
		if len(artifacts) >= 4 {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if len(artifacts) < 4 {
		t.Fatalf("Office 产物不足: %+v", artifacts)
	}
	exts := map[string]bool{}
	for _, artifact := range artifacts {
		name, _ := artifact["name"].(string)
		exts[strings.ToLower(name[strings.LastIndex(name, ".")+1:])] = true
	}
	if !exts["docx"] || !exts["xlsx"] || !exts["pptx"] || !exts["png"] {
		t.Fatalf("Office 扩展名 = %v (%+v)", exts, artifacts)
	}
	// Office/图片下载：正确 MIME + attachment（不再 415）。
	for _, artifact := range artifacts {
		name, _ := artifact["name"].(string)
		lowerName := strings.ToLower(name)
		if !strings.HasSuffix(lowerName, ".docx") && !strings.HasSuffix(lowerName, ".xlsx") &&
			!strings.HasSuffix(lowerName, ".pptx") && !strings.HasSuffix(lowerName, ".png") {
			continue
		}
		id, _ := artifact["id"].(string)
		response, err := http.Get(ts.URL + "/api/artifacts/" + id + "/content")
		if err != nil {
			t.Fatalf("下载 %s: %v", name, err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("下载 %s status = %d", name, response.StatusCode)
		}
		contentType := response.Header.Get("Content-Type")
		disposition := response.Header.Get("Content-Disposition")
		if strings.HasSuffix(strings.ToLower(name), ".png") {
			if !strings.HasPrefix(contentType, "image/png") || !strings.HasPrefix(disposition, "inline") {
				t.Fatalf("PNG header = %q %q", contentType, disposition)
			}
		} else if !strings.HasPrefix(disposition, "attachment") ||
			!strings.Contains(contentType, "openxmlformats") {
			t.Fatalf("Office header = %q %q (%s)", contentType, disposition, name)
		}
	}
}

func TestM12WebSearchAndFetchMock(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:web-search simo"); status != http.StatusAccepted {
		t.Fatalf("search chat = %d", status)
	}
	approvalID := waitPendingApproval(t, ts.URL)
	result := string(allowApproval(t, ts.URL, approvalID))
	if !strings.Contains(result, "results") || !strings.Contains(result, "mock") {
		t.Fatalf("web_search 结果 = %s", result)
	}
	if status, _ := postChat(t, ts.URL, "mock:web-fetch https://example.com"); status != http.StatusAccepted {
		t.Fatalf("fetch chat = %d", status)
	}
	approvalID = waitPendingApproval(t, ts.URL)
	result = string(allowApproval(t, ts.URL, approvalID))
	if !strings.Contains(result, "mock fixture") {
		t.Fatalf("web_fetch 结果 = %s", result)
	}
}

func TestM12WebFetchSSRFDenied(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:web-fetch http://127.0.0.1/secret"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	approvalID := waitPendingApproval(t, ts.URL)
	result := string(allowApproval(t, ts.URL, approvalID))
	if !strings.Contains(result, "ssrf_denied") {
		t.Fatalf("SSRF 未被拒绝: %s", result)
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
