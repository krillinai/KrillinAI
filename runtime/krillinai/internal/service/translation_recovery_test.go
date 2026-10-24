package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	openaiapi "github.com/sashabaranov/go-openai"
)

func TestTranslationPersistentRequestErrorsStopAfterThreeAttempts(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateMaxAttempts = 9 // 配置过大也不能绕过上限。
	for _, status := range []int{http.StatusTooManyRequests, http.StatusInternalServerError} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			calls := 0
			translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
				calls++
				return "", &openaiapi.APIError{HTTPStatusCode: status, Message: "provider unavailable"}
			})}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_, err := translator.translatePairedSentences(ctx, []string{"Hello."}, "en", "zh_cn", 50, 1, nil)
			if calls != 3 || err == nil || !strings.Contains(err.Error(), "全部1条正文字幕翻译失败") || !strings.Contains(err.Error(), "已用尽3次请求") {
				t.Fatalf("接口故障未在三次后退出: calls=%d err=%v", calls, err)
			}
		})
	}
}

func TestTranslationRepairsSubjectBoundaryLocally(t *testing.T) {
	source := "This is a long beginning that remains separate. And it is useful."
	// 单独输入完整文本会按句号分成两句；以逗号连接以检验同一句中的局部边界。
	source = strings.Replace(source, "separate.", "separate,", 1)
	target := "这是一段需要单独保留的比较长的介绍内容，另外，它很有用。"
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target,
			Source: []string{"This is a long beginning that remains separate,", "And it", "is useful."},
			Target: []string{"这是一段需要单独保留的比较长的介绍内容，", "另外，", "它很有用。"}}})
		return string(data), err
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{source}, "en", "zh_cn", 50, 1, nil)
	if err != nil || calls != 1 || len(result) != 1 || len(result[0].Source) != 2 || result[0].Source[1] != "And it is useful." || !subtitleSegmentsPreserveText(target, result[0].Target) {
		t.Fatalf("本地边界修复失败: calls=%d result=%+v err=%v", calls, result, err)
	}
}

func TestTranslationKeepsOriginalAndCheckpointWhenOverlongLayoutDisconnects(t *testing.T) {
	target := strings.Repeat("有效译文", 15)
	calls := 0
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		if calls > 1 {
			return "", errors.New("LLM disconnected")
		}
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target, Source: []string{"Hello."}, Target: []string{target}}})
		return string(data), err
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{"Hello."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || calls != 3 || len(result) != 1 || result[0].FullTarget != target || len(result[0].Source) != 1 || result[0].Source[0] != "Hello." || len(result[0].Target) != 1 || result[0].Target[0] != target || !result[0].LayoutFallback {
		t.Fatalf("未保留原有完整字幕: calls=%d result=%+v err=%v", calls, result, err)
	}
	files, _ := filepath.Glob(filepath.Join(translator.checkpointDir, "translation-checkpoints", "*", "*.json"))
	if len(files) != 1 {
		t.Fatalf("已有完整译文没有保存: %v", files)
	}
	data, _ := os.ReadFile(files[0])
	var saved pairedSentence
	if json.Unmarshal(data, &saved) != nil || saved.FullTarget != target || !saved.LayoutFallback {
		t.Fatalf("连接故障丢失完整译文: %+v", saved)
	}
}

