package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/internal/types"
	"strings"
	"testing"
)

func TestContentPayloadSharesContextWithoutDisplayConstraints(t *testing.T) {
	for _, tc := range []struct {
		lang types.StandardLanguageCode
		text string
	}{
		{"en", "I read books, but not always to the end."},
		{"zh_cn", "我喜欢读书，但不一定每本都读完。"},
		{"ja", "本は好きですが、いつも最後まで読むわけではありません。"},
		{"es", "Me gusta leer, pero no siempre termino los libros."},
		{"ar", "أحب القراءة، لكنني لا أنهي كل كتاب."},
	} {
		t.Run(string(tc.lang), func(t *testing.T) {
			texts := []string{"Before.", tc.text, "After."}
			groups, err := buildPairedTranslationBatches(texts, tc.lang, "zh_cn", 65, 1)
			if err != nil {
				t.Fatal(err)
			}
			payload := contentTranslationInput(groups[1])
			data, _ := json.Marshal(payload)
			if len(payload.Before) != 1 || len(payload.After) != 1 || len(payload.Sentences) != 1 || payload.Sentences[0].Text != tc.text {
				t.Fatalf("context lost: %+v", payload)
			}
			for _, key := range []string{"max_target_display_units", "max_source_display_units", "nlp_segments_hint", "source_segments_hint", "target_text"} {
				if strings.Contains(string(data), `"`+key+`"`) {
					t.Fatalf("layout leaked into content: %s", key)
				}
			}
			if len(groups[1].Sentences[0].Before) > 0 || len(groups[1].Sentences[0].After) > 0 {
				t.Fatal("context repeated per sentence")
			}
		})
	}
}

func TestContentRetryKeepsAcceptedSentencesAndReportsDuplicateIDs(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", Sentences: []pairedTranslationSource{{ID: "1", Text: "First."}, {ID: "2", Text: "Second."}}}
	calls := 0
	saved := make(map[string]int)
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		var payload translationContentInput
		if err := json.NewDecoder(strings.NewReader(strings.Split(prompt, "输入 JSON：\n")[1])).Decode(&payload); err != nil {
			return "", err
		}
		if calls == 1 {
			return `{"sentences":[{"sentence_id":"1","target_text":"第一句。"},{"sentence_id":"2","target_text":"第二句。"},{"sentence_id":"2","target_text":"重复。"}]}`, nil
		}
		if len(payload.Sentences) != 1 || payload.Sentences[0].ID != "2" || !strings.Contains(prompt, "句子2缺失或ID重复") {
			t.Fatal("accepted sentence retried or error omitted")
		}
		return `{"sentences":[{"sentence_id":"2","target_text":"第二句。"}]}`, nil
	})}
	remaining, err := translator.translateContentBatch(context.Background(), input, "en", "zh_cn", func(sentence pairedSentence, _ bool) error {
		saved[sentence.ID]++
		if sentence.FullSource == "" || sentence.DraftTarget != sentence.FullTarget {
			t.Fatal("draft not preserved")
		}
		return nil
	})
	if err != nil || len(remaining.Sentences) > 0 || calls != 2 || saved["1"] != 1 || saved["2"] != 1 {
		t.Fatalf("remaining=%+v saved=%v calls=%d err=%v", remaining, saved, calls, err)
	}
}

func TestContentShortSentenceNeedsNoLayoutRequestAndResumes(t *testing.T) {
	texts := []string{"I read books."}
	calls := 0
	translator := &Translator{checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if !strings.HasPrefix(prompt, "任务：translation_content\n") {
			t.Fatal("short sentence triggered extra model phase")
		}
		return `{"sentences":[{"sentence_id":"1","target_text":"我读书。"}]}`, nil
	})}
	for _, limit := range []int{65, 75} {
		got, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", limit, 10, nil)
		if err != nil || len(got) != 1 || calls != 1 || got[0].DraftTarget != "我读书。" || got[0].LayoutFallback {
			t.Fatalf("got=%+v calls=%d err=%v", got, calls, err)
		}
	}
}

func TestContentCancellationPreservesPartialProgress(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", Sentences: []pairedTranslationSource{{ID: "1", Text: "First."}, {ID: "2", Text: "Second."}}}
	calls, saved := 0, 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		calls++
		if calls > 1 {
			cancel()
			return "", context.Canceled
		}
		return `{"sentences":[{"sentence_id":"1","target_text":"第一句。"}]}`, nil
	})}
	_, err := translator.translateContentBatch(ctx, input, "en", "zh_cn", func(pairedSentence, bool) error { saved++; return nil })
	if !errors.Is(err, context.Canceled) || saved != 1 {
		t.Fatalf("saved=%d err=%v", saved, err)
	}
}

