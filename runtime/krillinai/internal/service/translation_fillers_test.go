package service

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"strings"
	"testing"
)

func TestHesitationLanguageAndMeaningGuards(t *testing.T) {
	for _, tc := range []struct {
		lang types.StandardLanguageCode
		text string
		omit bool
	}{
		{"en", "Uh, um, umm, erm...", true}, {"en", "um um um um", true},
		{"fr", "Euh, euh...", true}, {"de", "Ähm, äh...", true}, {"zh_cn", "呃，呃……", true},
		{"es", "en", false}, {"fr", "en", false}, {"de", "um", false},
		{"en", "en", false}, {"en", "en route", false}, {"en", "en dash", false},
		{"en", "en en en", true}, {"zh_cn", "en，en，呃", true}, {"fr", "en en", false},
		{"zh_cn", "嗯。", false}, {"en", "mm-hmm", false}, {"en", "uh-huh", false},
		{"en", "Uh?", false}, {"en", "Um!", false}, {"en", `"uh"`, false},
		{"en", "'um'", false}, {"en", "UH", false}, {"en", "uh 🙂", false},
		{"en", "Um, no, I might come.", false}, {"en", "umbrella", false},
	} {
		t.Run(string(tc.lang)+"/"+tc.text, func(t *testing.T) {
			if got := nonSemanticHesitationOnly(tc.text, tc.lang); got != tc.omit {
				t.Fatalf("omit=%v want=%v", got, tc.omit)
			}
		})
	}
}

func TestHesitationNLPGroupsMergeWithoutChangingSourcePositions(t *testing.T) {
	parts := []string{"Uh, um,", "I might come,", "erm, uh."}
	source := pairedTranslationSource{ID: "7", Text: strings.Join(parts, " "), NLPSourceHint: parts}
	sentence, err := sourceSegmentedSentence(source, "en")
	if err != nil || len(sentence.SegmentState.Units) != 1 {
		t.Fatalf("sentence=%+v err=%v", sentence, err)
	}
	unit := sentence.SegmentState.Units[0]
	if unit.Source != source.Text || unit.Start != 0 || unit.End != len(source.Text) || strings.Join(unit.OriginIDs, ",") != "7.1,7.2,7.3" {
		t.Fatalf("source position/coverage lost: %+v", unit)
	}
	// 同形词在其他源语言中有实义，不能按英语词表处理。
	other, err := sourceSegmentedSentence(pairedTranslationSource{ID: "1", Text: "um das Haus", NLPSourceHint: []string{"um", "das Haus"}}, "de")
	if err != nil || len(other.SegmentState.Units) != 2 {
		t.Fatalf("German preposition was treated as filler: %+v %v", other, err)
	}
}

