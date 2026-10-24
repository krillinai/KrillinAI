package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestLengthSplitHistoricalRequestCanRetryAfterLongValidationError(t *testing.T) {
	data, err := os.ReadFile("testdata/subtitle-length-budget.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Request  subtitleLengthSplitInput        `json:"request"`
		Expected pairedTranslationOutputSentence `json:"expected"`
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	request := fixture.Request
	source := request.Sentences[0]
	source.TargetText = request.OriginalTarget
	parent := pairedSentence{ID: source.ID, FullSource: source.Text, FullTarget: source.TargetText,
		Source: []string{source.Text}, Target: []string{source.TargetText}, NLPSourceHint: source.NLPSourceHint}
	splits := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if len(prompt) > translationRequestBytes {
			t.Fatalf("实际请求超预算: %d", len(prompt))
		}
		if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
			return `{"equivalent":true,"reason":"使用历史最终候选，仅验证请求与恢复路径"}`, nil
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		splits++
		t.Logf("split attempt %d: %d bytes", splits, len(prompt))
		for _, field := range []string{"semantic_context", "context_before", "context_after", "parent_source_text", "parent_target_text", "parent_nlp_segments_hint", "source_segments_hint", "nlp_segments_hint", "measured_source_hints"} {
			if strings.Contains(prompt, `"`+field+`":`) {
				t.Fatalf("拆分请求仍包含重复上下文: %s", field)
			}
		}
		if splits == 1 {
			// 错误响应触发含原译文的长诊断；旧代码下一次构造即超预算，模型没有收到重试。
			bad := pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{{ID: source.ID,
				Segments: []pairedTranslationSegment{{Source: source.Text, Target: strings.Repeat("错误译文", 300)}}}}}
			value, err := json.Marshal(bad)
			return string(value), err
		}
		value, err := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{fixture.Expected}})
		return string(value), err
	})}
	got, err := translator.splitLongPairedSegment(context.Background(), request.pairedTranslationInput, parent, source, "en", "zh_cn")
	if err != nil || splits != 2 || pairedFinalLengthIssue(got) != nil ||
		!subtitleSegmentsPreserveText(parent.FullSource, got.Source) || got.FullTarget != fixture.Expected.FullTarget {
		t.Fatalf("长诊断阻断重试或未恢复历史候选: splits=%d result=%+v error=%v", splits, got, err)
	}
}

func TestLengthBatchReviewSplitsBeforeRequestBudget(t *testing.T) {
	work, candidates := lengthBudgetReviewFixture()
	calls := 0
	seen := make(map[string]int)
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if len(prompt) > translationRequestBytes {
			t.Fatalf("实际批量审校请求超预算: %d", len(prompt))
		}
		var payload struct {
			Items []struct {
				ID string `json:"sentence_id"`
			} `json:"items"`
		}
		if err := semanticTestPayload(prompt, &payload); err != nil {
			return "", err
		}
		t.Logf("review batch: %d items, %d bytes", len(payload.Items), len(prompt))
		var reviews []map[string]any
		for _, item := range payload.Items {
			seen[item.ID]++
			reviews = append(reviews, map[string]any{"sentence_id": item.ID, "equivalent": true, "acceptable": true, "reason": "固定候选用于测试预算分批"})
		}
		value, err := json.Marshal(map[string]any{"reviews": reviews})
		return string(value), err
	})}
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 75}
	if err := translator.reviewLongPairedBatch(context.Background(), input, work, candidates); err != nil {
		t.Fatal(err)
	}
	for _, item := range work {
		if item.candidate == nil || !item.candidate.LayoutReviewed || seen[item.source.ID] != 1 {
			t.Fatalf("超预算导致整批被跳过或重复审校: id=%s calls=%d seen=%v", item.source.ID, calls, seen)
		}
	}
	if calls < 2 {
		t.Fatalf("没有拆开超预算批次: calls=%d", calls)
	}
}

func TestLengthBatchReviewKeepsEarlierResultsOnInvalidGroupOrCancellation(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		t.Run(fmt.Sprintf("cancel=%t", cancel), func(t *testing.T) {
			work, candidates := lengthBudgetReviewFixture()
			ctx, stop := context.WithCancel(context.Background())
			defer stop()
			calls := 0
			translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, _ string) (string, error) {
				calls++
				if calls == 1 {
					return `{"reviews":[{"sentence_id":"1_0","equivalent":true,"acceptable":true,"reason":"已通过"},{"sentence_id":"2_0","equivalent":true,"acceptable":true,"reason":"已通过"}]}`, nil
				}
				if cancel {
					stop()
					return "", context.Canceled
				}
				// 不能用另一子批次的 ID 冒充缺失项，放过本批次不完整的审查。
				return `{"reviews":[{"sentence_id":"1_0","equivalent":true,"acceptable":true,"reason":"错误批次"},{"sentence_id":"4_0","equivalent":true,"acceptable":true,"reason":"不完整审查"}]}`, nil
			})}
			err := translator.reviewLongPairedBatch(ctx, pairedTranslationInput{MaxTargetChars: 75}, work, candidates)
			if calls != 2 || cancel && !errors.Is(err, context.Canceled) || !cancel && err != nil {
				t.Fatalf("取消未传播或失败组重试了已通过组: calls=%d err=%v", calls, err)
			}
			for i, item := range work {
				if (item.candidate != nil) != (i < 2) {
					t.Fatalf("已通过组丢失或未通过组被接受: id=%s candidate=%+v", item.source.ID, item.candidate)
				}
			}
		})
	}
}

func lengthBudgetReviewFixture() ([]*longPairedWork, map[string]pairedSentence) {
	source := "I read books every morning, and I discuss what I learn with my friends every evening."
	target := "我每天早上读书，晚上会和朋友讨论学到的东西。"
	var work []*longPairedWork
	candidates := make(map[string]pairedSentence)
	for i := 1; i <= 4; i++ {
		id := fmt.Sprint(i)
		parent := pairedSentence{ID: id, FullSource: source + strings.Repeat(" More information,", 35),
			FullTarget: target + strings.Repeat("还有一些需要了解的背景信息。", 35),
			Source:     []string{source, strings.Repeat(" More information,", 35)},
			Target:     []string{target, strings.Repeat("还有一些需要了解的背景信息。", 35)}}
		item := &longPairedWork{source: pairedTranslationSource{ID: id + "_0", Text: source, TargetText: target}, parent: parent}
		work = append(work, item)
		candidates[item.source.ID] = pairedSentence{ID: item.source.ID, FullSource: source, FullTarget: target,
			Source: []string{"I read books every morning,", "and I discuss what I learn with my friends every evening."},
			Target: []string{"我每天早上读书，", "晚上会和朋友讨论学到的东西。"}}
	}
	return work, candidates
}
