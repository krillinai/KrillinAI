package service

import (
	"context"
	"errors"
	"krillin-ai/config"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
	"testing"
)

// 覆盖真实导出入口：修订或核验耗尽、排版候选持续无效时，原译及后续句仍可导出。
func TestBatchTranslateSrtBlocksKeepsOriginalAfterReviewAndRepairExhaustion(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.VttBatchSize = 10
	config.Conf.App.MaxSentenceLength = 50
	texts := []string{"We need a large collection of books on different subjects and genres, and different authors about different things.", "I read books."}
	targets := []string{"我们需要大量藏书，涵盖不同主题和体裁，作者和内容各异。", "我读书。"}
	for _, failure := range []string{"revision_invalid", "revision_error", "verification_invalid", "verification_rejected"} {
		t.Run(failure, func(t *testing.T) {
			revisions, splits := 0, 0
			var notices []string
			translator := &Translator{reviseTranslation: true, checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts}, onRecovery: func(message string) { notices = append(notices, message) }}
			translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				switch {
				case strings.HasPrefix(prompt, "任务：translation_content\n"):
					return `{"sentences":[{"sentence_id":"1","target_text":"` + targets[0] + `"},{"sentence_id":"2","target_text":"` + targets[1] + `"}]}`, nil
				case strings.HasPrefix(prompt, "任务：translation_revision\n"):
					revisions++
					if failure == "revision_invalid" {
						return "invalid-json", nil
					}
					if failure == "revision_error" {
						return "", errors.New("修订接口不可用")
					}
					return `{"corrections":[{"sentence_id":"1","reason":"测试核验拒绝","target_text":"我们只需要一本书。"}]}`, nil
				case strings.HasPrefix(prompt, "任务：translation_revision_verify\n"):
					if failure == "verification_invalid" {
						return "invalid-json", nil
					}
					return `{"accepted_ids":[],"reason":"一本书改变了原文的大量藏书。"}`, nil
				case strings.HasPrefix(prompt, "任务：translation_length_split\n"):
					splits++
					return `{"sentences":[]}`, nil
				}
				if response, ok := neutralSemanticTestResponse(prompt); ok {
					return response, nil
				}
				return "", errors.New("排版接口不可用")
			})
			input := []*util.SrtBlock{
				{Index: 1, Timestamp: "00:00:01,000 --> 00:00:11,000", OriginLanguageSentence: texts[0]},
				{Index: 2, Timestamp: "00:00:11,000 --> 00:00:13,000", OriginLanguageSentence: texts[1]},
			}
			output, err := translator.BatchTranslateSrtBlocks(context.Background(), input, "en", "zh_cn", nil)
			if err != nil || len(output) != 2 || revisions != 2 || splits != 3 {
				t.Fatalf("导出未完成：output=%+v revisions=%d splits=%d err=%v", output, revisions, splits, err)
			}
			for i, block := range output {
				if block.OriginLanguageSentence != texts[i] || block.TargetLanguageSentence != targets[i] || block.Timestamp != input[i].Timestamp {
					t.Fatalf("原文、原译或时间被修改：%+v", block)
				}
			}
			if err := (&YouTubeSubtitleService{}).validateYouTubeSubtitleBlocks(output, true); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(strings.Join(notices, "\n"), "已保留原译和原分段") {
				t.Fatal("未记录修正耗尽提示")
			}
		})
	}
}

func TestSubtitleRepairBatchFailureKeepsOriginalsAndContinues(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxSourceChars: 50, MaxTargetChars: 50}
	parents := make(map[string]pairedSentence)
	for i, text := range []string{strings.Repeat("Long phrase ", 10), strings.Repeat("Another phrase ", 10), "A short sentence."} {
		id := string(rune('1' + i))
		text = strings.TrimSpace(text)
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: text})
		parents[id] = pairedSentence{ID: id, FullSource: text, FullTarget: "原来的译文。", Source: []string{text}, Target: []string{"原来的译文。"}}
	}
	batchCalls, singleCalls, completed := 0, 0, 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_split_batch\n") {
			batchCalls++
		} else if strings.HasPrefix(prompt, "任务：translation_length_split\n") {
			singleCalls++
		} else {
			t.Fatalf("未预期的修正请求：%s", prompt[:min(len(prompt), 80)])
		}
		return "", errors.New("修正服务不可用")
	})}
	err := translator.splitLongPairedSubtitles(context.Background(), input, parents, "en", "zh_cn", func(sentence pairedSentence, complete bool) error {
		if complete {
			completed++
			if sentence.FullTarget != "原来的译文。" || !slices.Equal(sentence.Source, []string{sentence.FullSource}) || !slices.Equal(sentence.Target, []string{sentence.FullTarget}) {
				t.Fatalf("原分段被修改：%+v", sentence)
			}
		}
		return nil
	})
	if err != nil || completed != 3 || batchCalls != 1 || singleCalls != 2 {
		t.Fatalf("completed=%d batch=%d single=%d err=%v", completed, batchCalls, singleCalls, err)
	}
}

func TestSubtitleRepairFallbackStillPropagatesCancellationAndSaveErrors(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: strings.TrimSpace(strings.Repeat("Long phrase ", 10)), FullTarget: "原来的译文。", Target: []string{"原来的译文。"}}
	original.Source = []string{original.FullSource}
	for _, failure := range []string{"already_canceled", "canceled_at_notice", "save_error"} {
		t.Run(failure, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			writeErr := errors.New("检查点写盘失败")
			wantErr := error(context.Canceled)
			translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) { return "", errors.New("修正服务不可用") })}
			if failure == "already_canceled" {
				cancel()
			} else if failure == "canceled_at_notice" {
				translator.onRecovery = func(string) { cancel() }
			} else {
				wantErr = writeErr
			}
			err := translator.splitLongPairedSubtitles(ctx, lengthSplitTestInput(original, 50), map[string]pairedSentence{"1": original}, "en", "zh_cn", func(_ pairedSentence, complete bool) error {
				if complete {
					if failure != "save_error" {
						t.Fatal("取消后仍然提交字幕")
					}
					return writeErr
				}
				return nil
			})
			if !errors.Is(err, wantErr) {
				t.Fatalf("err=%v want=%v", err, wantErr)
			}
		})
	}
}

func TestRevisionStillPropagatesCancellationAndSaveErrors(t *testing.T) {
	input := pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: "I read books."}}}
	for _, cancelRequest := range []bool{false, true} {
		ctx, cancel := context.WithCancel(context.Background())
		translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
			if cancelRequest {
				cancel()
			}
			return `{"corrections":[]}`, nil
		})}
		writeErr := errors.New("检查点写盘失败")
		accepted := map[string]pairedSentence{"1": {ID: "1", FullSource: input.Sentences[0].Text, FullTarget: "我读书。"}}
		err := translator.reviseContentBatch(ctx, input, accepted, "en", "zh_cn", func(pairedSentence, bool) error { return writeErr })
		cancel()
		wantErr := writeErr
		if cancelRequest {
			wantErr = context.Canceled
		}
		if !errors.Is(err, wantErr) {
			t.Fatalf("err=%v want=%v", err, wantErr)
		}
	}
}
