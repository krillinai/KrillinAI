package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestSubtitleLayoutReviewNeedsExplicitEvidenceForEveryParent(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "It is easier if you practice daily.", FullTarget: "如果每天练习，事情会更容易。", Source: []string{"It is easier", "if you practice daily."}, Target: []string{"如果每天练习，", "事情会更容易。"}}
	for _, response := range []string{`{"corrections":[]}`, `{"reviews":[{"sentence_id":"1","aligned":false,"natural_boundaries":true,"reason":"条件与结果配反了"}],"corrections":[]}`} {
		translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) { return response, nil })}
		values := map[string]pairedSentence{"1": original}
		if err := translator.reviewPairedLayouts(context.Background(), lengthSplitTestInput(original, 65), values, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil || values["1"].LayoutReviewed || values["1"].FullTarget != original.FullTarget {
			t.Fatalf("无证据或已拒绝的配对被标为审校成功: %+v err=%v", values["1"], err)
		}
	}
}

func TestSubtitleLayoutRewriteRequiresMeaningAndPairingVerification(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "It is easier if you practice daily.", FullTarget: "如果每天练习，事情会更容易。", Source: []string{"It is easier", "if you practice daily."}, Target: []string{"如果每天练习，", "事情会更容易。"}, DraftTarget: "初译", RevisionVersion: "修订版本", SemanticReviewed: true}
	for _, checks := range [][2]bool{{true, true}, {false, true}, {true, false}} {
		meaning, boundaries := 0, 0
		translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
			switch {
			case strings.HasPrefix(prompt, "任务：translation_layout_review\n"):
				return layoutReviewTestResponse(prompt, `{"corrections":[{"sentence_id":"1","reason":"条件和结果逐段错位，需要改变译文顺序","rewrite":true,"segments":[{"source":"It is easier","target":"事情会更容易，"},{"source":"if you practice daily.","target":"如果每天练习的话。"}]}]}`), nil
			case strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n"):
				meaning++
				return fmt.Sprintf(`{"equivalent":%t,"reason":"核对每日练习的条件与更容易的结果"}`, checks[0]), nil
			case strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n"):
				boundaries++
				return fmt.Sprintf(`{"acceptable":%t,"reason":"独立检查实际中英片段及条件边界"}`, checks[1]), nil
			default:
				t.Fatalf("unexpected request: %s", prompt)
				return "", nil
			}
		})}
		values := map[string]pairedSentence{"1": original}
		err := translator.reviewPairedLayouts(context.Background(), lengthSplitTestInput(original, 65), values, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
		got := values["1"]
		approve := checks[0] && checks[1]
		if err != nil || meaning != 1 || boundaries != map[bool]int{true: 1, false: 0}[checks[0]] || got.LayoutReviewed != approve || (got.FullTarget != original.FullTarget) != approve || got.DraftTarget != original.DraftTarget || got.RevisionVersion != original.RevisionVersion {
			t.Fatalf("checks=%v got=%+v meaning=%d boundaries=%d err=%v", checks, got, meaning, boundaries, err)
		}
	}
}

func TestSubtitleLayoutReviewDoesNotRepeatPassedPeers(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 65}
	sentences := make(map[string]pairedSentence)
	for _, id := range []string{"1", "2"} {
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: "I read books, and I learn."})
		sentences[id] = pairedSentence{ID: id, FullSource: "I read books, and I learn.", FullTarget: "我读书，并从中学习。", Source: []string{"I read books,", "and I learn."}, Target: []string{"我读书，", "并从中学习。"}}
	}
	calls := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if calls == 1 {
			return layoutReviewTestResponse(prompt, `{"corrections":[{"sentence_id":"1","reason":"调整切口","segments":[{"source":"I read books,","target":"擅自改写译文，"},{"source":"and I learn.","target":"并从中学习。"}]}]}`), nil
		}
		if strings.Contains(prompt, `"sentence_id":"2"`) {
			t.Fatal("重新审校了已通过的同批句子")
		}
		return layoutReviewTestResponse(prompt, `{"corrections":[]}`), nil
	})}
	for i := 0; i < 2; i++ {
		if err := translator.reviewPairedLayouts(context.Background(), input, sentences, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
			t.Fatal(err)
		}
		if !sentences["2"].LayoutReviewed || sentences["1"].LayoutReviewed != (i == 1) {
			t.Fatalf("失效修正连带影响其他句子: %+v", sentences)
		}
	}
}

func TestSubtitleLayoutReviewKeepsRevisionMetadataOutOfPayload(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "I read books, and I learn.", FullTarget: "我读书，并从中学习。", DraftTarget: "初译记录", RevisionVersion: "版本记录", Source: []string{"I read books,", "and I learn."}, Target: []string{"我读书，", "并从中学习。"}, SemanticReviewed: true}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.Contains(prompt, "初译记录") || strings.Contains(prompt, "版本记录") {
			t.Fatal("边界审校重复发送了修订元数据")
		}
		return layoutReviewTestResponse(prompt, `{"corrections":[]}`), nil
	})}
	var saved pairedSentence
	err := translator.reviewPairedLayouts(context.Background(), lengthSplitTestInput(original, 65), map[string]pairedSentence{"1": original}, "en", "zh_cn", func(s pairedSentence, _ bool) error { saved = s; return nil })
	if err != nil || saved.DraftTarget != original.DraftTarget || saved.RevisionVersion != original.RevisionVersion || !saved.SemanticReviewed || !saved.LayoutReviewed {
		t.Fatalf("审校清理请求时丢失本地元数据: %+v err=%v", saved, err)
	}
}

