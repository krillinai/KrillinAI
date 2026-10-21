package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
	"testing"
)

// 任务860第15句：原文334单位，合理意群拆分后最长一条81单位。
func lengthOverflowFixture() pairedSentence {
	source := []string{
		"And so, with Frank Rosenblatt back in the 1950s, this whole idea of a perceptron,",
		"when you understand the history behind it, sort of what he was trying to solve,",
		"a lot of the modern terms of, you know, artificial neural networks",
		"and regression models and weighted functions and so on and so forth,",
		"all that stuff becomes really clear.",
	}
	target := []string{
		"所以，回到20世纪50年代弗兰克·罗森布拉特提出感知机的历史，",
		"了解它的背景，以及他当时想解决的问题后，",
		"很多现代术语，比如人工神经网络，",
		"以及回归模型、加权函数等等，",
		"就都变得清楚了。",
	}
	return pairedSentence{ID: "15", FullSource: strings.Join(source, " "), FullTarget: strings.Join(target, ""),
		Source: source, Target: target, SemanticReviewed: true}
}

func TestLengthRepairKeepsBestVerifiedOverflowCandidate(t *testing.T) {
	for _, later := range []string{"worse", "invalid", "request_error", "rejected", "compliant", "canceled"} {
		t.Run(later, func(t *testing.T) {
			candidate := lengthOverflowFixture()
			if subtitleTargetLength(candidate.FullSource) != 334 || subtitleTargetLength(candidate.Source[0]) != 81 {
				t.Fatal("真实超长样例发生变化")
			}
			original := candidate
			original.Source, original.Target = []string{candidate.FullSource}, []string{candidate.FullTarget}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			splits, reviews := 0, 0
			translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				if strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n") {
					reviews++
					return fmt.Sprintf(`{"acceptable":%t,"reason":"逐段核对当前切口与对应内容"}`, later != "rejected" || splits == 1), nil
				}
				splits++
				item := candidate
				if splits > 1 {
					switch later {
					case "compliant":
						item.Source = append([]string{"And so, with Frank Rosenblatt back in the 1950s,", "this whole idea of a perceptron,", "when you understand the history behind it,", "sort of what he was trying to solve,"}, candidate.Source[2:]...)
						item.Target = append([]string{"所以，回到20世纪50年代弗兰克·罗森布拉特", "提出感知机的历史，", "了解它的背景，", "以及他当时想解决的问题后，"}, candidate.Target[2:]...)
					case "invalid":
						return `{"sentences":[]}`, nil
					case "request_error":
						return "", errors.New("后续请求中断")
					case "canceled":
						cancel()
						return "", context.Canceled
					default:
						item.Source = append([]string{strings.Join(candidate.Source[:2], " ")}, candidate.Source[2:]...)
						item.Target = append([]string{strings.Join(candidate.Target[:2], "")}, candidate.Target[2:]...)
					}
				}
				data, err := encodePairedTestResponse([]pairedSentence{item})
				return string(data), err
			})}
			got, err := translator.repairLongPairedSubtitle(ctx, lengthSplitTestInput(original, 65), original,
				pairedTranslationSource{ID: "15", Text: original.FullSource, TargetText: original.FullTarget}, "en", "zh_cn")
			if later == "canceled" {
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("取消被候选兜底吞掉: %v", err)
				}
				return
			}
			if later == "compliant" {
				if err != nil || splits != 2 || reviews != 2 || pairedFinalLengthIssue(got) != nil || len(got.Source) != 7 || got.LayoutFallback {
					t.Fatalf("后续更优且达标的分段未被采用: %+v splits=%d reviews=%d err=%v", got, splits, reviews, err)
				}
				return
			}
			wantSplits := 3
			if later == "request_error" {
				wantSplits = 2
			}
			if err != nil || splits != wantSplits || reviews < 1 || !slices.Equal(got.Source, candidate.Source) || !slices.Equal(got.Target, candidate.Target) || !got.LayoutFallback || !got.LayoutReviewed || got.FullTarget != original.FullTarget {
				t.Fatalf("未保留最短已核验分段: got=%+v splits=%d reviews=%d err=%v", got, splits, reviews, err)
			}
		})
	}
}