func TestHesitationOmissionPreservesTimingAndResumesBothFlows(t *testing.T) {
	for _, segmented := range []bool{false, true} {
		t.Run(fmt.Sprint(segmented), func(t *testing.T) {
			texts := []string{"Uh, um.", "We might go.", "Erm, uh, um.", "No, we cannot go.", "Um."}
			blocks := make([]*util.SrtBlock, len(texts))
			for i, text := range texts {
				blocks[i] = &util.SrtBlock{Index: i + 1, Timestamp: formatSRTTimeline(int64(i*2000), int64(i*2000+1000)), OriginLanguageSentence: text}
			}
			calls := 0
			translator := &Translator{segmentTranslation: segmented, checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts}}
			target := func(s string) string {
				if s == texts[1] {
					return "我们可能会去。"
				}
				if s == texts[3] {
					return "不，我们不能去。"
				}
				t.Fatalf("filler-only source sent to model: %q", s)
				return ""
			}
			translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				calls++
				if !strings.Contains(prompt, translationFillerPolicy) || translator.filterNonSemanticFillers {
					t.Fatal("default cleanup policy missing")
				}
				if segmented {
					input := segmentTestInput(t, prompt)
					if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
						return segmentTestReview(input, []segmentReviewIssue{}), nil
					}
					return segmentTestResponse(input, strings.HasPrefix(prompt, "任务：translation_segment_faithful\n"), target), nil
				}
				var input translationContentInput
				if err := json.NewDecoder(strings.NewReader(strings.Split(prompt, "输入 JSON：\n")[1])).Decode(&input); err != nil {
					return "", err
				}
				var output pairedTranslationOutput
				for _, source := range input.Sentences {
					output.Sentences = append(output.Sentences, pairedTranslationOutputSentence{ID: source.ID, FullTarget: target(source.Text)})
				}
				data, _ := json.Marshal(output)
				return string(data), nil
			})
			for repeat := 0; repeat < 2; repeat++ {
				output, err := translator.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "zh_cn", nil)
				if err != nil || len(output) != 2 {
					t.Fatalf("output=%+v err=%v", output, err)
				}
				for i, sourceIndex := range []int{1, 3} {
					if output[i].Index != i+1 || output[i].Timestamp != blocks[sourceIndex].Timestamp || output[i].OriginLanguageSentence != texts[sourceIndex] || output[i].TargetLanguageSentence != target(texts[sourceIndex]) {
						t.Fatalf("omitted speech shifted timing or meaning: %+v", output[i])
					}
				}
			}
			wantCalls := 1
			if segmented {
				wantCalls = 3
			}
			if calls != wantCalls {
				t.Fatalf("unnecessary generation/recovery calls: got=%d want=%d", calls, wantCalls)
			}
		})
	}
}

func TestHesitationCandidateValidationAndRecovery(t *testing.T) {
	translator := &Translator{}
	for _, tc := range []struct {
		source, target, sourceLang, targetLang string
		valid                                  bool
	}{
		{"Um, no, I might come.", "呃，不，我可能会来。", "en", "zh_cn", false},
		{"I'm, uh, not sure.", "呃，我不确定。", "en", "zh_cn", false},
		{"Uh, um, I might come.", "呃呃，我可能会来。", "en", "zh_cn", false},
		{"Um, no, I might come.", "不，我可能会来。", "en", "zh_cn", true},
		{"Um, yes.", "嗯，是的。", "en", "zh_cn", true},
		{"Um, mm-hmm, yes.", "嗯嗯，是的。", "en", "zh_cn", true},
		{`Say "uh" twice.`, `把“呃”说两遍。`, "en", "zh_cn", true},
		{"We meet at five.", "Wir treffen uns um fünf.", "en", "de", true},
	} {
		if got := !translationHasHesitationLeak(tc.source, tc.target, types.StandardLanguageCode(tc.sourceLang), types.StandardLanguageCode(tc.targetLang)); got != tc.valid {
			t.Errorf("%q -> %q: valid=%v want=%v", tc.source, tc.target, got, tc.valid)
		}
	}
	if !hasUsableTranslation("呃，我不确定。") || len(translationQualityHints("I'm, uh, not sure.", "呃，我不确定。", "en", "zh_cn")) == 0 {
		t.Fatal("发声残留应保留为初译并提示审校，不能阻断初译")
	}
	// 缓存里的省略标志不能成为跳过有实义句子的凭据。
	_, ok := translator.recoverPairedSentence(pairedSentence{ID: "1", FullTarget: "我们去吧。", OmittedHesitation: true}, pairedTranslationSource{ID: "1", Text: "Let's go."}, "en", "zh_cn")
	if ok {
		t.Fatal("untrusted cached omission accepted")
	}
}