func TestTranslationReducesConcurrencyAfterRateLimit(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 3
	config.Conf.App.TranslateMaxAttempts = 2
	var mu sync.Mutex
	limited, activeLater, peakLater := false, 0, 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		id := input.Sentences[0].ID
		mu.Lock()
		if id == "1" && !limited {
			limited = true
			mu.Unlock()
			return "", &openaiapi.APIError{HTTPStatusCode: 429}
		}
		if id >= "4" {
			activeLater++
			peakLater = max(peakLater, activeLater)
		}
		mu.Unlock()
		if id >= "4" {
			time.Sleep(time.Millisecond)
			mu.Lock()
			activeLater--
			mu.Unlock()
		}
		return echoPairedTestResponse(input)
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{"One.", "Two.", "Three.", "Four.", "Five.", "Six."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || len(result) != 6 || !limited || peakLater != 1 {
		t.Fatalf("限流后未串行恢复: peak=%d result=%+v err=%v", peakLater, result, err)
	}
}

func TestShortSubtitleFallsBackWhenGraphemeOrTimingCannotBeSplit(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	for _, length := range []int{1, 2} {
		config.Conf.App.MaxSentenceLength = length
		text := "你好。"
		blocks := []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:00,001", OriginLanguageSentence: text}}
		spans, _, err := subtitleBlockTimingSpans(blocks)
		if err != nil {
			t.Fatal(err)
		}
		short, err := splitShortSubtitleBlocks(blocks, spans, length, 0)
		if err != nil || len(short[1]) != 1 || short[1][0].OriginLanguageSentence != text || short[1][0].Timestamp != blocks[0].Timestamp {
			t.Fatalf("无法拆分时未保留完整字幕: %+v err=%v", short, err)
		}
	}
}

func TestTranslationRepairsConfiguredOverflowAndKeepsValidTarget(t *testing.T) {
	for _, length := range []int{50, 51, 55, 56} {
		t.Run(fmt.Sprint(length), func(t *testing.T) {
			calls := 0
			target := "译" + strings.Repeat("a", length-2)
			translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
				calls++
				_, err := decodePairedTestInput(prompt)
				if err != nil {
					return "", err
				}
				var request subtitleLengthSplitInput
				_ = semanticTestPayload(prompt, &request)
				if calls > 1 && request.OriginalTarget != target {
					t.Fatal("修复排版时没有冻结已完成的译文")
				}
				data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target, Source: []string{"Hello."}, Target: []string{target}}})
				return string(data), err
			})}
			result, err := translator.translatePairedSentences(context.Background(), []string{"Hello."}, "en", "zh_cn", 50, 1, nil)
			wantCalls := 1
			if length > 50 {
				wantCalls = 4 // 一次初译，三轮有限拆分，失败保留原译。
			}
			if err != nil || calls != wantCalls || len(result) != 1 || result[0].FullTarget != target || result[0].Target[0] != target || result[0].LayoutFallback != (length > 50) {
				t.Fatalf("calls=%d result=%+v error=%v", calls, result, err)
			}
		})
	}
}

func TestTranslationRepairsOnlyFailedSentences(t *testing.T) {
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if calls == 2 && (len(input.Sentences) != 1 || input.Sentences[0].ID != "2") {
			t.Fatalf("正确句子被重复提交: %+v", input.Sentences)
		}
		var sentences []pairedSentence
		for _, source := range input.Sentences {
			target := "有效译文" + source.ID
			if calls == 1 && source.ID == "2" {
				target = "" // 未取得译文，只重试当前缺失句。
			}
			sentences = append(sentences, pairedSentence{ID: source.ID, FullTarget: target, Source: []string{source.Text}, Target: []string{target}})
		}
		data, err := encodePairedTestResponse(sentences)
		return string(data), err
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{"First.", "Second.", "Third."}, "en", "zh_cn", 50, 3, nil)
	if err != nil || calls != 2 || len(result) != 3 || result[0].FullTarget != "有效译文1" || result[2].FullTarget != "有效译文3" {
		t.Fatalf("calls=%d result=%+v error=%v", calls, result, err)
	}
}

func TestTranslationRestoresFullSentenceWithoutDroppingContent(t *testing.T) {
	source := "We work hard, because we care."
	target := "我们努力工作，因为我们在乎。"
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		// 译文完整，但配对同时遗漏了两侧内容；不能接受错误片段。
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target, Source: []string{"We work hard,"}, Target: []string{"我们努力工作，"}}})
		return string(data), err
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{source}, "en", "zh_cn", 50, 1, nil)
	if err != nil || calls != 1 || len(result) != 1 || result[0].LayoutFallback || fmt.Sprint(result[0].Source) != "["+source+"]" || fmt.Sprint(result[0].Target) != "["+target+"]" {
		t.Fatalf("calls=%d result=%+v error=%v", calls, result, err)
	}
}

