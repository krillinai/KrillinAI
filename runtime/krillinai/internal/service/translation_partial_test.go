package service

import (
	"context"
	"errors"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
	"testing"
	"time"

	"golang.org/x/sync/errgroup"
)

func TestPartialTranslationMarksUnreviewedUnchangedTextAndClearsOnRetry(t *testing.T) {
	log.InitLogger()
	texts := []string{"I read books.", "We meet today."}
	task := &types.SubtitleTask{}
	tr := newTranslator(semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			return `{"sentences":[{"sentence_id":"1","target_text":"I read books."},{"sentence_id":"2","target_text":"我们今天见面。"}]}`, nil
		}
		return "", errors.New("审校接口不可用")
	})).withTranslationRecovery(t.TempDir(), task)
	tr.preparedTranslation = &preparedTranslationContext{Texts: texts}
	blocks := []*util.SrtBlock{
		{Index: 1, Timestamp: "00:00:01,000 --> 00:00:03,000", OriginLanguageSentence: texts[0]},
		{Index: 2, Timestamp: "00:00:03,000 --> 00:00:05,000", OriginLanguageSentence: texts[1]},
	}
	result, err := tr.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "zh_cn", task)
	if err != nil || len(result) != 2 || result[0].TargetLanguageSentence != texts[0] || result[1].TargetLanguageSentence != "我们今天见面。" {
		t.Fatalf("未保留原文、正常译文和时间：%+v %v", result, err)
	}
	for i := range result {
		if result[i].Timestamp != blocks[i].Timestamp {
			t.Fatal("回退修改了时间轴")
		}
	}
	failed := task.TranslationFailures()
	if len(failed) != 1 || failed[0].SentenceID != "1" || failed[0].Reason == "" || len(types.TranslationWarnings(failed)) != 1 {
		t.Fatalf("未暴露失败状态：%+v", failed)
	}
	contentCalls := 0
	tr.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			contentCalls++
			input, err := decodePairedTestInput(prompt)
			if err != nil || len(input.Sentences) != 1 || input.Sentences[0].ID != "1" {
				t.Fatal("重译了其他成功句")
			}
			return `{"sentences":[{"sentence_id":"1","target_text":"我读书。"}]}`, nil
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		return "", errors.New("不应调用额外模型")
	})
	result, err = tr.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "zh_cn", task)
	if err != nil || contentCalls != 1 || len(result) != 2 || result[0].TargetLanguageSentence != "我读书。" || len(task.TranslationFailures()) != 0 {
		t.Fatalf("修复后未清除回退状态：%+v failures=%+v err=%v", result, task.TranslationFailures(), err)
	}
}

func TestPartialTranslationAllFailedStillFails(t *testing.T) {
	for _, response := range []string{`{"sentences":[]}`, `{"sentences":[{"sentence_id":"1","target_text":"I read books."}]}`} {
		t.Run(response, func(t *testing.T) {
			task := &types.SubtitleTask{}
			tr := newTranslator(semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				if strings.HasPrefix(prompt, "任务：translation_content\n") {
					return response, nil
				}
				return "", errors.New("翻译或审校接口不可用")
			})).withTranslationRecovery(t.TempDir(), task)
			tr.preparedTranslation = &preparedTranslationContext{Texts: []string{"I read books."}}
			result, err := tr.translatePairedSentences(context.Background(), nil, "en", "zh_cn", 65, 10, nil)
			if err == nil || result != nil || !strings.Contains(err.Error(), "全部1条") || len(task.TranslationFailures()) != 1 {
				t.Fatalf("全部失败误报成功：%+v %v", result, err)
			}
		})
	}
}

func TestPartialTranslationDoesNotHideCancellationOrSaveErrors(t *testing.T) {
	for _, failure := range []string{"cancel", "save"} {
		t.Run(failure, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			writeErr := errors.New("检查点写盘失败")
			tr := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
				if failure == "cancel" {
					cancel()
				}
				return "", errors.New("模型断连")
			})}
			_, err := tr.translateSemanticBatch(ctx, pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: "Hello."}}}, nil, "en", "zh_cn", func(pairedSentence, bool) error { return writeErr })
			want := writeErr
			if failure == "cancel" {
				want = context.Canceled
			}
			if !errors.Is(err, want) {
				t.Fatalf("真实错误被回退吞掉：%v", err)
			}
		})
	}
}

func TestPartialTranslationSingleRequestFailureDoesNotAbortLaterBatches(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 1
	tr := &Translator{preparedTranslation: &preparedTranslationContext{Texts: []string{"First.", "Second.", "Third."}}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if input.Sentences[0].ID == "2" {
			return "", errors.New("第二句请求失败")
		}
		return echoPairedTestResponse(input)
	})}
	result, err := tr.translatePairedSentences(context.Background(), nil, "en", "zh_cn", 65, 1, nil)
	if err != nil || len(result) != 3 || result[0].TranslationFallbackReason != "" || result[1].TranslationFallbackReason == "" || result[2].TranslationFallbackReason != "" {
		t.Fatalf("失败句影响了其他批次：%+v %v", result, err)
	}
}

