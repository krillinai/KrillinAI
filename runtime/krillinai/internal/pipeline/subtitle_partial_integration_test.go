package pipeline

import (
	"context"
	"encoding/json"
	"krillin-ai/config"
	"krillin-ai/internal/service"
	"krillin-ai/log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// 真实主模型HTTP调用、SRT导出、结果警告、持久化和逐行恢复共用一个测试。
func TestPartialSubtitleTranslationIntegrationAndRetry(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf = config.Config{}
	config.Conf.Llm.Model = "partial-translation-test"
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.VttBatchSize = 10
	config.Conf.App.MaxSentenceLength = 65
	var mu sync.Mutex
	repaired := false
	calls := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var req struct {
			Messages []struct{ Content string } `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Messages) != 2 {
			t.Errorf("无效请求：%v", err)
			http.Error(w, "invalid request", 400)
			return
		}
		prompt := req.Messages[1].Content
		content := `{"summary":"读书与见面","terms":[]}`
		if strings.HasPrefix(prompt, "任务：translation_revision\n") {
			content = `{"corrections":[]}`
		} else if strings.Contains(prompt, "target_text") && !strings.HasPrefix(prompt, "任务：translation_context\n") {
			_, payload, _ := strings.Cut(prompt, "输入 JSON：\n")
			var input struct {
				Sentences []struct {
					ID string `json:"sentence_id"`
				} `json:"sentences"`
			}
			if err := json.NewDecoder(strings.NewReader(payload)).Decode(&input); err != nil {
				t.Error(err)
				http.Error(w, "invalid payload", 400)
				return
			}
			var sentences []map[string]string
			for _, source := range input.Sentences {
				calls[source.ID]++
				target := "我读书。"
				if source.ID == "2" {
					target = ""
					if repaired {
						target = "我们今天见面。"
					}
				}
				sentences = append(sentences, map[string]string{"sentence_id": source.ID, "target_text": target})
			}
			var data []byte
			if strings.HasPrefix(prompt, "任务：translation_content\n") {
				data, _ = json.Marshal(map[string]any{"sentences": sentences})
			} else if len(sentences) == 1 {
				data, _ = json.Marshal(sentences[0])
			} else {
				t.Errorf("未预期请求：%s", prompt[:min(len(prompt), 100)])
			}
			content = string(data)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"content": content}}}})
	}))
	defer server.Close()
	config.Conf.Llm.BaseUrl = server.URL + "/v1"
	workdir := t.TempDir()
	input := filepath.Join(workdir, "input.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:01,000 --> 00:00:03,000\nI read books.\n\n2\n00:00:03,000 --> 00:00:05,000\nWe meet today.\n\n"), 0600); err != nil {
		t.Fatal(err)
	}
	var completion string
	req := SubtitleRequest{TaskID: "partial", Workdir: workdir, InputSRT: input, OriginLang: "en", TargetLang: "zh_cn", ReportProgress: func(phase string, _ int, message string, _ ...ProgressCounts) {
		if phase == "completed" {
			completion = message
		}
	}}
	run := func() Response {
		response, err := GenerateSubtitles(context.Background(), NewServiceAdapter(service.NewService()), req)
		if err != nil || !response.OK {
			t.Fatalf("字幕生成失败：%+v %v", response, err)
		}
		return response
	}
	response := run()
	if len(response.TranslationFailures) != 1 || response.TranslationFailures[0].SentenceID != "2" || len(response.Warnings) != 1 || !strings.Contains(completion, "1条字幕未翻译") {
		t.Fatalf("未返回部分完成状态：%+v message=%s", response, completion)
	}
	blocks, err := readSRTBlocks(response.Outputs.TargetSRT)
	if err != nil || len(blocks) != 2 || blocks[0].Lines[0] != "我读书。" || blocks[1].Lines[0] != "We meet today." || blocks[1].Timestamp != "00:00:03,000 --> 00:00:05,000" {
		t.Fatalf("回退原文或时间丢失：%+v %v", blocks, err)
	}
	manifest, err := LoadManifest(workdir)
	if err != nil || len(manifest.TranslationFailures) != 1 || !manifest.Stages[string(StageSubtitle)].OK {
		t.Fatalf("未持久化部分完成信息：%+v %v", manifest, err)
	}
	mu.Lock()
	firstCalls, failedCalls := calls["1"], calls["2"]
	repaired = true
	mu.Unlock()
	if firstCalls != 1 || failedCalls != 3 {
		t.Fatalf("有限重试次数错误：%d %d", firstCalls, failedCalls)
	}
	response = run()
	if len(response.TranslationFailures) != 0 || len(response.Warnings) != 0 {
		t.Fatalf("恢复后仍保留旧警告：%+v", response)
	}
	manifest, err = LoadManifest(workdir)
	if err != nil || len(manifest.TranslationFailures) != 0 || len(manifest.Warnings) != 0 {
		t.Fatal("恢复后未清除持久化的旧失败信息")
	}
	blocks, err = readSRTBlocks(response.Outputs.TargetSRT)
	if err != nil || blocks[1].Lines[0] != "我们今天见面。" {
		t.Fatalf("未替换原文回退：%+v %v", blocks, err)
	}
	mu.Lock()
	defer mu.Unlock()
	if calls["1"] != firstCalls || calls["2"] != failedCalls+1 {
		t.Fatalf("恢复重译了成功字幕：%v", calls)
	}
}
