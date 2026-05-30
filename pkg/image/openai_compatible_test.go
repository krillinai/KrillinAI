package image

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAICompatibleGenerateSendsJSONRequest(t *testing.T) {
	var gotPath string
	var gotAuth string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"abc123"}]}`))
	}))
	defer server.Close()

	client := NewOpenAICompatibleClient(server.URL, "test-key", "gpt-image-1")
	out, err := client.Generate(context.Background(), GenerateRequest{
		Prompt: "bilibili cover",
		Size:   "1024x1024",
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if out.B64JSON != "abc123" {
		t.Fatalf("B64JSON = %q, want abc123", out.B64JSON)
	}
	if gotPath != "/images/generations" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotAuth != "Bearer test-key" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotBody["model"] != "gpt-image-1" {
		t.Fatalf("model = %v", gotBody["model"])
	}
	if gotBody["prompt"] != "bilibili cover" {
		t.Fatalf("prompt = %v", gotBody["prompt"])
	}
	if gotBody["response_format"] != "b64_json" {
		t.Fatalf("response_format = %v", gotBody["response_format"])
	}
}

func TestOpenAICompatibleGenerateReturnsHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad request", http.StatusBadRequest)
	}))
	defer server.Close()

	client := NewOpenAICompatibleClient(server.URL, "test-key", "gpt-image-1")
	_, err := client.Generate(context.Background(), GenerateRequest{Prompt: "cover"})
	if err == nil {
		t.Fatalf("Generate() error = nil, want error")
	}
}
