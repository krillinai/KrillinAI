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

	client := NewOpenAICompatibleClient(server.URL, "test-key", "dall-e-2")
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
	if gotBody["model"] != "dall-e-2" {
		t.Fatalf("model = %v", gotBody["model"])
	}
	if gotBody["prompt"] != "bilibili cover" {
		t.Fatalf("prompt = %v", gotBody["prompt"])
	}
	if gotBody["response_format"] != "b64_json" {
		t.Fatalf("response_format = %v", gotBody["response_format"])
	}
}

func TestOpenAICompatibleGenerateOmitsResponseFormatForGPTImage(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"abc123"}]}`))
	}))
	defer server.Close()

	client := NewOpenAICompatibleClient(server.URL, "test-key", "gpt-image-2")
	_, err := client.Generate(context.Background(), GenerateRequest{Prompt: "cover"})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if _, ok := gotBody["response_format"]; ok {
		t.Fatalf("response_format should be omitted for gpt-image models: %#v", gotBody)
	}
}

func TestOpenAICompatibleGenerateAcceptsURLResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"url":"https://example.com/cover.png"}]}`))
	}))
	defer server.Close()

	client := NewOpenAICompatibleClient(server.URL, "test-key", "gpt-image-2")
	out, err := client.Generate(context.Background(), GenerateRequest{Prompt: "cover"})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if out.URL != "https://example.com/cover.png" {
		t.Fatalf("URL = %q", out.URL)
	}
}

func TestOpenAICompatibleGenerateReturnsHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad request", http.StatusBadRequest)
	}))
	defer server.Close()

	client := NewOpenAICompatibleClient(server.URL, "test-key", "gpt-image-2")
	_, err := client.Generate(context.Background(), GenerateRequest{Prompt: "cover"})
	if err == nil {
		t.Fatalf("Generate() error = nil, want error")
	}
}

func TestOpenAICompatibleGenerateMigratesRetiredModels(t *testing.T) {
	for _, tc := range []struct{ model, want string }{
		{"gpt-image-1", "gpt-image-2"},
		{"gpt-image-1-mini", "gpt-image-2"},
		{" GPT-IMAGE-1-2025-04-15 ", "gpt-image-2"},
		{"openai/gpt-image-1", "openai/gpt-image-2"},
		{"gpt-image-1.5", "gpt-image-1.5"},
	} {
		t.Run(tc.model, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["model"] != tc.want {
					t.Errorf("model = %v, want %s", body["model"], tc.want)
				}
				if _, ok := body["response_format"]; ok {
					t.Error("GPT image requests must omit response_format")
				}
				_, _ = w.Write([]byte(`{"data":[{"b64_json":"abc123"}]}`))
			}))
			defer server.Close()
			client := NewOpenAICompatibleClient(server.URL, "test-key", tc.model)
			if _, err := client.Generate(context.Background(), GenerateRequest{Prompt: "cover"}); err != nil {
				t.Fatal(err)
			}
		})
	}
}
