package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func lengthSplitTestInput(original pairedSentence, limit int) pairedTranslationInput {
	return pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxSourceChars: limit, MaxTargetChars: limit, Sentences: []pairedTranslationSource{{ID: original.ID, Text: original.FullSource}}}
}

func decodeFrozenSplitTestInput(prompt string) (subtitleLengthSplitInput, error) {
	_, payload, ok := strings.Cut(prompt, "Input JSON:\n")
	if !ok {
		return subtitleLengthSplitInput{}, fmt.Errorf("not a local split request: %.60s", prompt)
	}
	var input subtitleLengthSplitInput
	err := json.Unmarshal([]byte(payload), &input)
	return input, err
}

func encodeFrozenSplitTestResponse(sentence pairedSentence) string {
	var pairs []pairedTranslationSegment
	for i, text := range sentence.Source {
		pairs = append(pairs, pairedTranslationSegment{Source: text, Target: sentence.Target[i]})
	}
	data, _ := json.Marshal(map[string]any{"segments": pairs})
	return string(data)
}

func TestFrozenLengthSplitKeepsLocalTextAndRetriesOnlyOverflow(t *testing.T) {
	source := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	target := "因为它们是永恒的，它们以非常普遍的哲学术语谈论当代道德，"
	original := pairedSentence{ID: "7", FullSource: "I read books, " + source + " Thanks.", FullTarget: "我读书，" + target + "谢谢。", Source: []string{"I read books,", source, "Thanks."}, Target: []string{"我读书，", target, "谢谢。"}, SemanticReviewed: true, LayoutReviewed: true, DraftTarget: "初译"}
	calls := 0
	tr := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		input, err := decodeFrozenSplitTestInput(prompt)
		if err != nil {
			return "", err
		}
		if input.Source != source || input.Target != target || input.MaxDisplayUnits != 75 || input.SourceDisplayUnits != subtitleTargetLength(source) {
			t.Fatalf("not the single overlong pair: %+v", input)
		}
		for _, forbidden := range []string{"parent_source_text", "semantic_context", "context_after", "nlp_segments_hint", "REWRITE MODE", translationFillerPolicy} {
			if strings.Contains(prompt, forbidden) {
				t.Fatalf("unexpected context or edit policy: %s", forbidden)
			}
		}
		if calls == 1 {
			return encodeFrozenSplitTestResponse(pairedSentence{Source: []string{source}, Target: []string{target}}), nil
		}
		if input.PreviousIssue == "" {
			t.Fatal("missing actual validation failure")
		}
		return encodeFrozenSplitTestResponse(pairedSentence{Source: []string{"because they are timeless", "and they speak in very general philosophical terms", "about contemporary morals,"}, Target: []string{"因为它们是永恒的，", "它们以非常普遍的哲学术语", "谈论当代道德，"}}), nil
	})}
	parents := map[string]pairedSentence{"7": original}
	err := tr.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 65), parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	got := parents["7"]
	if err != nil || calls != 2 || len(got.Source) != 5 || got.FullTarget != original.FullTarget || got.Source[0] != original.Source[0] || got.Source[4] != original.Source[2] || got.DraftTarget != original.DraftTarget || got.LayoutFallback || got.LayoutReviewed {
		t.Fatalf("calls=%d result=%+v err=%v", calls, got, err)
	}
}