func TestTranslationRetainsValidTargetWhenLayoutRepairRewritesIt(t *testing.T) {
	target := strings.Repeat("完整", 18)
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
			return `{"equivalent":false,"reason":"删减后的译文丢失原始含义"}`, nil
		}
		calls++
		text := target
		if calls > 1 {
			text = "删减后的译文。"
		}
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: text, Source: []string{"Original."}, Target: []string{text}}})
		return string(data), err
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{"Original."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || calls != 6 || result[0].FullTarget != target {
		t.Fatalf("排版纠错改写了译文: %+v calls=%d err=%v", result, calls, err)
	}
}

func TestTranslationUsesPlainSentenceAfterStructuredAttempts(t *testing.T) {
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		if calls < 3 {
			return "not-json", nil
		}
		if !strings.Contains(prompt, "不拆分、不配对") {
			t.Fatal("最后一次尝试没有切换请求策略")
		}
		return `{"sentence_id":"1","target_text":"这是完整的译文。"}`, nil
	})}
	result, err := translator.translatePairedSentences(context.Background(), []string{"This is a complete translation."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || calls != 3 || len(result) != 1 || result[0].Target[0] != "这是完整的译文。" {
		t.Fatalf("calls=%d result=%+v err=%v", calls, result, err)
	}
}

func TestTranslationExhaustionStopsAfterThreeAttemptsAndKeepsOtherSentences(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 1
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	calls := make(map[string]int)
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		id := input.Sentences[0].ID
		calls[id]++
		if id == "1" {
			return "not-json", nil
		}
		return echoPairedTestResponse(input)
	})}
	result, err := translator.translatePairedSentences(ctx, []string{"First.", "Second."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || len(result) != 2 || result[0].FullTarget != "First." || result[0].TranslationFallbackReason == "" || calls["1"] != 3 || calls["2"] != 1 {
		t.Fatalf("calls=%v result=%+v err=%v", calls, result, err)
	}
	files, _ := filepath.Glob(filepath.Join(translator.checkpointDir, "translation-checkpoints", "*", "2.json"))
	if len(files) != 1 {
		t.Fatalf("其他句子的翻译成果没有保存: %v", files)
	}
}

func TestTranslationInvalidContentWaitHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		if calls == 3 {
			cancel()
		}
		return `{"sentence_id":"1","target_text":"Original."}`, nil
	})}
	result, err := translator.translatePairedSentences(ctx, []string{"Original."}, "en", "zh_cn", 50, 1, nil)
	if !errors.Is(err, context.Canceled) || result != nil || calls != 3 {
		t.Fatalf("无效译文被当成成功或等待不可取消: calls=%d result=%v err=%v", calls, result, err)
	}
}

func TestTranslationCheckpointSurvivesDisconnectDuringLayoutRepair(t *testing.T) {
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	target := strings.Repeat("完整译文", 9)
	calls := 0
	translator := &Translator{checkpointDir: dir, chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		if calls > 1 {
			cancel()
			return "", errors.New("LLM disconnected")
		}
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target, Source: []string{"Hello."}, Target: []string{target}}})
		return string(data), err
	})}
	if _, err := translator.translatePairedSentences(ctx, []string{"Hello."}, "en", "zh_cn", 50, 1, nil); err == nil {
		t.Fatal("没有报告真实连接故障")
	}
	layoutCalls := 0
	translator.chatCompleter = translationCompleterFunc(func(prompt string) (string, error) {
		layoutCalls++
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		var request subtitleLengthSplitInput
		_ = semanticTestPayload(prompt, &request)
		if input.Sentences[0].TargetText != target && request.OriginalTarget != target {
			t.Fatal("恢复时没有锁定已有的完整译文")
		}
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target, Source: []string{"Hello."}, Target: []string{target}}})
		return string(data), err
	})
	result, err := translator.translatePairedSentences(context.Background(), []string{"Hello."}, "en", "zh_cn", 20, 3, nil)
	if err != nil || len(result) != 1 || result[0].FullTarget != target || calls != 2 || layoutCalls != 5 {
		t.Fatalf("result=%+v calls=%d err=%v", result, calls, err)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "translation-checkpoints", "*", "*.json"))
	if len(files) != 1 {
		t.Fatalf("检查点未按句保存: %v", files)
	}
}