func TestSubtitleLayoutReviewPreservesLockedText(t *testing.T) {
	source := "We need a large collection of books on different subjects and by different authors around us in order to sustain a reading habit."
	target := "我们需要大量藏书，涵盖不同主题和不同作者，放在身边，以维持阅读习惯。"
	for _, rewrite := range []bool{false, true} {
		original := pairedSentence{ID: "1", FullSource: source, FullTarget: target, Source: []string{"We need a", "large collection of books on different subjects and by different authors around us in order to sustain a reading habit."}, Target: []string{"我们需要", "大量藏书，涵盖不同主题和不同作者，放在身边，以维持阅读习惯。"}, LayoutVersion: pairedLayoutVersion, LayoutTarget: 75, SemanticReviewed: true}
		calls := 0
		translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
			calls++
			if !strings.HasPrefix(prompt, "任务：translation_layout_review\n") || !strings.Contains(prompt, target) {
				t.Fatal("边界审校没有完整冻结译文")
			}
			first := "我们需要大量藏书，"
			if rewrite {
				first = "我们需要很多很多书，"
			}
			out := map[string]any{"corrections": []any{map[string]any{"sentence_id": "1", "reason": "冠词a与名词短语被拆开", "segments": []pairedTranslationSegment{{"We need a large collection of books", first}, {"on different subjects and by different authors around us", "涵盖不同主题和不同作者，放在身边，"}, {"in order to sustain a reading habit.", "以维持阅读习惯。"}}}}}
			data, err := json.Marshal(out)
			return layoutReviewTestResponse(prompt, string(data)), err
		})}
		var saved pairedSentence
		input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 75, MaxSourceChars: 75, Sentences: []pairedTranslationSource{{ID: "1", Text: source}}}
		err := translator.reviewPairedLayouts(context.Background(), input, map[string]pairedSentence{"1": original}, "en", "zh_cn", func(value pairedSentence, complete bool) error {
			saved = value
			if !complete {
				t.Error("未交付最终字幕")
			}
			return nil
		})
		if err != nil || calls != 1 || saved.FullTarget != target || !saved.SemanticReviewed {
			t.Fatalf("saved=%+v calls=%d err=%v", saved, calls, err)
		}
		if rewrite {
			if saved.LayoutReviewed || saved.Source[0] != "We need a" {
				t.Fatal("接受了审校模型改写或混入部分修正")
			}
		} else if !saved.LayoutReviewed || saved.Source[0] == "We need a" {
			t.Fatal("自然边界修正未应用")
		}
	}
}

func TestSubtitleLayoutReviewSplitsOversizedPayloadAndResumesPendingOnly(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 75}
	sentences := make(map[string]pairedSentence)
	targets := make(map[string]string)
	for i := 1; i <= 4; i++ {
		id := fmt.Sprint(i)
		source := strings.TrimSpace(strings.Repeat("I read books, and I learn. ", 20))
		target := strings.Repeat("我读书，并从中学习。", 20)
		sentences[id] = pairedSentence{ID: id, FullSource: source + " " + source, FullTarget: target + target, Source: []string{source, source}, Target: []string{target, target}}
		targets[id] = target + target
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: sentences[id].FullSource})
	}
	calls := 0
	firstRun := true
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if len(prompt) > translationRequestBytes {
			t.Fatalf("oversized review submitted: %d", len(prompt))
		}
		if !firstRun && (strings.Contains(prompt, `"sentence_id":"1"`) || strings.Contains(prompt, `"sentence_id":"3"`) || strings.Contains(prompt, `"sentence_id":"4"`)) {
			t.Fatal("resume repeated a completed review")
		}
		response := layoutReviewTestResponse(prompt, `{"corrections":[]}`)
		if firstRun {
			var result map[string]any
			if err := json.Unmarshal([]byte(response), &result); err != nil {
				t.Fatal(err)
			}
			for _, item := range result["reviews"].([]any) {
				review := item.(map[string]any)
				if review["sentence_id"] == "2" {
					review["aligned"] = false
				}
			}
			data, _ := json.Marshal(result)
			response = string(data)
		}
		return response, nil
	})}
	saved := make(map[string]int)
	save := func(sentence pairedSentence, _ bool) error {
		saved[sentence.ID]++
		if sentence.FullTarget != targets[sentence.ID] {
			t.Fatal("review lost the saved translation")
		}
		return nil
	}
	if err := translator.reviewPairedLayouts(context.Background(), input, sentences, "en", "zh_cn", save); err != nil {
		t.Fatal(err)
	}
	if calls < 2 || sentences["2"].LayoutReviewed {
		t.Fatalf("batch was skipped or failed sentence approved: calls=%d reviewed=%t", calls, sentences["2"].LayoutReviewed)
	}
	for _, id := range []string{"1", "3", "4"} {
		if !sentences[id].LayoutReviewed || saved[id] != 1 {
			t.Fatalf("completed peer was lost or saved repeatedly: id=%s saved=%v", id, saved)
		}
	}
	firstRun = false
	before := calls
	if err := translator.reviewPairedLayouts(context.Background(), input, sentences, "en", "zh_cn", save); err != nil || calls != before+1 || !sentences["2"].LayoutReviewed {
		t.Fatalf("pending review did not recover: calls=%d err=%v", calls, err)
	}
}
