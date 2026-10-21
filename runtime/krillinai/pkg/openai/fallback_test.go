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

	openaiapi "github.com/sashabaranov/go-openai"
)

func fallbackTestClient(t *testing.T, primaryURL, fallbackURL string) *Client {
	t.Helper()
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.Llm.Model = "primary-model"
	config.Conf.LlmFallback = config.OpenaiCompatibleConfig{BaseUrl: fallbackURL, ApiKey: "fallback-test-key", Model: "deepseek-flash"}
	return NewClient(primaryURL, "primary-test-key", "")
}

func TestChatCompletionFallsBackOnProviderErrors(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
	}{
		{"rate_limit", 429, `{"error":{"message":"Concurrency limit exceeded"}}`},
		{"gateway", 502, `{"error":{"message":"Bad gateway"}}`},
		{"authentication", 401, `{"error":{"message":"Invalid API key"}}`},
		{"bad_request", 400, `{"error":{"message":"Invalid model"}}`},
		{"invalid_json", 200, `{`},
		{"empty", 200, `{"choices":[]}`},
		{"truncated", 200, `{"choices":[{"finish_reason":"length","message":{"content":"partial"}}]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var primaryCalls, fallbackCalls atomic.Int32
			primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				primaryCalls.Add(1)
				if r.Header.Get("Authorization") != "Bearer primary-test-key" {
					t.Error("主源使用了错误密钥")
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer primary.Close()
			fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				fallbackCalls.Add(1)
				var req struct {
					Model           string `json:"model"`
					MaxTokens       int    `json:"max_tokens"`
					ReasoningEffort string `json:"reasoning_effort"`
					Messages        []struct {
						Content string `json:"content"`
					} `json:"messages"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Error(err)
				}
				if r.Header.Get("Authorization") != "Bearer fallback-test-key" || req.Model != "deepseek-flash" || req.MaxTokens != 2048 || req.ReasoningEffort != "none" || len(req.Messages) != 2 || req.Messages[1].Content != "同一翻译请求" {
					t.Error("备用请求没有独立使用模型、密钥或保留原请求参数")
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = fmt.Fprint(w, `{"choices":[{"message":{"content":"备用译文"}}]}`)
			}))
			defer fallback.Close()
			client := fallbackTestClient(t, primary.URL, fallback.URL)
			text, err := client.ChatCompletionContextWithMaxTokens(context.Background(), "同一翻译请求", 2048)
			if err != nil || text != "备用译文" || primaryCalls.Load() != 1 || fallbackCalls.Load() != 1 || config.Conf.Llm.Model != "primary-model" {
				t.Fatalf("故障切换失败: text=%q err=%v primary=%d fallback=%d", text, err, primaryCalls.Load(), fallbackCalls.Load())
			}
		})
	}
}

func TestChatCompletionPrefersPrimaryAfterFallback(t *testing.T) {
	var primaryCalls, fallbackCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if primaryCalls.Add(1) == 1 {
			w.WriteHeader(429)
			_, _ = fmt.Fprint(w, `{"error":{"message":"rate limited"}}`)
			return
		}
		_, _ = fmt.Fprint(w, `{"choices":[{"message":{"content":"主源译文"}}]}`)
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"choices":[{"message":{"content":"备用译文"}}]}`)
	}))
	defer fallback.Close()
	client := fallbackTestClient(t, primary.URL, fallback.URL)
	for _, want := range []string{"备用译文", "主源译文", "主源译文"} {
		text, err := client.ChatCompletion("translate")
		if err != nil || text != want {
			t.Fatalf("text=%q want=%q err=%v", text, want, err)
		}
	}
	if primaryCalls.Load() != 3 || fallbackCalls.Load() != 1 {
		t.Fatal("主源恢复后仍在使用备用源")
	}
}

func TestChatCompletionFallbackOnTimeoutAndNetworkFailure(t *testing.T) {
	for _, networkFailure := range []bool{false, true} {
		t.Run(fmt.Sprint(networkFailure), func(t *testing.T) {
			release := make(chan struct{})
			primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-release }))
			if networkFailure {
				primary.Close()
			}
			t.Cleanup(func() { close(release); primary.Close() })
			fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = fmt.Fprint(w, `{"choices":[{"message":{"content":"备用译文"}}]}`)
			}))
			defer fallback.Close()
			client := fallbackTestClient(t, primary.URL, fallback.URL)
			client.requestTimeout = 40 * time.Millisecond
			text, err := client.ChatCompletion("translate")
			if err != nil || text != "备用译文" {
				t.Fatalf("text=%q err=%v", text, err)
			}
		})
	}
}

func TestChatCompletionDoesNotFallbackOnParentCancellation(t *testing.T) {
	for _, deadline := range []bool{false, true} {
		t.Run(fmt.Sprint(deadline), func(t *testing.T) {
			release := make(chan struct{})
			ctx, cancel := context.WithCancel(context.Background())
			if deadline {
				ctx, cancel = context.WithTimeout(context.Background(), 40*time.Millisecond)
			}
			defer cancel()
			primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !deadline {
					cancel()
				}
				<-release
			}))
			t.Cleanup(func() { close(release); primary.Close() })
			var fallbackCalls atomic.Int32
			fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fallbackCalls.Add(1) }))
			defer fallback.Close()
			client := fallbackTestClient(t, primary.URL, fallback.URL)
			_, err := client.ChatCompletionContext(ctx, "translate")
			want := context.Canceled
			if deadline {
				want = context.DeadlineExceeded
			}
			if !errors.Is(err, want) || fallbackCalls.Load() != 0 {
				t.Fatalf("err=%v fallback=%d", err, fallbackCalls.Load())
			}
		})
	}
}

func TestChatCompletionBothProvidersFailPreservesRetryStatus(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(502)
		_, _ = fmt.Fprint(w, `{"error":{"message":"primary unavailable"}}`)
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(429)
		_, _ = fmt.Fprint(w, `{"error":{"message":"fallback limited"}}`)
	}))
	defer fallback.Close()
	client := fallbackTestClient(t, primary.URL, fallback.URL)
	_, err := client.ChatCompletion("translate")
	var apiError *openaiapi.APIError
	if !errors.As(err, &apiError) || apiError.HTTPStatusCode != 429 || !strings.Contains(err.Error(), "primary unavailable") || !strings.Contains(err.Error(), "fallback limited") {
		t.Fatalf("未保留两源失败原因及备用源重试状态: %v", err)
	}
}