func TestHesitationEmptySegmentsRequireExactFillerSource(t *testing.T) {
	parts := []string{strings.TrimSpace(strings.Repeat("uh ", 23)), "I might come."}
	source := pairedTranslationSource{ID: "1", Text: strings.Join(parts, " "), NLPSourceHint: parts}
	sentence, err := sourceSegmentedSentence(source) // 模拟长串在75重拆后成为独立段。
	if err != nil {
		t.Fatal(err)
	}
	sentence.SegmentState.Stage = "reviewed"
	sentence.SegmentState.Units[1].Direct = "我可能会来。"
	sentence.SegmentState.Units[1].Target = "我可能会来。"
	translator := &Translator{segmentTranslation: true}
	if err := translator.validateSegmentedSentence(sentence, source, "en", "zh_cn"); err != nil {
		t.Fatal(err)
	}
	sentence = materializeSegmentedSentence(sentence, "zh_cn")
	items := flattenPairedSentences([]pairedSentence{sentence})
	if len(items) != 1 || items[0].OriginText != parts[1] || items[0].TranslatedText != "我可能会来。" || pairedFinalLengthIssue(sentence) != nil {
		t.Fatalf("empty filler segment leaked or overflowed: %+v", items)
	}
	sentence.SegmentState.Units[1].Target = ""
	if translator.validateSegmentedSentence(sentence, source, "en", "zh_cn") == nil {
		t.Fatal("meaningful source allowed an empty target")
	}
}

func TestHesitationOnlyInputDoesNotInventSubtitle(t *testing.T) {
	texts := []string{"Uh, um, erm..."}
	translator := &Translator{preparedTranslation: &preparedTranslationContext{Texts: texts}, chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		t.Fatal("filler-only input requested translation")
		return "", nil
	})}
	_, err := translator.BatchTranslateSrtBlocks(context.Background(), []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:02,000", OriginLanguageSentence: texts[0]}}, "en", "zh_cn", nil)
	if err == nil || !strings.Contains(err.Error(), "没有需要翻译的正文") {
		t.Fatalf("unexpected result: %v", err)
	}
}

func TestHesitationDoesNotReturnAfterFinalLengthSplit(t *testing.T) {
	parts := []string{strings.TrimSpace(strings.Repeat("uh ", 24)), "I might come tomorrow."}
	text := strings.Join(parts, " ")
	source := pairedTranslationSource{ID: "1", Text: text}
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 65, Sentences: []pairedTranslationSource{source}}
	parent, err := sourceSegmentedSentence(source, "en")
	if err != nil {
		t.Fatal(err)
	}
	parent.SegmentState.Stage = "expressive"
	parent.SegmentState.Units[0].Direct = "我可能明天会来。"
	parent.SegmentState.Units[0].Target = "我可能明天会来。"
	parents := map[string]pairedSentence{"1": materializeSegmentedSentence(parent, "zh_cn")}
	translator := &Translator{nlpBoundaryChecker: segmentTestLLMBoundaryChecker}
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if !strings.Contains(prompt, translationFillerPolicy) {
			t.Fatal("split/review lost cleanup policy")
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			data, _ := json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": "1.1", "segments": []any{map[string]string{"source": parts[0]}, map[string]string{"source": parts[1]}}}}})
			return string(data), nil
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_split\n") {
			// 故意模拟模型为纯发声补出“呃”，代码必须在发布前抑制它。
			data, _ := json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": "1.1", "segments": []any{map[string]string{"source": parts[0], "target_text": "呃"}, map[string]string{"source": parts[1], "target_text": "我可能明天会来。"}}}}})
			return string(data), nil
		}
		return segmentTestReview(segmentTestInput(t, prompt), []segmentReviewIssue{}), nil
	})
	err = translator.splitSegmentOverflows(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	result := parents["1"]
	if result.SegmentState.Stage != "reviewed" || len(result.Target) != 2 || result.Target[0] != "" || result.FullTarget != "我可能明天会来。" || pairedFinalLengthIssue(result) != nil {
		t.Fatalf("filler returned after split: %+v", result)
	}
	for _, unit := range result.SegmentState.Units {
		if text[unit.Start:unit.End] != unit.Source {
			t.Fatal("source byte mapping changed")
		}
	}
}