func TestTranslationCheckpointSavesOtherConcurrentSuccesses(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 2
	dir := t.TempDir()
	saved := make(chan struct{})
	var once sync.Once
	translator := &Translator{checkpointDir: dir, chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if input.Sentences[0].ID == "1" {
			<-saved
			return "", errors.New("LLM disconnected")
		}
		return echoPairedTestResponse(input)
	})}
	partial, err := translator.translatePairedSentences(context.Background(), []string{"First.", "Second."}, "en", "zh_cn", 50, 1, nil, func(completed, total int) {
		if completed == 1 {
			once.Do(func() { close(saved) })
		}
	})
	if err != nil || len(partial) != 2 || !strings.Contains(partial[0].TranslationFallbackReason, "LLM disconnected") {
		t.Fatalf("单句连接故障未保留回退原因：%+v %v", partial, err)
	}
	var requested []string
	translator.chatCompleter = translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		requested = append(requested, input.Sentences[0].ID)
		return echoPairedTestResponse(input)
	})
	result, err := translator.translatePairedSentences(context.Background(), []string{"First.", "Second."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || len(result) != 2 || fmt.Sprint(requested) != "[1]" {
		t.Fatalf("恢复重译了成功句: requested=%v result=%+v err=%v", requested, result, err)
	}
}

func TestTranslationCheckpointDoesNotReuseDifferentContentOrLanguage(t *testing.T) {
	calls := 0
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		return echoPairedTestResponse(input)
	})}
	for _, source := range []string{"First.", "Changed."} {
		for _, language := range []types.StandardLanguageCode{"zh_cn", "zh_tw"} {
			if _, err := translator.translatePairedSentences(context.Background(), []string{source}, "en", language, 50, 1, nil); err != nil {
				t.Fatal(err)
			}
		}
	}
	if calls != 4 {
		t.Fatalf("错误复用了其他内容或语言的检查点: %d", calls)
	}
}

func TestTranslationCheckpointIgnoresCorruptSentenceOnly(t *testing.T) {
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		return echoPairedTestResponse(input)
	})}
	texts := []string{"First.", "Second."}
	if _, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 50, 2, nil); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(translator.checkpointDir, "translation-checkpoints", "*", "1.json"))
	if len(files) != 1 {
		t.Fatal(files)
	}
	if err := os.WriteFile(files[0], []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	translator.chatCompleter = translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if len(input.Sentences) != 1 || input.Sentences[0].ID != "1" {
			t.Fatal("损坏单句影响了其他已保存句子")
		}
		return echoPairedTestResponse(input)
	})
	if _, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 50, 2, nil); err != nil {
		t.Fatal(err)
	}
}

func TestTranslationFallsBackToCueTimingWithoutRetranslation(t *testing.T) {
	completer := &scriptedCompleter{responses: []string{`{"sentences":[{"sentence_id":"1","target_text":"你好。","segments":[{"source":"Hello.","target":"你好。"}]}]}`}}
	translator := &Translator{chatCompleter: completer}
	blocks, err := translator.BatchTranslateSrtBlocks(context.Background(), []*util.SrtBlock{{Index: 1, Timestamp: "00:00:01,000 --> 00:00:03,000", OriginLanguageSentence: "Hello."}}, "en", "zh_cn", nil, []VttWord{{Text: "Mismatch", Start: "invalid", End: "invalid"}})
	if err != nil || completer.calls != 1 || len(blocks) != 1 || blocks[0].Timestamp != "00:00:01,000 --> 00:00:03,000" {
		t.Fatalf("blocks=%+v err=%v calls=%d", blocks, err, completer.calls)
	}
}

func TestTranslationCheckpointRejectsInvalidCachedTarget(t *testing.T) {
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		return echoPairedTestResponse(input)
	})}
	checkpoint, err := translator.openTranslationCheckpoint([]string{"Original."}, "en", "zh_cn")
	if err != nil {
		t.Fatal(err)
	}
	if err := checkpoint.save(pairedSentence{ID: "1", FullTarget: "", Source: []string{"Original."}, Target: []string{""}}); err != nil {
		t.Fatal(err)
	}
	result, err := translator.translatePairedSentences(context.Background(), []string{"Original."}, "en", "zh_cn", 50, 1, nil)
	if err != nil || len(result) != 1 || result[0].FullTarget == "" {
		data, _ := json.Marshal(result)
		t.Fatalf("无效检查点被当作成功: %s err=%v", data, err)
	}
}
