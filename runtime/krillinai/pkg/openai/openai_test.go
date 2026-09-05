package openai

import (
	"context"
	"errors"
	"krillin-ai/config"
	"krillin-ai/log"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

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
	previous := config.Conf.Llm.Model
	config.Conf.Llm.Model = "test-model"
	t.Cleanup(func() { config.Conf.Llm.Model = previous })
}