func TestFrozenSplitRejectsTextChangesAndUnsafeBoundaries(t *testing.T) {
	source, target := "We read books every day.", "我们每天读书。"
	for _, tc := range []struct{ name, response string }{
		{"missing source", `{"segments":[{"source":"We read","target":"我们"},{"source":"every day.","target":"每天读书。"}]}`},
		{"repeat target", `{"segments":[{"source":"We read books","target":"我们每天"},{"source":"every day.","target":"我们每天读书。"}]}`},
		{"rewrite target", `{"segments":[{"source":"We read books","target":"我们天天"},{"source":"every day.","target":"读书。"}]}`},
		{"word split", `{"segments":[{"source":"We read bo","target":"我们每天"},{"source":"oks every day.","target":"读书。"}]}`},
		{"empty target", `{"segments":[{"source":"We read books","target":""},{"source":"every day.","target":"我们每天读书。"}]}`},
		{"invalid JSON", `{"segments":[]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseFrozenSubtitleSplit(tc.response, source, target, "en"); err == nil {
				t.Fatal("accepted a changed or invalid subtitle")
			}
		})
	}
	if _, err := parseFrozenSubtitleSplit(`{"segments":[{"source":"I treat reading","target":"我把阅读视为"},{"source":"as finishing a book.","target":"读完一本书。"}]}`, "I treat reading as finishing a book.", "我把阅读视为读完一本书。", "en"); err == nil {
		t.Fatal("accepted incomplete complement")
	}
}

func TestFrozenLengthPassChecksBothLanguagesAndSkipsCompliant(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "I read many books, and I discuss them with friends.", FullTarget: strings.Repeat("甲", 19) + "，" + strings.Repeat("乙", 18) + "。"}
	original.Source = []string{original.FullSource}
	original.Target = []string{original.FullTarget}
	calls := 0
	tr := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		return encodeFrozenSplitTestResponse(pairedSentence{Source: []string{"I read many books,", "and I discuss them with friends."}, Target: []string{strings.Repeat("甲", 19) + "，", strings.Repeat("乙", 18) + "。"}}), nil
	})}
	parents := map[string]pairedSentence{"1": original}
	run := func() error {
		return tr.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 75), parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	}
	if err := run(); err != nil || calls != 1 || pairedFinalLengthIssue(parents["1"]) != nil {
		t.Fatalf("target width not checked: calls=%d err=%v", calls, err)
	}
	if err := run(); err != nil || calls != 1 {
		t.Fatalf("compliant pairs requested again: calls=%d err=%v", calls, err)
	}
}

func TestFrozenLengthPassCannotRewriteAfterRetries(t *testing.T) {
	source := strings.TrimSpace(strings.Repeat("We read books every day. ", 5))
	original := pairedSentence{ID: "1", FullSource: source, FullTarget: "我们每天读书。", Source: []string{source}, Target: []string{"我们每天读书。"}}
	calls := 0
	var previous string
	tr := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		input, err := decodeFrozenSplitTestInput(prompt)
		if err != nil {
			return "", err
		}
		if calls > 1 && input.PreviousIssue == "" {
			t.Fatal("missing frozen-text validation feedback")
		}
		if calls > 1 && prompt == previous {
			t.Fatal("identical request retried without new feedback")
		}
		previous = prompt
		return `{"segments":[{"source":"We read books every day.","target":"我们每天读书，"},{"source":"We read books every day. We read books every day. We read books every day. We read books every day.","target":"而且很喜欢。"}]}`, nil
	})}
	parents := map[string]pairedSentence{"1": original}
	err := tr.splitLongPairedSubtitles(context.Background(), lengthSplitTestInput(original, 75), parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	got := parents["1"]
	if err != nil || calls != 3 || !slices.Equal(got.Source, original.Source) || !slices.Equal(got.Target, original.Target) || got.FullTarget != original.FullTarget || !got.LayoutFallback {
		t.Fatalf("rewrite replaced valid text: calls=%d got=%+v err=%v", calls, got, err)
	}
}

func TestFrozenLengthPassPreservesTextOnServiceFailureAndCancellation(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: strings.TrimSpace(strings.Repeat("long phrase ", 10)), FullTarget: "完整译文不能丢失。", Target: []string{"完整译文不能丢失。"}}
	original.Source = []string{original.FullSource}
	for _, cancel := range []bool{false, true} {
		ctx, stop := context.WithCancel(context.Background())
		calls := 0
		tr := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
			calls++
			if cancel {
				stop()
			}
			return "", errors.New("connection closed")
		})}
		parents := map[string]pairedSentence{"1": original}
		complete := false
		err := tr.splitLongPairedSubtitles(ctx, lengthSplitTestInput(original, 75), parents, "en", "zh_cn", func(s pairedSentence, done bool) error { complete = complete || done; return nil })
		stop()
		if calls != 1 || complete == cancel || cancel && !errors.Is(err, context.Canceled) || !cancel && err != nil || parents["1"].FullTarget != original.FullTarget {
			t.Fatalf("cancel=%t calls=%d complete=%t err=%v", cancel, calls, complete, err)
		}
	}
}

func TestBoundaryReviewReceivesOnlyParentScopedTermMeanings(t *testing.T) {
	parent := pairedSentence{ID: "1", FullSource: "This capacitor is rated in farads.", FullTarget: "这个电容的单位是法拉。"}
	input := lengthSplitTestInput(parent, 65)
	input.SemanticContext = &translationBatchSemanticContext{Terms: []translationSemanticTerm{{Source: "farads", Target: "法拉", Meaning: "电容量单位", SentenceIDs: []string{"1"}}, {Source: "bank", Target: "河岸", Meaning: "另一句的河岸", SentenceIDs: []string{"2"}}}}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		var payload struct {
			Terms []translationSemanticTerm `json:"terms"`
		}
		if err := semanticTestPayload(prompt, &payload); err != nil {
			return "", err
		}
		if len(payload.Terms) != 1 || payload.Terms[0].Meaning != "电容量单位" {
			t.Fatalf("边界核验丢失或泄漏术语释义: %+v", payload)
		}
		return `{"acceptable":true,"reason":"按适用词义核对逐段内容"}`, nil
	})}
	if ok, _, err := translator.reviewLengthBoundaries(context.Background(), input, parent, parent); err != nil || !ok {
		t.Fatalf("边界核验失败: %v", err)
	}
}

func TestFinalBoundariesRejectOpenChineseComplements(t *testing.T) {
	for _, marker := range []string{"当作", "视为", "看作", "称为"} {
		source := "I treat reading as finishing a book."
		left, right := "我把阅读"+marker, "读完一本书。"
		input := pairedTranslationInput{MaxTargetChars: 75, PreserveFinalBoundaries: true, Sentences: []pairedTranslationSource{{ID: "1", Text: source, TargetText: left + right}}}
		data, _ := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: left + right, Source: []string{"I treat reading", "as finishing a book."}, Target: []string{left, right}}})
		if _, err := (&Translator{}).parsePairedTranslation(string(data), input, "en", "zh_cn"); err == nil {
			t.Fatalf("放过悬空补语：%s / %s", left, right)
		}
		if subtitleBoundaryLeavesComplement(left + "——") {
			t.Fatal("误判明确的口语中断")
		}
	}
}

func TestFinalLengthBoundariesAreNotSoftMerged(t *testing.T) {
	source := "and different authors about different things, fiction, non-fiction, whatever it might be."
	target := "不同作者、不同内容——虚构、非虚构，无论是什么。"
	input := pairedTranslationInput{MaxTargetChars: 75, PreserveFinalBoundaries: true, Sentences: []pairedTranslationSource{{ID: "17", Text: source, TargetText: target}}}
	data, _ := encodePairedTestResponse([]pairedSentence{{ID: "17", FullTarget: target, Source: []string{"and different authors about different things, fiction, non-fiction,", "whatever it might be."}, Target: []string{"不同作者、不同内容——虚构、非虚构，", "无论是什么。"}}})
	got, err := (&Translator{}).parsePairedTranslation(string(data), input, "en", "zh_cn")
	if err != nil || len(got) != 1 || len(got[0].Source) != 2 || pairedFinalLengthIssue(got[0]) != nil {
		t.Fatalf("最终切口被软优化重新合成超长字幕: %+v err=%v", got, err)
	}
}

func TestSubtitleLengthPassRejectsChangedScopedTerm(t *testing.T) {
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) { t.Fatal("丢失已确认术语应直接拒绝"); return "", nil })}
	input := pairedTranslationInput{SemanticContext: &translationBatchSemanticContext{Terms: []translationSemanticTerm{{Source: "Mapping Ideology", Target: "《图绘意识形态》", SentenceIDs: []string{"1"}}}}}
	ok, _, err := translator.reviewLengthRewrite(context.Background(), input, pairedSentence{}, pairedTranslationSource{ID: "1", TargetText: "我还有《图绘意识形态》。"}, "我还有《意识形态的崇高对象》。", "zh_cn")
	if err != nil || ok {
		t.Fatalf("丢失正确书名仍通过: %v %v", ok, err)
	}
}
