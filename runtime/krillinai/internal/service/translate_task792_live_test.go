package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/BurntSushi/toml"
)

type task792ContextCompleter func(context.Context, string) (string, error)

func (f task792ContextCompleter) ChatCompletion(prompt string) (string, error) {
	return f(context.Background(), prompt)
}

func (f task792ContextCompleter) ChatCompletionContext(ctx context.Context, prompt string) (string, error) {
	return f(ctx, prompt)
}

func TestTranslationTask792FullLive(t *testing.T) {
	configPath := os.Getenv("KRILLINAI_TASK792_CONFIG")
	sourcePath := os.Getenv("KRILLINAI_TASK792_SOURCE")
	outputPath := os.Getenv("KRILLINAI_TASK792_OUTPUT")
	if configPath == "" || sourcePath == "" || outputPath == "" {
		t.Skip("指定配置、原始字幕和独立输出目录后运行任务792全量翻译复测")
	}
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	if _, err := toml.DecodeFile(configPath, &config.Conf); err != nil {
		t.Fatal(err)
	}
	if value := os.Getenv("KRILLINAI_TASK792_PARALLEL"); value != "" {
		parallel, err := strconv.Atoi(value)
		if err != nil || parallel < 1 {
			t.Fatalf("无效复测并发数: %q", value)
		}
		config.Conf.App.TranslateParallelNum = parallel
	}
	blocks, err := util.ParseSrtFile(sourcePath)
	if err != nil || len(blocks) == 0 {
		t.Fatalf("原始字幕条数=%d, error=%v", len(blocks), err)
	}
	svc := &YouTubeSubtitleService{translator: NewTranslator()}
	if err := svc.validateYouTubeSubtitleBlocks(blocks, false); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(outputPath, 0755); err != nil {
		t.Fatal(err)
	}
	var words []VttWord
	if vttPath := os.Getenv("KRILLINAI_TASK792_VTT"); vttPath != "" {
		words, err = svc.ExtractWordsFromVtt(vttPath)
		if err != nil {
			t.Fatal(err)
		}
	}
	source := blocks
	if err := svc.writeOriginLanguageSrtFile(source, filepath.Join(outputPath, "source-before-translation.srt")); err != nil {
		t.Fatal(err)
	}
	writeJSON := func(name string, value any) {
		t.Helper()
		data, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(outputPath, name), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	type exchange struct {
		Prompt   string `json:"prompt"`
		Response string `json:"response"`
		Error    string `json:"error,omitempty"`
	}
	var recent []exchange
	var stateMu sync.Mutex
	calls := 0
	cached := 0
	started := time.Now()
	cachePath := filepath.Join(outputPath, "validated-batches")
	if err := os.MkdirAll(cachePath, 0700); err != nil {
		t.Fatal(err)
	}
	completer := svc.translator.chatCompleter
	svc.translator.chatCompleter = task792ContextCompleter(func(ctx context.Context, prompt string) (string, error) {
		input, parseErr := decodePairedTestInput(prompt)
		if parseErr != nil {
			return "", parseErr
		}
		inputJSON, _ := json.Marshal(input)
		key := sha256.Sum256(append([]byte(pairedTranslationPrompt+pairedTranslationRetry+config.Conf.Llm.Model), inputJSON...))
		cacheFile := filepath.Join(cachePath, fmt.Sprintf("%x.json", key))
		if data, readErr := os.ReadFile(cacheFile); readErr == nil {
			var item exchange
			if json.Unmarshal(data, &item) == nil && item.Error == "" {
				if _, checkErr := svc.translator.parsePairedTranslation(item.Response, input, "en", "zh_cn"); checkErr == nil {
					stateMu.Lock()
					cached++
					stateMu.Unlock()
					return item.Response, nil
				}
			}
		}
		stateMu.Lock()
		calls++
		stateMu.Unlock()
		response, err := chatCompletionWithContext(ctx, completer, prompt)
		item := exchange{Prompt: prompt, Response: response}
		if err != nil {
			item.Error = err.Error()
		}
		if err == nil {
			if _, checkErr := svc.translator.parsePairedTranslation(response, input, "en", "zh_cn"); checkErr == nil {
				data, _ := json.MarshalIndent(item, "", "  ")
				if writeErr := os.WriteFile(cacheFile, data, 0600); writeErr != nil {
					return "", writeErr
				}
			}
		}
		stateMu.Lock()
		defer stateMu.Unlock()
		recent = append(recent, item)
		if len(recent) > 3 {
			recent = recent[1:]
		}
		writeJSON("activity.json", map[string]any{"calls": calls, "cached_batches": cached, "sentence_ids": []string{input.Sentences[0].ID, input.Sentences[len(input.Sentences)-1].ID}, "elapsed_seconds": time.Since(started).Seconds(), "updated_at": time.Now().Format(time.RFC3339)})
		return response, err
	})
	task := &types.SubtitleTask{TaskId: "task-792-full-retest"}
	task.SetProgressReporter(func(progress uint8) {
		stateMu.Lock()
		defer stateMu.Unlock()
		writeJSON("progress.json", map[string]any{"progress": progress, "calls": calls, "cached_batches": cached, "elapsed_seconds": time.Since(started).Seconds(), "updated_at": time.Now().Format(time.RFC3339)})
	})
	task.SetProgress(40)
	blocks, err = svc.translator.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "zh_cn", task, words)
	if err == nil {
		err = svc.validateYouTubeSubtitleBlocks(blocks, true)
	}
	if err != nil {
		writeJSON("failure.json", map[string]any{"error": err.Error(), "calls": calls, "recent_exchanges": recent})
		t.Fatal(err)
	}
	assertPairedOutput(t, source, blocks, subtitleTargetLimit())
	if err := svc.writeOriginLanguageSrtFile(blocks, filepath.Join(outputPath, types.SubtitleTaskOriginLanguageSrtFileName)); err != nil {
		t.Fatal(err)
	}
	if err := svc.writeTargetLanguageSrtFile(blocks, filepath.Join(outputPath, "target_language_srt.srt")); err != nil {
		t.Fatal(err)
	}
	if err := svc.writeBilingualSrtFile(blocks, filepath.Join(outputPath, "bilingual_srt.srt"), true); err != nil {
		t.Fatal(err)
	}
	var sentences []Sentence
	if len(words) > 0 {
		sentences = svc.splitByPrimarySentencePunctuation(words)
	}
	if err := svc.writeShortSubtitleFile(blocks, sentences, filepath.Join(outputPath, types.SubtitleTaskShortOriginMixedSrtFileName), true); err != nil {
		t.Fatal(err)
	}
	writeJSON("summary.json", map[string]any{"success": true, "task_id": 792, "source_cues": len(source), "word_count": len(words), "cue_count": len(blocks), "llm_calls": calls, "cached_batches": cached, "elapsed_seconds": time.Since(started).Seconds(), "completed_at": time.Now().Format(time.RFC3339)})
	task.SetProgress(100)
	t.Logf("任务792全量翻译通过：%d条字幕，%d次调用，产物目录：%s", len(blocks), calls, outputPath)
}