func TestOverflowAllowanceStillRejectsMissingTextAndBrokenMeaning(t *testing.T) {
	candidate := lengthOverflowFixture()
	original := candidate
	original.Source, original.Target = []string{candidate.FullSource}, []string{candidate.FullTarget}
	for _, failure := range []string{"missing_source", "missing_target", "boundary_rejected", "rewrite_rejected"} {
		t.Run(failure, func(t *testing.T) {
			splits := 0
			translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				if strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n") {
					return `{"acceptable":false,"reason":"原译内容跨段错位"}`, nil
				}
				if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
					return `{"equivalent":false,"reason":"候选改变了原文事实"}`, nil
				}
				splits++
				item := candidate
				item.Source, item.Target = slices.Clone(candidate.Source), slices.Clone(candidate.Target)
				switch failure {
				case "missing_source":
					item.Source[0] = "And so,"
				case "missing_target":
					item.Target[0] = "所以，"
				case "rewrite_rejected":
					item.Target[0] = "这是一个与历史无关的新概念，"
				}
				data, err := encodePairedTestResponse([]pairedSentence{item})
				return string(data), err
			})}
			_, err := translator.repairLongPairedSubtitle(context.Background(), lengthSplitTestInput(original, 65), original,
				pairedTranslationSource{ID: "15", Text: original.FullSource, TargetText: original.FullTarget}, "en", "zh_cn")
			if !errors.Is(err, errFinalLayoutExhausted) || splits != 3 {
				t.Fatalf("内容或意群未通过仍保留候选: splits=%d err=%v", splits, err)
			}
		})
	}
}

func TestBatchLengthRepairRetainsEarlierVerifiedOverflow(t *testing.T) {
	candidate := lengthOverflowFixture()
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 65}
	parents := make(map[string]pairedSentence)
	for _, id := range []string{"1", "2"} {
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: candidate.FullSource})
		parent := candidate
		parent.ID, parent.Source, parent.Target = id, []string{candidate.FullSource}, []string{candidate.FullTarget}
		parents[id] = parent
	}
	splits := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_batch_review\n") {
			return `{"reviews":[{"sentence_id":"1_0","equivalent":true,"acceptable":true,"reason":"完整且逐段对应"},{"sentence_id":"2_0","equivalent":true,"acceptable":true,"reason":"完整且逐段对应"}]}`, nil
		}
		splits++
		if splits > 1 {
			return `{"sentences":[]}`, nil
		}
		var output []pairedSentence
		for _, id := range []string{"1_0", "2_0"} {
			item := candidate
			item.ID = id
			output = append(output, item)
		}
		data, err := encodePairedTestResponse(output)
		return string(data), err
	})}
	if err := translator.batchLongPairedSubtitles(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	for _, parent := range parents {
		if splits != 3 || !slices.Equal(parent.Source, candidate.Source) || !parent.LayoutFallback {
			t.Fatalf("批量重试丢失了已核验短分段: %+v splits=%d", parent, splits)
		}
	}
}

func TestExportRetainsOverflowSegmentsAndDistributesTimes(t *testing.T) {
	candidate := lengthOverflowFixture()
	texts := []string{candidate.FullSource, "I read books."}
	splits := 0
	translator := &Translator{preparedTranslation: &preparedTranslationContext{Texts: texts}}
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			data, err := json.Marshal(map[string]any{"sentences": []map[string]string{
				{"sentence_id": "1", "target_text": candidate.FullTarget}, {"sentence_id": "2", "target_text": "我读书。"},
			}})
			return string(data), err
		}
		if strings.HasPrefix(prompt, "任务：translation_length_split\n") {
			splits++
			item := candidate
			item.ID = "1"
			data, err := encodePairedTestResponse([]pairedSentence{item})
			return string(data), err
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		return "", errors.New("其他排版请求不可用")
	})
	input := []*util.SrtBlock{
		{Index: 1, Timestamp: "00:01:58,840 --> 00:02:13,520", OriginLanguageSentence: texts[0]},
		{Index: 2, Timestamp: "00:02:13,520 --> 00:02:15,520", OriginLanguageSentence: texts[1]},
	}
	output, err := translator.BatchTranslateSrtBlocks(context.Background(), input, "en", "zh_cn", nil)
	if err != nil || len(output) != 6 || splits != 3 {
		t.Fatalf("导出没有保留5条较短字幕: blocks=%+v splits=%d err=%v", output, splits, err)
	}
	var sources, targets []string
	service := &YouTubeSubtitleService{}
	previousEnd := 118.84
	for _, block := range output[:5] {
		start, end, err := service.parseSrtTimestamp(block.Timestamp)
		if err != nil || start < previousEnd || end <= start || end > 133.52 {
			t.Fatalf("分段时间不连续或超出父句: %s err=%v", block.Timestamp, err)
		}
		previousEnd = end
		sources = append(sources, block.OriginLanguageSentence)
		targets = append(targets, block.TargetLanguageSentence)
	}
	if previousEnd != 133.52 || !subtitleSegmentsPreserveText(candidate.FullSource, sources) || !subtitleSegmentsPreserveText(candidate.FullTarget, targets) || output[5].TargetLanguageSentence != "我读书。" {
		t.Fatal("导出丢失原译、结束时间或后续字幕")
	}
}
