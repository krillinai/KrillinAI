package service

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/log"
	"krillin-ai/pkg/openai"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestTranslationContentRevisionAndVerificationUseFallback(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	var primaryCalls, fallbackCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		primaryCalls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = fmt.Fprint(w, `{"error":{"message":"Concurrency limit exceeded"}}`)
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fallbackCalls.Add(1)
		var req struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Messages) != 2 {
			t.Error("无效请求")
			return
		}
		var result string
		switch {
		case strings.HasPrefix(req.Messages[1].Content, "任务：translation_content\n"):
			result = `{"sentences":[{"sentence_id":"1","target_text":"它发挥着实用主义的作用。"}]}`
		case strings.HasPrefix(req.Messages[1].Content, "任务：translation_revision\n"):
			result = `{"corrections":[{"sentence_id":"1","reason":"这里指实际用途","target_text":"它有实用价值。"}]}`
		case strings.HasPrefix(req.Messages[1].Content, "任务：translation_revision_verify\n"):
			result = `{"accepted_ids":["1"],"reason":"修订忠实保留实际用途，没有添加事实。"}`
		default:
			t.Error("出现预期外的翻译阶段")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"choices":[{"message":{"content":%q}}]}`, result)
	}))
	defer fallback.Close()
	config.Conf.Llm.Model = "primary-model"
	config.Conf.LlmFallback = config.OpenaiCompatibleConfig{BaseUrl: fallback.URL, ApiKey: "fallback-test-key", Model: "deepseek-flash"}
	translator := newTranslator(openai.NewClient(primary.URL, "primary-test-key", ""))
	translator.reviseTranslation = true
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 50, Sentences: []pairedTranslationSource{{ID: "1", Text: "It serves a utilitarian purpose."}}}
	var completed pairedSentence
	remaining, err := translator.translateSemanticBatch(context.Background(), input, &translationSemanticPlan{}, "en", "zh_cn", func(sentence pairedSentence, complete bool) error {
		if complete {
			completed = sentence
		}
		return nil
	})
	if err != nil || len(remaining.Sentences) != 0 || completed.FullTarget != "它有实用价值。" || completed.DraftTarget != "它发挥着实用主义的作用。" || completed.RevisionVersion == "" || primaryCalls.Load() != 3 || fallbackCalls.Load() != 3 {
		t.Fatalf("备用源未完成初译、修订和核验: err=%v completed=%+v remaining=%d primary=%d fallback=%d", err, completed, len(remaining.Sentences), primaryCalls.Load(), fallbackCalls.Load())
	}
}