func TestPartialAudioTranslationAggregatesSegmentsAndRetriesFailedContent(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateMaxAttempts = 1
	for _, scenario := range []string{"first_failed", "last_failed", "all_failed", "repeated_failed", "failed_and_hesitation"} {
		t.Run(scenario, func(t *testing.T) {
			texts := []string{"We meet today.", "I read books."}
			if scenario == "last_failed" {
				texts[0], texts[1] = texts[1], texts[0]
			} else if scenario == "failed_and_hesitation" {
				texts[1] = "Um."
			} else if scenario == "repeated_failed" {
				texts[1] = texts[0]
			}
			repaired := false
			calls := map[string]int{}
			svc := Service{ChatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				if response, ok := neutralSemanticTestResponse(prompt); ok {
					return response, nil
				}
				input, err := decodePairedTestInput(prompt)
				if err != nil || len(input.Sentences) != 1 {
					return "", errors.New("无效翻译请求")
				}
				source := input.Sentences[0]
				calls[source.Text]++
				if !repaired && (source.Text == "We meet today." || scenario == "all_failed") {
					return "", errors.New("模拟单个音频片段翻译失败")
				}
				target := "我读书。"
				if source.Text == "We meet today." {
					target = "我们今天见面。"
				}
				data, err := encodePairedTestResponse([]pairedSentence{{ID: source.ID, FullTarget: target, Source: []string{source.Text}, Target: []string{target}}})
				return string(data), err
			})}
			step := &types.SubtitleTaskStepParam{TaskBasePath: t.TempDir(), TaskPtr: &types.SubtitleTask{}, OriginLanguage: "en", TargetLanguage: "zh_cn"}
			run := func() (map[int][]*TranslatedItem, error) {
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				group, ctx := errgroup.WithContext(ctx)
				pending := make(chan DataWithId[string], len(texts))
				for i, text := range texts {
					pending <- DataWithId[string]{Id: i, Data: text}
				}
				close(pending)
				output := make(chan DataWithId[[]*TranslatedItem], len(texts))
				progress := make(chan DataWithId[TranslationProgress], 20)
				svc.startTranslateWorker(ctx, group, step, pending, progress, output, len(texts))
				err := group.Wait()
				close(output)
				result := map[int][]*TranslatedItem{}
				for item := range output {
					result[item.Id] = item.Data
				}
				return result, err
			}
			result, err := run()
			if scenario == "all_failed" || scenario == "repeated_failed" || scenario == "failed_and_hesitation" {
				var allFailed *allTranslationFailedError
				want := 2
				if scenario == "failed_and_hesitation" {
					want = 1
				}
				if !errors.As(err, &allFailed) || allFailed.count != want || len(step.TaskPtr.TranslationFailures()) != want {
					t.Fatalf("未按整片正文判断全失败：result=%+v failures=%+v err=%v", result, step.TaskPtr.TranslationFailures(), err)
				}
				return
			}
			if err != nil || len(result) != 2 || len(step.TaskPtr.TranslationFailures()) != 1 {
				t.Fatalf("单个音频片段失败中止了整片：%+v %v", result, err)
			}
			for id, items := range result {
				if len(items) != 1 || items[0].OriginText != texts[id] || texts[id] == "We meet today." && items[0].TranslatedText != texts[id] {
					t.Fatalf("未保留失败片段原文：%+v", result)
				}
			}
			repaired = true
			// 模拟新进程续跑，从磁盘恢复成功句与失败句状态。
			step.TaskPtr = &types.SubtitleTask{}
			result, err = run()
			if err != nil || len(result) != 2 || len(step.TaskPtr.TranslationFailures()) != 0 || calls["I read books."] != 1 || calls["We meet today."] != 2 {
				t.Fatalf("音频续跑未仅重试失败句：%+v calls=%v err=%v", result, calls, err)
			}
		})
	}
}

func TestPartialLayoutKeepsEarlierVerifiedImprovementAfterLaterFailure(t *testing.T) {
	best := lengthOverflowFixture()
	second := strings.TrimSpace(strings.Repeat("We read books every day. ", 5))
	original := pairedSentence{ID: "1", FullSource: best.FullSource + " " + second, FullTarget: best.FullTarget + "我们每天读书。", Source: []string{best.FullSource, second}, Target: []string{best.FullTarget, "我们每天读书。"}, SemanticReviewed: true}
	verified := 0
	tr := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n") {
			verified++
			return `{"acceptable":true,"reason":"完整且逐段对应"}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_length_split\n") {
			input, err := decodePairedTestInput(prompt)
			if err == nil && input.Sentences[0].Text == best.FullSource {
				candidate := best
				candidate.ID = "1"
				data, err := encodePairedTestResponse([]pairedSentence{candidate})
				return string(data), err
			}
		}
		return "", errors.New("后续片段及父句修复接口不可用")
	})}
	parents := map[string]pairedSentence{"1": original}
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: original.FullSource}}}
	err := tr.splitLongPairedSubtitles(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	got := parents["1"]
	if err != nil || verified == 0 || len(got.Source) != len(best.Source)+1 || !slices.Equal(got.Source[:len(best.Source)], best.Source) || got.Source[len(best.Source)] != second || got.FullTarget != original.FullTarget || !got.LayoutFallback {
		t.Fatalf("已核验局部改进被丢弃：%+v reviewed=%d err=%v", got, verified, err)
	}
}
