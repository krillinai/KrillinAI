package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"slices"
	"strings"
	"testing"
)

func TestFinalLengthUsesConfiguredLimitOnBothSides(t *testing.T) {
	for _, tc := range []struct {
		name, source, target string
		limit                int
		wantSplit            bool
	}{
		{"source_at_60", strings.Repeat("x", 60), "短译文。", 60, false},
		{"target_at_60", "Short source.", strings.Repeat("甲", 30), 60, false},
		{"source_61", strings.Repeat("x", 61), "短译文。", 60, true},
		{"source_75", strings.Repeat("x", 75), "短译文。", 60, true},
		{"target_62", "Short source.", strings.Repeat("甲", 31), 60, true},
		{"configured_80", strings.Repeat("x", 80), strings.Repeat("甲", 40), 80, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// 旧缓存的75不能掩盖本次60配置。
			original := pairedSentence{ID: "1", FullSource: tc.source, FullTarget: tc.target,
				Source: []string{tc.source}, Target: []string{tc.target}, LayoutTarget: 75}
			calls := 0
			tr := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				calls++
				var request subtitleLengthSplitInput
				if err := semanticTestPayload(prompt, &request); err != nil {
					return "", err
				}
				if request.DisplayTarget != tc.limit || request.MaxDisplayUnits != tc.limit || request.MaxSourceChars != tc.limit || request.MaxTargetChars != tc.limit {
					t.Fatalf("长度口径不一致: %+v", request)
				}
				return "", errors.New("拆分服务暂不可用")
			})}
			parents := map[string]pairedSentence{"1": original}
			if err := tr.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, tc.limit), parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
				t.Fatal(err)
			}
			got := parents["1"]
			if (calls == 1) != tc.wantSplit || calls > 1 || got.LayoutFallback != tc.wantSplit || !slices.Equal(got.Source, original.Source) || got.FullTarget != original.FullTarget {
				t.Fatalf("触发条件或失败保留错误: calls=%d got=%+v", calls, got)
			}
		})
	}
	previous := config.Conf.App.MaxSentenceLength
	t.Cleanup(func() { config.Conf.App.MaxSentenceLength = previous })
	config.Conf.App.MaxSentenceLength = 60
	request := newSubtitleLengthSplitInput(pairedTranslationInput{}, pairedTranslationSource{Text: "source", TargetText: "译文"}, false, "")
	if request.DisplayTarget != 60 || request.MaxDisplayUnits != 60 {
		t.Fatalf("缺省配置产生了零长度: %+v", request)
	}
}

// 冷跑第307条的真实原译。模型响应为固定候选，只验证程序的逐轮推进与核验。
func progressiveLengthFixture() (pairedSentence, pairedSentence, pairedSentence) {
	original := pairedSentence{ID: "22", FullSource: "cuz I think you guys would faint if you saw what my actual spending habits are like and what minimal income I make as a student",
		FullTarget: "因为我觉得你们要是看到我真实的消费习惯和作为学生的微薄收入会晕过去。", SemanticReviewed: true}
	original.Source, original.Target = []string{original.FullSource}, []string{original.FullTarget}
	partial := pairedSentence{ID: original.ID,
		Source: []string{"cuz I think you guys would faint", "if you saw what my actual spending habits are like and what minimal income I make as a student"},
		Target: []string{"因为我觉得你们会晕过去，", "如果看到我真实的消费习惯和作为学生的微薄收入。"}}
	partial.FullSource, partial.FullTarget = original.FullSource, strings.Join(partial.Target, "")
	final := pairedSentence{ID: original.ID, FullSource: partial.Source[1],
		Source: []string{"if you saw what my actual spending habits are like", "and what minimal income I make as a student"},
		Target: []string{"如果看到我真实的消费习惯", "和作为学生的微薄收入。"}}
	final.FullTarget = strings.Join(final.Target, "")
	return original, partial, final
}

func TestFinalLengthRefinesOnlyRemainingLongChild(t *testing.T) {
	original, partial, final := progressiveLengthFixture()
	calls := 0
	tr := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
			return `{"equivalent":true,"reason":"固定候选仅验证逐轮拆分行为"}`, nil
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		calls++
		var request subtitleLengthSplitInput
		if err := semanticTestPayload(prompt, &request); err != nil {
			return "", err
		}
		candidate := partial
		if calls == 2 {
			if request.Sentences[0].Text != partial.Source[1] || request.OriginalTarget != partial.Target[1] || strings.Contains(prompt, partial.Source[0]) {
				t.Fatalf("重拆回到了完整父句或影响已合格片段: %+v", request)
			}
			candidate = final
		} else if calls != 1 || request.Sentences[0].Text != original.FullSource {
			t.Fatalf("出现多余请求: %d %+v", calls, request)
		}
		data, err := encodePairedTestResponse([]pairedSentence{candidate})
		return string(data), err
	})}
	got, err := tr.splitLongPairedSegment(context.Background(), lengthSplitTestInput(original, 60), original,
		pairedTranslationSource{ID: original.ID, Text: original.FullSource, TargetText: original.FullTarget}, "en", "zh_cn", true)
	if err != nil || calls != 2 || len(got.Source) != 3 || got.Source[0] != partial.Source[0] || got.Target[0] != partial.Target[0] || pairedFinalLengthIssueAtLimit(got, 60) != nil || got.LayoutFallback || !got.LayoutReviewed || !subtitleSegmentsPreserveText(original.FullSource, got.Source) || !subtitleSegmentsPreserveText(got.FullTarget, got.Target) {
		t.Fatalf("逐轮拆分未收敛或丢失已核验短段: %+v calls=%d err=%v", got, calls, err)
	}
}

