package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fetchArtifactContent(t *testing.T, url string) (*http.Response, []byte, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(body)
	return resp, body, hex.EncodeToString(sum[:])
}

func TestM84ArtifactDownloadDisposition(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UnixMilli()
	path := filepath.Join(a.sandbox.Workspace, "main", "output", "报告.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("交付内容"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
			id,task_id,name,rel_path,mime,size,created_at,delivery_kind,storage_scope,workspace_rel_path)
			VALUES ('art-download','session:main','..\\evil\r\n报告.md','', 'text/markdown',12,?, 'user_delivery','workspace','main/output/报告.md')`, now)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	base := ts.URL + "/api/artifacts/art-download/content"
	preview, previewBody, previewSHA := fetchArtifactContent(t, base)
	if preview.StatusCode != http.StatusOK {
		t.Fatalf("preview = %d", preview.StatusCode)
	}
	if !strings.HasPrefix(preview.Header.Get("Content-Disposition"), "inline;") {
		t.Fatalf("preview disposition = %q", preview.Header.Get("Content-Disposition"))
	}
	if preview.Header.Get("Content-Type") != "text/markdown; charset=utf-8" {
		t.Fatalf("content-type = %q", preview.Header.Get("Content-Type"))
	}
	if preview.ContentLength != int64(len(previewBody)) || string(previewBody) != "交付内容" {
		t.Fatalf("preview body/length = %d %q", preview.ContentLength, previewBody)
	}
	download, downloadBody, downloadSHA := fetchArtifactContent(t, base+"?download=1")
	if download.StatusCode != http.StatusOK {
		t.Fatalf("download = %d", download.StatusCode)
	}
	disposition := download.Header.Get("Content-Disposition")
	if !strings.HasPrefix(disposition, "attachment;") || !strings.Contains(disposition, "filename*=UTF-8''") {
		t.Fatalf("download disposition = %q", disposition)
	}
	if strings.ContainsAny(disposition, "\r\n") || strings.Contains(disposition, "/") && !strings.Contains(disposition, "%2F") {
		t.Fatalf("download filename 未净化: %q", disposition)
	}
	encodedName := disposition[strings.Index(disposition, "UTF-8''")+len("UTF-8''"):]
	decoded, err := url.PathUnescape(encodedName)
	if err != nil || !strings.Contains(decoded, "报告.md") || strings.ContainsAny(decoded, `/\`) {
		t.Fatalf("filename* = %q decoded=%q err=%v", encodedName, decoded, err)
	}
	if downloadSHA != previewSHA || string(downloadBody) != "交付内容" {
		t.Fatalf("preview/download 字节不一致")
	}
	again, _, againSHA := fetchArtifactContent(t, base+"?download=1")
	if againSHA != downloadSHA || again.Header.Get("Content-Disposition") != disposition {
		t.Fatalf("重复下载不稳定")
	}
	if status, _ := httpGet(t, ts.URL+"/api/artifacts/no-such/content?download=1"); status != http.StatusNotFound {
		t.Fatalf("unknown download = %d, want 404", status)
	}
}