func TestTask792FullTimingOffline(t *testing.T) {
	vttPath := os.Getenv("KRILLINAI_TASK792_VTT")
	if vttPath == "" {
		t.Skip("指定792原始VTT后执行全量离线时间映射检查")
	}
	log.InitLogger()
	svc := &YouTubeSubtitleService{translator: &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		return echoPairedTestResponse(input)
	})}}
	words, err := svc.ExtractWordsFromVtt(vttPath)
	if err != nil {
		t.Fatal(err)
	}
	sentences := svc.splitByPrimarySentencePunctuation(words)
	source, err := svc.generateOriginLanguageSrt(sentences, filepath.Join(t.TempDir(), "source.srt"), &YoutubeSubtitleReq{})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.validateYouTubeSubtitleBlocks(source, false); err != nil {
		t.Fatal(err)
	}
	output, err := svc.translator.BatchTranslateSrtBlocks(context.Background(), source, "en", "zh_cn", nil, words)
	if err != nil {
		t.Fatal(err)
	}
	assertPairedOutput(t, source, output, subtitleTargetLimit())
	spans, err := subtitleWordTimingSpans(words, strings.Join(func() []string {
		var result []string
		for _, block := range source {
			result = append(result, block.OriginLanguageSentence)
		}
		return result
	}(), ""))
	if err != nil {
		t.Fatal(err)
	}
	for i, span := range spans {
		if span.end <= span.start || i > 0 && (span.from != spans[i-1].to || span.start < spans[i-1].end) {
			t.Fatalf("第%d个词区间不连续或时间重叠: %+v", i, span)
		}
	}
	t.Logf("整份离线检查通过：%d个词，%d个原句，%d个有效时间区间，未调用真实模型", len(words), len(source), len(spans))
}
