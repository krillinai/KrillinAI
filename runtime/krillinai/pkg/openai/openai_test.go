package openai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestChatCompletionReceivesCompleteJSON(t *testing.T) {
	setTestModel(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Stream bool `json:"stream"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.Stream {
			t.Errorf("请求应使用非流式JSON: stream=%v error=%v", request.Stream, err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"complete-json","choices":[{"message":{"role":"assistant","content":"完整译文"}}]}`))
	}))
	defer server.Close()
	text, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletion("translate")
	if err != nil || text != "完整译文" {
		t.Fatalf("text=%q error=%v", text, err)
	}
}

func TestChatCompletionSendsRequestedOutputBudget(t *testing.T) {
	setTestModel(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			MaxTokens int `json:"max_tokens"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.MaxTokens != 2048 {
			t.Errorf("输出预算未传给供应商: %d %v", request.MaxTokens, err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"你好。"}}]}`))
	}))
	defer server.Close()
	client := newClient(server.URL, "test-key", "", time.Second)
	if text, err := client.ChatCompletionContextWithMaxTokens(context.Background(), "translate", 2048); err != nil || text != "你好。" {
		t.Fatalf("text=%q err=%v", text, err)
	}
	for _, budget := range []int{0, -1, 8193} {
		if _, err := client.ChatCompletionContextWithMaxTokens(context.Background(), "translate", budget); err == nil {
			t.Fatalf("无效预算被接受: %d", budget)
		}
	}
}

func TestChatCompletionPreservesOriginalDefaultOutputBudget(t *testing.T) {
	setTestModel(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			MaxTokens int `json:"max_tokens"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.MaxTokens != 8192 {
			t.Errorf("original default budget changed: max_tokens=%d err=%v", request.MaxTokens, err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"choices":[{"message":{"content":"完整译文。"}}]}`)
	}))
	defer server.Close()
	if _, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletion("translate"); err != nil {
		t.Fatal(err)
	}
}

func TestChatCompletionRejectsEmptyResponse(t *testing.T) {
	setTestModel(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"empty","choices":[]}`))
	}))
	defer server.Close()
	_, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletion("translate")
	if err == nil || !strings.Contains(err.Error(), "llm_translation_empty_response") {
		t.Fatalf("未明确拒绝空响应: %v", err)
	}
}

func TestChatCompletionDisablesThinkingForEveryModel(t *testing.T) {
	for _, tc := range []struct {
		model, name      string
		deepSeekSampling bool
	}{
		{"deepseek-flash", "", true},
		{"deepseek-v4-flash", "", true},
		{"deepseek-v4-pro", "", true},
		{"deepseek-v4.1-flash", "", true},
		{"deepseek-v4-1-flash-261017", "", true},
		{"deepseek/deepseek-v4.1-flash", "", true},
		{"oc_708ac39a01ac1a51", "deepseek-v4.1-flash", true},
		{"oc_fallback", " DeepSeek-V4.1-Pro ", true},
		{"oc_unknown", "", false},
		{"oc_other", "gpt-4o-mini", false},
		{"deepseek-v4-flash", "test-model", false},
		{"deepseek-chat", "", false},
		{"deepseek-reasoner", "", false},
		{"test-model", "", false},
		{"gpt-5.5", "", false},
		{"gpt-5.6-sol", "", false},
		{"gpt-6-sol", "", false},
		{"gpt-6-astra", "", false},
		{"gpt-6-luna", "", false},
		{"kimi-k3", "", false},
		{"grok-4.5", "", false},
		{"grok-4.6", "", false},
		{"grok-4.7", "", false},
	} {
		t.Run(tc.model+"/"+tc.name, func(t *testing.T) {
			setTestModel(t)
			config.Conf.Llm.Model = tc.model
			config.Conf.Llm.ModelName = tc.name
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Model           string   `json:"model"`
					ReasoningEffort string   `json:"reasoning_effort"`
					Temperature     *float32 `json:"temperature"`
				}
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Error(err)
				}
				want := "none"
				if request.Model != tc.model || request.ReasoningEffort != want {
					t.Errorf("model=%q reasoning_effort=%q, want %q %q", request.Model, request.ReasoningEffort, tc.model, want)
				}
				if tc.deepSeekSampling && (request.Temperature == nil || *request.Temperature != 0.2) {
					t.Errorf("DeepSeek V4 temperature = %v, want 0.2", request.Temperature)
				}
				if !tc.deepSeekSampling && request.Temperature != nil {
					t.Errorf("model %q should use default sampling", tc.model)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"id":"translated","choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"完整译文"}}]}`))
			}))
			defer server.Close()
			if _, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletion("translate"); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestChatCompletionRejectsTruncatedResponse(t *testing.T) {
	for _, content := range []string{"", `{"sentences":[`} {
		t.Run(content, func(t *testing.T) {
			setTestModel(t)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = fmt.Fprintf(w, `{"id":"truncated","choices":[{"finish_reason":"length","message":{"role":"assistant","content":%q}}]}`, content)
			}))
			defer server.Close()
			text, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletion("translate")
			if text != "" || err == nil || !strings.Contains(err.Error(), "llm_translation_truncated") {
				t.Fatalf("截断响应不应作为译文或普通空响应返回: text=%q error=%v", text, err)
			}
		})
	}
}