func TestRevisionRequiresOriginalVerificationAndKeepsDraft(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", Sentences: []pairedTranslationSource{{ID: "1", Text: "It serves a utilitarian purpose."}}}
	for _, reject := range []bool{false, true} {
		accepted := map[string]pairedSentence{"1": {ID: "1", FullSource: input.Sentences[0].Text, FullTarget: "它发挥着实用主义的作用。"}}
		calls := 0
		translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
			calls++
			if strings.HasPrefix(prompt, "任务：translation_revision_verify\n") {
				if reject {
					return `{"accepted_ids":[],"reason":"修订添加了原文没有的信息。"}`, nil
				}
				return `{"accepted_ids":["1"],"reason":"原文是实际用途，修订纠正了词义，没有改变事实。"}`, nil
			}
			return `{"corrections":[{"sentence_id":"1","reason":"这里指实际用途，不是哲学学派","target_text":"它有实用价值。"}]}`, nil
		})}
		err := translator.reviseContentBatch(context.Background(), input, accepted, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
		if reject {
			if err == nil || accepted["1"].FullTarget != "它发挥着实用主义的作用。" || accepted["1"].RevisionVersion != "" {
				t.Fatal("unverified revision accepted")
			}
			continue
		}
		if err != nil || accepted["1"].FullTarget != "它有实用价值。" || accepted["1"].DraftTarget != "它发挥着实用主义的作用。" || accepted["1"].RevisionVersion == "" || !accepted["1"].SemanticReviewed {
			t.Fatalf("revision=%+v err=%v", accepted, err)
		}
		if err := translator.reviseContentBatch(context.Background(), input, accepted, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil || calls != 2 {
			t.Fatal("completed revision repeated")
		}
	}
}

func TestRevisionRetriesOnlyRejectedChangesAndPersistsVerifiedPeers(t *testing.T) {
	for _, rejectAgain := range []bool{false, true} {
		t.Run(map[bool]string{false: "recovers", true: "preserves_on_failure"}[rejectAgain], func(t *testing.T) {
			input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", Sentences: []pairedTranslationSource{{ID: "1", Text: "I read books."}, {ID: "2", Text: "I read poems."}, {ID: "3", Text: "I read essays."}}}
			accepted := make(map[string]pairedSentence)
			for _, s := range input.Sentences {
				accepted[s.ID] = pairedSentence{ID: s.ID, FullSource: s.Text, FullTarget: "初译" + s.ID + "。"}
			}
			revisions, verifications := 0, 0
			saved := make(map[string]int)
			translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				if strings.HasPrefix(prompt, "任务：translation_revision_verify\n") {
					verifications++
					if verifications == 1 {
						return `{"accepted_ids":["1"],"reason":"句1忠实；句2遗漏诗歌这一对象。"}`, nil
					}
					if rejectAgain {
						return `{"accepted_ids":[],"reason":"句2仍遗漏对象。"}`, nil
					}
					return `{"accepted_ids":["2"],"reason":"句2完整保留阅读诗歌。"}`, nil
				}
				revisions++
				if revisions == 1 {
					return `{"corrections":[{"sentence_id":"1","reason":"自然表达","target_text":"我读书。"},{"sentence_id":"2","reason":"自然表达","target_text":"我阅读。"}]}`, nil
				}
				var payload struct {
					Sentences []translationRevisionSentence `json:"sentences"`
				}
				if err := json.Unmarshal([]byte(strings.Split(prompt, "输入 JSON：\n")[1]), &payload); err != nil {
					t.Fatal(err)
				}
				if len(payload.Sentences) != 1 || payload.Sentences[0].ID != "2" || !strings.Contains(prompt, "遗漏诗歌") || saved["1"] != 1 || saved["3"] != 1 {
					t.Fatalf("verified peers not saved or retried: payload=%+v saved=%v", payload, saved)
				}
				return `{"corrections":[{"sentence_id":"2","reason":"保留对象","target_text":"我读诗。"}]}`, nil
			})}
			err := translator.reviseContentBatch(context.Background(), input, accepted, "en", "zh_cn", func(s pairedSentence, _ bool) error { saved[s.ID]++; return nil })
			if (err != nil) != rejectAgain || revisions != 2 || verifications != 2 || saved["1"] != 1 || saved["3"] != 1 || accepted["1"].FullTarget != "我读书。" || !accepted["1"].SemanticReviewed {
				t.Fatalf("err=%v revisions=%d verifications=%d saved=%v accepted=%+v", err, revisions, verifications, saved, accepted)
			}
			if rejectAgain {
				if saved["2"] != 0 || accepted["2"].RevisionVersion != "" || accepted["2"].SemanticReviewed || accepted["2"].FullTarget != "初译2。" {
					t.Fatal("rejected revision was accepted")
				}
			} else if saved["2"] != 1 || accepted["2"].FullTarget != "我读诗。" || !accepted["2"].SemanticReviewed {
				t.Fatal("verified retry not accepted")
			}
		})
	}
}
