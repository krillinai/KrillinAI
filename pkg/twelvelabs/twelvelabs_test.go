package twelvelabs

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"krillin-ai/log"
)

func TestMain(m *testing.M) {
	log.InitLogger() // 客户端在错误路径会调用日志，测试前需初始化
	os.Exit(m.Run())
}

func TestNewClientDefaults(t *testing.T) {
	c := NewClient("", "key", "", "")
	if c.BaseUrl != DefaultBaseUrl {
		t.Fatalf("BaseUrl = %q, want %q", c.BaseUrl, DefaultBaseUrl)
	}
	if c.Model != DefaultModel {
		t.Fatalf("Model = %q, want %q", c.Model, DefaultModel)
	}
	if c.Prompt != DefaultPrompt {
		t.Fatalf("Prompt = %q, want default prompt", c.Prompt)
	}
}

func TestNewClientTrimsTrailingSlash(t *testing.T) {
	c := NewClient("https://api.twelvelabs.io/v1.3/", "key", "pegasus1.5", "custom prompt")
	if c.BaseUrl != "https://api.twelvelabs.io/v1.3" {
		t.Fatalf("BaseUrl = %q, want trailing slash trimmed", c.BaseUrl)
	}
	if c.Prompt != "custom prompt" {
		t.Fatalf("Prompt = %q, want custom prompt", c.Prompt)
	}
}

func TestAnalyzeRequiresApiKey(t *testing.T) {
	c := NewClient("", "", "", "")
	if _, err := c.AnalyzeURL("https://example.com/v.mp4"); err == nil {
		t.Fatal("expected error when api key is empty, got nil")
	}
}

func TestAnalyzeURLSuccess(t *testing.T) {
	const want = "A calm cooking tutorial in a bright kitchen; the host is friendly and instructional."
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/analyze" {
			t.Errorf("path = %q, want /analyze", r.URL.Path)
		}
		if got := r.Header.Get("x-api-key"); got != "secret" {
			t.Errorf("x-api-key = %q, want secret", got)
		}
		var req analyzeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		if req.Stream {
			t.Errorf("stream = true, want false (non-stream JSON response required)")
		}
		if req.Video.Type != "url" || req.Video.Url != "https://example.com/v.mp4" {
			t.Errorf("video = %+v, want type=url url=https://example.com/v.mp4", req.Video)
		}
		if req.ModelName != DefaultModel {
			t.Errorf("model_name = %q, want %q", req.ModelName, DefaultModel)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(analyzeResponse{Data: want})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "secret", "", "")
	got, err := c.AnalyzeURL("https://example.com/v.mp4")
	if err != nil {
		t.Fatalf("AnalyzeURL() error = %v", err)
	}
	if got != want {
		t.Fatalf("AnalyzeURL() = %q, want %q", got, want)
	}
}

func TestAnalyzeAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(analyzeResponse{Code: "video_file_broken", Message: "bad file"})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "secret", "", "")
	_, err := c.AnalyzeURL("https://example.com/v.mp4")
	if err == nil {
		t.Fatal("expected error on non-200 status, got nil")
	}
	if !strings.Contains(err.Error(), "video_file_broken") {
		t.Fatalf("error = %v, want it to include API error code", err)
	}
}

func TestAnalyzeEmptyData(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(analyzeResponse{Data: "  "})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "secret", "", "")
	if _, err := c.AnalyzeURL("https://example.com/v.mp4"); err == nil {
		t.Fatal("expected error on empty summary, got nil")
	}
}

func TestUploadAssetSuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/assets" {
			t.Errorf("path = %q, want /assets", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("ParseMultipartForm: %v", err)
		}
		if r.FormValue("method") != "direct" {
			t.Errorf("method = %q, want direct", r.FormValue("method"))
		}
		if _, _, err := r.FormFile("file"); err != nil {
			t.Errorf("expected 'file' form field: %v", err)
		}
		_ = json.NewEncoder(w).Encode(assetResponse{ID: "asset123", Status: "ready"})
	}))
	defer srv.Close()

	dir := t.TempDir()
	path := filepath.Join(dir, "clip.mp4")
	if err := os.WriteFile(path, []byte("fake video bytes"), 0644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	c := NewClient(srv.URL, "secret", "", "")
	id, err := c.UploadAsset(path)
	if err != nil {
		t.Fatalf("UploadAsset() error = %v", err)
	}
	if id != "asset123" {
		t.Fatalf("UploadAsset() = %q, want asset123", id)
	}
}

func TestUploadAssetRejectsOversize(t *testing.T) {
	// No server needed: the size guard runs before any request.
	dir := t.TempDir()
	path := filepath.Join(dir, "big.mp4")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	if err := f.Truncate(maxDirectUploadBytes + 1); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	f.Close()

	c := NewClient("http://127.0.0.1:0", "secret", "", "")
	_, err = c.UploadAsset(path)
	if err == nil {
		t.Fatal("expected error for oversize file, got nil")
	}
	if !strings.Contains(err.Error(), "200MB") {
		t.Fatalf("error = %v, want it to mention the 200MB cap", err)
	}
}