func TestFinalLengthKeepsProgressWhenChildCannotBeVerified(t *testing.T) {
	for _, failure := range []string{"missing_source", "rejected_rewrite", "rejected_boundary", "unavailable", "canceled"} {
		t.Run(failure, func(t *testing.T) {
			original, partial, final := progressiveLengthFixture()
			calls := 0
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			tr := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				if calls > 1 && (failure == "rejected_rewrite" && strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") || failure == "rejected_boundary" && strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n")) {
					return `{"equivalent":false,"acceptable":false,"reason":"内容或切口不合格"}`, nil
				}
				if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
					return `{"equivalent":true,"reason":"固定候选仅验证逐轮拆分行为"}`, nil
				}
				if response, ok := neutralSemanticTestResponse(prompt); ok {
					return response, nil
				}
				calls++
				candidate := partial
				if calls > 1 {
					var request subtitleLengthSplitInput
					if err := semanticTestPayload(prompt, &request); err != nil {
						return "", err
					}
					if request.Sentences[0].Text != partial.Source[1] {
						t.Fatal("失败重试重新发送了已合格内容")
					}
					candidate = final
					candidate.Source, candidate.Target = slices.Clone(final.Source), slices.Clone(final.Target)
					switch failure {
					case "missing_source":
						candidate.Source[1] = "as a student"
					case "rejected_rewrite":
						candidate.Target[1] = "以及作为学生的巨额收入。"
					case "unavailable":
						return "", errors.New("接口中断")
					case "canceled":
						cancel()
						return "", context.Canceled
					}
				}
				data, err := encodePairedTestResponse([]pairedSentence{candidate})
				return string(data), err
			})}
			got, err := tr.splitLongPairedSegment(ctx, lengthSplitTestInput(original, 60), original,
				pairedTranslationSource{ID: original.ID, Text: original.FullSource, TargetText: original.FullTarget}, "en", "zh_cn", true)
			if failure == "canceled" {
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("取消未传播: %v", err)
				}
				return
			}
			wantCalls := 3
			if failure == "unavailable" {
				wantCalls = 2
			}
			if err != nil || calls != wantCalls || !slices.Equal(got.Source, partial.Source) || !slices.Equal(got.Target, partial.Target) || got.FullTarget != partial.FullTarget || !got.LayoutFallback {
				t.Fatalf("未通过候选覆盖了已有结果: %+v calls=%d err=%v", got, calls, err)
			}
		})
	}
}