func TestChatCompletionTimesOut(t *testing.T) {
	setTestModel(t)
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})

	client := newClient(server.URL, "test-key", "", 40*time.Millisecond)
	_, err := client.ChatCompletion("translate")
	if err == nil || !strings.Contains(err.Error(), "llm_translation_timeout") {
		t.Fatalf("ChatCompletion() error = %v, want llm_translation_timeout", err)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("ChatCompletion() error = %v, want context deadline", err)
	}
}

func TestChatCompletionUsesDefaultSampling(t *testing.T) {
	setTestModel(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
		}
		if _, exists := request["temperature"]; exists {
			t.Error("default model should not send temperature")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"default-sampling","choices":[{"message":{"role":"assistant","content":"完整译文"}}]}`))
	}))
	defer server.Close()
	if _, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletion("translate"); err != nil {
		t.Fatal(err)
	}
}

func TestChatCompletionReportsAPIError(t *testing.T) {
	setTestModel(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"type":"upstream_error","code":"official_service_unavailable","message":"Official service request could not be completed"}}`))
	}))
	defer server.Close()

	client := newClient(server.URL, "test-key", "", time.Second)
	_, err := client.ChatCompletion("translate")
	if err == nil || !strings.Contains(err.Error(), "Official service request could not be completed") {
		t.Fatalf("ChatCompletion() error = %v, want the API error", err)
	}
}

func TestChatCompletionHonorsParentCancellation(t *testing.T) {
	setTestModel(t)
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	client := newClient(server.URL, "test-key", "", time.Second)
	_, err := client.ChatCompletionContext(ctx, "translate")
	if err == nil || !strings.Contains(err.Error(), "llm_translation_canceled") {
		t.Fatalf("ChatCompletionContext() error = %v, want llm_translation_canceled", err)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("ChatCompletionContext() error = %v, want context canceled", err)
	}
}

func TestNewClientUsesConfiguredProxy(t *testing.T) {
	setTestModel(t)
	var requests atomic.Int32
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		http.Error(w, "proxy reached", http.StatusBadGateway)
	}))
	defer proxy.Close()

	client := newClient("http://upstream.invalid/v1", "test-key", proxy.URL, time.Second)
	_, _ = client.ChatCompletion("translate")
	if requests.Load() != 1 {
		t.Fatalf("proxy requests = %d, want 1", requests.Load())
	}
}

func setTestModel(t *testing.T) {
	t.Helper()
	log.InitLogger()
	previous := config.Conf.Llm
	config.Conf.Llm.Model = "test-model"
	config.Conf.Llm.ModelName = ""
	t.Cleanup(func() { config.Conf.Llm = previous })
}

func TestChatCompletionPreservesBudgetForSDKValidatedModel(t *testing.T) {
	setTestModel(t)
	config.Conf.Llm.Model = "gpt-5.5"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request["reasoning_effort"] != "none" || request["max_completion_tokens"] != float64(2048) || request["max_tokens"] != nil {
			t.Errorf("SDK-compatible request lost its non-reasoning setting or budget: %v", request)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"choices":[{"finish_reason":"stop","message":{"content":"完整译文"}}]}`)
	}))
	defer server.Close()
	text, err := newClient(server.URL, "test-key", "", time.Second).ChatCompletionContextWithMaxTokens(context.Background(), "translate", 2048)
	if err != nil || text != "完整译文" {
		t.Fatalf("text=%q err=%v", text, err)
	}
}