func TestBatchLengthContinuesWithOnlyLongChildren(t *testing.T) {
	original, partial, final := progressiveLengthFixture()
	input := lengthSplitTestInput(original, 60)
	input.Sentences = append(input.Sentences, pairedTranslationSource{ID: "23", Text: original.FullSource})
	parents := map[string]pairedSentence{"22": original, "23": original}
	parents["23"] = func() pairedSentence { s := original; s.ID = "23"; return s }()
	batchCalls, childCalls := 0, 0
	tr := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_batch_review\n") {
			return `{"reviews":[{"sentence_id":"22_0","equivalent":true,"acceptable":true,"reason":"完整且对应"},{"sentence_id":"23_0","equivalent":true,"acceptable":true,"reason":"完整且对应"}]}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
			return `{"equivalent":true,"reason":"固定候选仅验证逐轮拆分行为"}`, nil
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_length_split_batch\n") {
			batchCalls++
			var output []pairedSentence
			for _, id := range []string{"22_0", "23_0"} {
				candidate := partial
				candidate.ID = id
				output = append(output, candidate)
			}
			data, err := encodePairedTestResponse(output)
			return string(data), err
		}
		childCalls++
		var request subtitleLengthSplitInput
		if err := semanticTestPayload(prompt, &request); err != nil {
			return "", err
		}
		if request.Sentences[0].Text != partial.Source[1] {
			t.Fatalf("批量成功后重新发送了原父句: %+v", request)
		}
		candidate := final
		candidate.ID = request.Sentences[0].ID
		data, err := encodePairedTestResponse([]pairedSentence{candidate})
		return string(data), err
	})}
	// 冻结模式不能采用此语序调整；先失败一次，再由允许改写的批量请求取得进展。
	if err := tr.splitLongPairedSubtitles(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if batchCalls != 2 || childCalls != 2 {
		t.Fatalf("部分成功仍在重复请求原段: batch=%d children=%d", batchCalls, childCalls)
	}
	for id, got := range parents {
		if pairedFinalLengthIssueAtLimit(got, 60) != nil || len(got.Source) != 3 || got.Target[0] != partial.Target[0] || got.Source[0] != partial.Source[0] || !subtitleSegmentsPreserveText(got.FullTarget, got.Target) {
			t.Fatalf("%s未保留批量结果或完成局部拆分: %+v", id, got)
		}
	}
}

func TestLengthReplacementPreservesSpacingAndFindsMatchingPair(t *testing.T) {
	parent := pairedSentence{FullTarget: "First.  Second.\tThird.", Source: []string{"Repeated source", "Repeated source", "Third source"}, Target: []string{"First.", "Second.", "Third."}}
	index := lengthPairIndex(parent, pairedTranslationSource{Text: "Repeated source", TargetText: "Second."})
	if index != 1 {
		t.Fatalf("同文不同译定位错误: %d", index)
	}
	candidate := pairedSentence{FullTarget: "New second.", Source: []string{"Repeated", "source"}, Target: []string{"New", "second."}}
	got := replaceLengthPair(parent, index, candidate)
	if got.FullTarget != "First.  New second.\tThird." || !subtitleSegmentsPreserveText(got.FullTarget, got.Target) || !slices.Equal(parent.Target, []string{"First.", "Second.", "Third."}) {
		t.Fatalf("替换丢失空白或修改了父句数组: %+v", got)
	}
	parent.Target[1] = "First."
	if lengthPairIndex(parent, pairedTranslationSource{Text: "Repeated source", TargetText: "First."}) != -1 {
		t.Fatal("无法唯一定位时不应替换第一处")
	}
}

func TestFinalLengthParserEnforcesConfiguredLimit(t *testing.T) {
	for _, limit := range []int{60, 80} {
		t.Run(fmt.Sprint(limit), func(t *testing.T) {
			text := strings.Repeat("x", 70)
			input := pairedTranslationInput{MaxTargetChars: limit, PreserveFinalBoundaries: true, Sentences: []pairedTranslationSource{{ID: "1", Text: text, TargetText: "译文。"}}}
			output := pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{{ID: "1", FullTarget: "译文。", Segments: []pairedTranslationSegment{{Source: text, Target: "译文。"}}}}}
			data, _ := json.Marshal(output)
			_, err := (&Translator{}).parsePairedTranslation(string(data), input, "en", "zh_cn")
			if (err != nil) != (limit == 60) {
				t.Fatalf("末端解析没有采用%d配置: %v", limit, err)
			}
		})
	}
}

func TestLengthParentRecoveryCannotReplaceEarlierProgressWithWorseLayout(t *testing.T) {
	best := lengthOverflowFixture()
	second := strings.TrimSpace(strings.Repeat("We read books every day. ", 5))
	original := pairedSentence{ID: "1", FullSource: best.FullSource + " " + second, FullTarget: best.FullTarget + "我们每天读书。",
		Source: []string{best.FullSource, second}, Target: []string{best.FullTarget, "我们每天读书。"}, SemanticReviewed: true}
	wholeCalls := 0
	tr := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		var request subtitleLengthSplitInput
		if err := semanticTestPayload(prompt, &request); err != nil {
			return "", err
		}
		var candidate pairedSentence
		switch request.Sentences[0].Text {
		case best.FullSource:
			candidate = best
		case original.FullSource:
			wholeCalls++
			// 比最初334单位短，却比已经取得的120单位布局更差，不能覆盖。
			candidate.Source = append([]string{strings.Join(best.Source[:2], " ")}, best.Source[2:]...)
			candidate.Source = append(candidate.Source, second)
			candidate.Target = append([]string{strings.Join(best.Target[:2], "")}, best.Target[2:]...)
			candidate.Target = append(candidate.Target, "我们每天读书。")
			candidate.FullTarget = original.FullTarget
		default:
			return `{"sentences":[]}`, nil
		}
		candidate.ID = original.ID
		data, err := encodePairedTestResponse([]pairedSentence{candidate})
		return string(data), err
	})}
	got, err := tr.repairLongPairedSubtitle(context.Background(), lengthSplitTestInput(original, 75), original,
		pairedTranslationSource{ID: original.ID, Text: original.FullSource}, "en", "zh_cn")
	if err != nil || wholeCalls != 1 || len(got.Source) != len(best.Source)+1 || !slices.Equal(got.Source[:len(best.Source)], best.Source) || got.Source[len(best.Source)] != second || got.FullTarget != original.FullTarget || !got.LayoutFallback {
		t.Fatalf("父句较差候选覆盖了已有改进: %+v whole=%d err=%v", got, wholeCalls, err)
	}
}
