package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
	"testing"
)

func segmentTestInput(t *testing.T, prompt string) segmentRequest {
	t.Helper()
	var value segmentRequest
	if err := json.NewDecoder(strings.NewReader(strings.Split(prompt, "输入 JSON：\n")[1])).Decode(&value); err != nil {
		t.Fatal(err)
	}
	if _, schema, ok := strings.Cut(prompt, segmentEditorSchemaMarker); ok {
		var lines map[string]segmentEditorLine
		if err := json.NewDecoder(strings.NewReader(schema)).Decode(&lines); err != nil {
			t.Fatal(err)
		}
		for i := range value.Parents {
			for j := range value.Parents[i].Units {
				unit := &value.Parents[i].Units[j]
				unit.Source, unit.Direct = lines[unit.ID].Origin, lines[unit.ID].Direct
			}
		}
	}
	return value
}
func segmentTestResponse(input segmentRequest, faithful bool, target func(string) string) string {
	var sentences []any
	for _, parent := range input.Parents {
		var units []any
		for _, unit := range parent.Units {
			key := "target_text"
			if faithful {
				key = "direct"
			}
			units = append(units, map[string]any{"segment_id": unit.ID, key: target(unit.Source)})
		}
		sentences = append(sentences, map[string]any{"sentence_id": parent.ID, "segments": units})
	}
	data, _ := json.Marshal(map[string]any{"sentences": sentences})
	return string(data)
}
func segmentTestReview(input segmentRequest, issues []segmentReviewIssue) string {
	ids := []string{}
	for _, p := range input.Parents {
		ids = append(ids, p.ID)
	}
	data, _ := json.Marshal(map[string]any{"checked_ids": ids, "issues": issues})
	return string(data)
}
func TestSegmentedParentContextStableMultilingualIDsAndResume(t *testing.T) {
	for _, tc := range []struct {
		lang   types.StandardLanguageCode
		parts  []string
		target types.StandardLanguageCode
	}{
		{"en", []string{"I like books,", "but not all of them."}, "zh_cn"},
		{"ja", []string{"本が好きですが、", "全部ではありません。"}, "zh_cn"},
		{"es", []string{"Me gustan los libros,", "pero no todos."}, "zh_cn"},
		{"zh_cn", []string{"我喜欢读书，", "但不是所有书。"}, "ja"},
	} {
		t.Run(string(tc.lang), func(t *testing.T) {
			text := strings.Join(tc.parts, " ")
			if tc.lang == "ja" || tc.lang == "zh_cn" {
				text = strings.Join(tc.parts, "")
			}
			texts := []string{text}
			calls := []string{}
			translator := &Translator{segmentTranslation: true, checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts, NLPHints: [][]string{tc.parts}}}
			translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				phase := strings.Split(prompt, "\n")[0]
				calls = append(calls, phase)
				input := segmentTestInput(t, prompt)
				if len(input.Parents) != 1 || !subtitleSegmentsPreserveText(text, segmentTestSources(input.Parents[0])) || len(input.Parents[0].Units) != 2 {
					t.Fatalf("parent context lost: %+v", input)
				}
				for i, unit := range input.Parents[0].Units {
					if unit.ID != "1."+string(rune('1'+i)) || unit.Source != tc.parts[i] {
						t.Fatal("unstable ID or source position")
					}
				}
				if strings.Contains(phase, "review") {
					return segmentTestReview(input, []segmentReviewIssue{}), nil
				}
				return segmentTestResponse(input, strings.Contains(phase, "faithful"), func(s string) string {
					if tc.target == "ja" {
						return "本が好きです。"
					}
					if s == tc.parts[0] {
						return "我喜欢书，"
					}
					return "但不是所有书。"
				}), nil
			})
			for repeat := 0; repeat < 2; repeat++ {
				got, err := translator.translatePairedSentences(context.Background(), texts, tc.lang, tc.target, 65, 10, nil)
				if err != nil || len(got) != 1 || len(got[0].Source) != 2 || got[0].SegmentState.Stage != "reviewed" {
					t.Fatalf("got=%+v err=%v", got, err)
				}
			}
			want := []string{"任务：translation_segment_faithful", "任务：translation_segment_expressive", "任务：translation_segment_review"}
			if !slices.Equal(calls, want) {
				t.Fatalf("unexpected phases or repeated cached calls: %v", calls)
			}
		})
	}
}

func TestSegmentedReviewRepairsOnlyFailedParentAndChecksMeaningAgain(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "Simplified Chinese", MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: "I read fiction and nonfiction."}, {ID: "2", Text: "I like books."}}}
	repairs, reviews := 0, 0
	saved := map[string]pairedSentence{}
	translator := &Translator{segmentTranslation: true, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		payload := segmentTestInput(t, prompt)
		if strings.Contains(strings.Split(prompt, "\n")[0], "review") {
			reviews++
			if reviews == 1 {
				return segmentTestReview(payload, []segmentReviewIssue{{ID: "1", SegmentIDs: []string{"1.1"}, Reason: "nonfiction omitted from 我读小说。"}}), nil
			}
			if len(payload.Parents) != 1 || payload.Parents[0].ID != "1" || payload.Parents[0].Units[0].Target != "我读小说和非虚构作品。" {
				t.Fatal("passing parent rechecked or fix not reviewed")
			}
			return segmentTestReview(payload, []segmentReviewIssue{}), nil
		}
		if payload.Parents[0].Issue != "" {
			repairs++
			if len(payload.Parents) != 1 || payload.Parents[0].ID != "1" {
				t.Fatal("passing parent retried")
			}
			return segmentTestResponse(payload, false, func(string) string { return "我读小说和非虚构作品。" }), nil
		}
		return segmentTestResponse(payload, strings.Contains(prompt, "任务：translation_segment_faithful\n"), func(s string) string {
			if strings.Contains(s, "fiction") {
				return "我读小说。"
			}
			return "我喜欢书。"
		}), nil
	})}
	err := translator.completeSegmentedBatch(context.Background(), input, nil, "en", "zh_cn", func(s pairedSentence, complete bool) error {
		if complete {
			if s.SegmentState.Stage != "reviewed" {
				t.Fatal("unreviewed candidate published")
			}
			saved[s.ID] = s
		}
		return nil
	})
	if err != nil || repairs != 1 || reviews != 2 || len(saved) != 2 {
		t.Fatalf("repairs=%d reviews=%d saved=%v err=%v", repairs, reviews, saved, err)
	}
}

func TestSegmentedPartialFormatFailureKeepsSuccessAndAcceptsTextAlias(t *testing.T) {
	input := pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: "First."}, {ID: "2", Text: "Second."}}}
	parents := map[string]pairedSentence{}
	for _, source := range input.Sentences {
		parents[source.ID], _ = sourceSegmentedSentence(source)
	}
	calls := 0
	saved := []string{}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		payload := segmentTestInput(t, prompt)
		if calls == 1 {
			return `{"sentences":[{"sentence_id":"1","segments":[{"segment_id":"1.1","text":"第一句。"}]},{"sentence_id":"2","segments":[{"segment_id":"WRONG","direct":"第二句。"}]}]}`, nil
		}
		if len(payload.Parents) != 1 || payload.Parents[0].ID != "2" {
			t.Fatal("valid parent retried")
		}
		return `{"sentences":[{"sentence_id":"2","segments":[{"segment_id":"2.1","direct":"第二句。"}]}]}`, nil
	})}
	err := translator.generateSegmentTranslations(context.Background(), input, parents, true, "en", "zh_cn", func(s pairedSentence, _ bool) error { saved = append(saved, s.ID); return nil })
	if err != nil || calls != 2 || !slices.Equal(saved, []string{"1", "2"}) {
		t.Fatalf("saved=%v calls=%d err=%v", saved, calls, err)
	}
}

func TestSegmentedCancelResumesFromFaithfulWithoutRepeatingIt(t *testing.T) {
	texts := []string{"I read books."}
	ctx, cancel := context.WithCancel(context.Background())
	calls := []string{}
	translator := &Translator{segmentTranslation: true, checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts}}
	cancelled := false
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		phase := strings.Split(prompt, "\n")[0]
		calls = append(calls, phase)
		payload := segmentTestInput(t, prompt)
		if strings.Contains(phase, "expressive") && !cancelled {
			cancelled = true
			cancel()
			return "", context.Canceled
		}
		if strings.Contains(phase, "review") {
			return segmentTestReview(payload, []segmentReviewIssue{}), nil
		}
		return segmentTestResponse(payload, strings.Contains(phase, "faithful"), func(string) string { return "我读书。" }), nil
	})
	_, err := translator.translatePairedSentences(ctx, texts, "en", "zh_cn", 65, 10, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	got, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 65, 10, nil)
	if err != nil || len(got) != 1 || len(calls) != 4 || strings.Count(strings.Join(calls, " "), "faithful") != 1 {
		t.Fatalf("calls=%v err=%v", calls, err)
	}
}

func TestSegmentedOverflowRewritesImmediatelyAndRechecksWholeParent(t *testing.T) {
	parts := []string{"I keep a book about the history of modern philosophy beside my bed,", "and I read it every evening."}
	text := strings.Join(parts, " ")
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "Simplified Chinese", MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: text, NLPSourceHint: parts}}}
	parent, _ := sourceSegmentedSentence(input.Sentences[0])
	parent.SegmentState.Stage = "reviewed"
	parent.SegmentState.Units[0].Direct = "我床边放着一本关于现代哲学历史的书。"
	parent.SegmentState.Units[0].Target = strings.Repeat("很长的译文", 8) + "。"
	parent.SegmentState.Units[1].Direct = "我每晚都读。"
	parent.SegmentState.Units[1].Target = "我每晚都读。"
	parent = materializeSegmentedSentence(parent, "zh_cn")
	parents := map[string]pairedSentence{"1": parent}
	split, review := 0, 0
	translator := &Translator{nlpBoundaryChecker: segmentTestLLMBoundaryChecker, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"I keep a book about the history of modern philosophy"},{"source":"beside my bed,"}]}]}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_split\n") {
			split++
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"I keep a book about the history of modern philosophy","target_text":"我放了一本现代哲学史的书，"},{"source":"beside my bed,","target_text":"就在床边，"}]}]}`, nil
		}
		review++
		payload := segmentTestInput(t, prompt)
		if len(payload.Parents) != 1 || !subtitleSegmentsPreserveText(text, segmentTestSources(payload.Parents[0])) || len(payload.Parents[0].Units) != 3 || payload.Parents[0].Units[2].Target != "我每晚都读。" {
			t.Fatal("partial candidate reviewed without complete parent")
		}
		return segmentTestReview(payload, []segmentReviewIssue{}), nil
	})}
	err := translator.splitSegmentOverflows(context.Background(), input, parents, "en", "zh_cn", func(s pairedSentence, complete bool) error {
		if complete && s.SegmentState.Stage != "reviewed" {
			t.Fatal("unreviewed split published")
		}
		return nil
	})
	if err != nil || split != 1 || review != 1 || len(parents["1"].Source) != 3 || parents["1"].Source[2] != parts[1] {
		t.Fatalf("split=%d review=%d err=%v", split, review, err)
	}
	for _, unit := range parents["1"].SegmentState.Units {
		if text[unit.Start:unit.End] != unit.Source {
			t.Fatal("word time mapping positions changed")
		}
	}
}

func TestSegmentedRejectsUnreviewedOutputAndLegacyCheckpoint(t *testing.T) {
	input := pairedTranslationInput{MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: "I read books."}}}
	translator := &Translator{segmentTranslation: true, checkpointDir: t.TempDir(), chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		payload := segmentTestInput(t, prompt)
		if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
			return `{"checked_ids":[],"issues":[]}`, nil
		}
		return segmentTestResponse(payload, strings.Contains(prompt, "任务：translation_segment_faithful\n"), func(string) string { return "我读书。" }), nil
	})}
	complete := false
	err := translator.completeSegmentedBatch(context.Background(), input, nil, "en", "zh_cn", func(_ pairedSentence, ok bool) error { complete = complete || ok; return nil })
	if err == nil || complete {
		t.Fatal("unreviewed output accepted")
	}
	legacy := *translator
	legacy.segmentTranslation = false
	a, _ := translator.openTranslationCheckpoint([]string{"I read books."}, "en", "zh_cn")
	b, _ := legacy.openTranslationCheckpoint([]string{"I read books."}, "en", "zh_cn")
	if a.dir == b.dir {
		t.Fatal("new flow reuses legacy review flags")
	}
}

func TestSegmentedOverflowRetryGivesMeasuredEvidenceAndKeepsValidPairs(t *testing.T) {
	text := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	source := pairedTranslationSource{ID: "1", Text: text}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "reviewed"
	parent.SegmentState.Units[0].Direct = "因为他们的思想历久弥新，谈论当代道德。"
	parent.SegmentState.Units[0].Target = parent.SegmentState.Units[0].Direct
	parent = materializeSegmentedSentence(parent, "zh_cn")
	parents := map[string]pairedSentence{"1": parent}
	input := pairedTranslationInput{MaxTargetChars: 65, Sentences: []pairedTranslationSource{source}}
	cuts, aligns := 0, 0
	translator := &Translator{nlpBoundaryChecker: segmentTestLLMBoundaryChecker, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
			return segmentTestReview(segmentTestInput(t, prompt), []segmentReviewIssue{}), nil
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			cuts++
			if cuts == 1 {
				return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"because they are timeless and they speak in very general philosophical terms"},{"source":"about contemporary morals,"}]}]}`, nil
			}
			if !strings.Contains(prompt, "source=76 target=") || !strings.Contains(prompt, "Choose an earlier natural cut") {
				t.Fatal("missing source-cut feedback")
			}
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"because they are timeless"},{"source":"and they speak in very general philosophical terms"},{"source":"about contemporary morals,"}]}]}`, nil
		}
		aligns++
		if !strings.Contains(prompt, `"source_parts":["because they are timeless","and they speak in very general philosophical terms","about contemporary morals,"]`) {
			t.Fatal("alignment lacks fixed cuts")
		}
		return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"because they are timeless","target_text":"因为他们的思想历久弥新，"},{"source":"and they speak in very general philosophical terms","target_text":"并从宏观的哲学角度"},{"source":"about contemporary morals,","target_text":"谈论当代道德，"}]}]}`, nil
	})}
	if err := translator.splitSegmentOverflows(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil || cuts != 2 || aligns != 1 || pairedFinalLengthIssue(parents["1"]) != nil {
		t.Fatalf("cuts=%d aligns=%d err=%v", cuts, aligns, err)
	}
}

// 真实繁中译英文失败形态：模型反复保留137字符的引文译文。
func TestSegmentedOverflowRefinesOnlyRepeatedOverlongChild(t *testing.T) {
	parts := []string{"第二﹐立傳的通例﹐開首大抵該是", "“某﹐字某﹐某地人也”﹐", "而我並不知道阿Ｑ姓什麼。"}
	source := pairedTranslationSource{ID: "1", Text: strings.Join(parts, "")}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "expressive"
	long := "Second, the usual way to begin a biography is something like “So-and-so, courtesy name such-and-such, a native of such-and-such a place”—"
	parent.SegmentState.Units[0].Direct = long + "but I don't even know Ah Q's surname."
	parent.SegmentState.Units[0].Target = parent.SegmentState.Units[0].Direct
	parent = materializeSegmentedSentence(parent, "en")
	parents := map[string]pairedSentence{"1": parent}
	input := pairedTranslationInput{SourceLanguage: "Traditional Chinese", TargetLanguage: "English", MaxTargetChars: 65, Sentences: []pairedTranslationSource{source}}
	splits, reviews := 0, 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
			reviews++
			payload := segmentTestInput(t, prompt)
			if len(payload.Parents) != 1 || len(payload.Parents[0].Units) != 3 {
				t.Fatal("final complete parent not reviewed")
			}
			for _, unit := range payload.Parents[0].Units {
				if subtitleTargetLength(unit.Source) > 75 || subtitleTargetLength(unit.Target) > 75 {
					t.Fatal("overlong intermediate candidate sent to review")
				}
			}
			return segmentTestReview(payload, []segmentReviewIssue{}), nil
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			var payload struct {
				Requests []segmentOverflow `json:"requests"`
			}
			json.NewDecoder(strings.NewReader(strings.Split(prompt, "输入 JSON：\n")[1])).Decode(&payload)
			req := payload.Requests[0]
			ps := []string{parts[0] + parts[1], parts[2]}
			if splits >= 2 {
				ps = []string{parts[0], parts[1]}
			}
			segments := []map[string]string{}
			for _, p := range ps {
				segments = append(segments, map[string]string{"source": p})
			}
			data, _ := json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": req.ID, "segments": segments}}})
			return string(data), nil
		}
		splits++
		var payload struct {
			Requests []segmentOverflow `json:"requests"`
		}
		if err := json.Unmarshal([]byte(strings.Split(prompt, "输入 JSON：\n")[1]), &payload); err != nil {
			t.Fatal(err)
		}
		if len(payload.Requests) != 1 {
			t.Fatal("unexpected batch")
		}
		req := payload.Requests[0]
		pairs := []map[string]string{{"source": parts[0] + parts[1], "target_text": long}, {"source": parts[2], "target_text": "but I don't even know Ah Q's surname."}}
		if splits == 2 && (req.MinPieces < 3 || !strings.Contains(req.Issue, "hard limit=75")) {
			t.Fatal("missing adaptive measured feedback")
		}
		if splits == 3 {
			if req.Source != parts[0]+parts[1] || req.ID != "1.1.1" {
				t.Fatal("already valid child was retranslated")
			}
			pairs = []map[string]string{{"source": parts[0], "target_text": "Second, biographies usually begin with"}, {"source": parts[1], "target_text": "“So-and-so, courtesy name so-and-so, from such-and-such a place”—"}}
		}
		data, _ := json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": req.ID, "segments": pairs}}})
		return string(data), nil
	})}
	err := translator.splitSegmentOverflows(context.Background(), input, parents, "zh_tw", "en", func(s pairedSentence, complete bool) error {
		if complete && pairedFinalLengthIssue(s) != nil {
			t.Fatal("overlong candidate published")
		}
		return nil
	})
	if err != nil || splits != 3 || reviews != 1 || len(parents["1"].Source) != 3 || pairedFinalLengthIssue(parents["1"]) != nil {
		t.Fatalf("splits=%d reviews=%d err=%v", splits, reviews, err)
	}
	for _, u := range parents["1"].SegmentState.Units {
		if source.Text[u.Start:u.End] != u.Source || !slices.Equal(u.OriginIDs, []string{"1.1"}) {
			t.Fatal("source provenance lost")
		}
	}
}

func TestSegmentedRecoveryRejectsCorruptPositionAndEmptyTarget(t *testing.T) {
	source := pairedTranslationSource{ID: "1", Text: "I read books."}
	sentence, _ := sourceSegmentedSentence(source)
	sentence.SegmentState.Stage = "reviewed"
	sentence.SegmentState.Units[0].Direct = "我读书。"
	sentence.SegmentState.Units[0].Target = "我读书。"
	translator := &Translator{}
	if _, ok := translator.recoverSegmentedSentence(sentence, source, "en", "zh_cn"); !ok {
		t.Fatal("valid checkpoint rejected")
	}
	sentence.SegmentState.Units[0].Start = 1
	if _, ok := translator.recoverSegmentedSentence(sentence, source, "en", "zh_cn"); ok {
		t.Fatal("corrupt source position reused")
	}
	sentence.SegmentState.Units[0].Start = 0
	sentence.SegmentState.Units[0].Target = source.Text
	if _, ok := translator.recoverSegmentedSentence(sentence, source, "en", "zh_cn"); !ok {
		t.Fatal("已审校的原样文本不应再被字符规则拒绝")
	}
	sentence.SegmentState.Units[0].Target = ""
	if _, ok := translator.recoverSegmentedSentence(sentence, source, "en", "zh_cn"); ok {
		t.Fatal("empty checkpoint reused")
	}
}

func TestSegmentedFailedBoundaryMergePreservesAtomicIDsAndSourcePositions(t *testing.T) {
	input := pairedTranslationInput{MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: "There are uh you know, there's plenty of fiction on the top shelf.", NLPSourceHint: []string{"There are uh you know,", "there's plenty of fiction on the top shelf."}}}}
	parent, _ := sourceSegmentedSentence(input.Sentences[0])
	parent.SegmentState.Stage = "repair"
	parent.SegmentState.Issue = "1.1,1.2: filler-only lead-in, merge these adjacent groups"
	for i := range parent.SegmentState.Units {
		parent.SegmentState.Units[i].Direct = "有，呃，你知道。"
		parent.SegmentState.Units[i].Target = "有，呃，你知道。"
	}
	parents := map[string]pairedSentence{"1": parent}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		return `{"sentences":[{"sentence_id":"1","segments":[{"segment_ids":["1.1","1.2"],"reflect":"合并空洞引导语与实际内容","target_text":"顶层书架上有很多小说。"}]}]}`, nil
	})}
	err := translator.generateSegmentTranslations(context.Background(), input, parents, false, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	got := parents["1"]
	if err != nil || len(got.Source) != 1 || got.Source[0] != input.Sentences[0].Text || !slices.Equal(got.SegmentState.Units[0].OriginIDs, []string{"1.1", "1.2"}) {
		t.Fatalf("got=%+v err=%v", got, err)
	}
	if got.SegmentState.Stage != "expressive" || got.SemanticReviewed {
		t.Fatal("merged candidate skips independent review")
	}
	// 初次表达也可显式合并连续语法块；仍不能改变初译阶段的ID。
	parent.SegmentState.Stage = "faithful"
	parents["1"] = parent
	if err := translator.generateSegmentTranslations(context.Background(), input, parents, false, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil || len(parents["1"].SegmentState.Units) != 1 {
		t.Fatal("explicit initial editing block rejected", err)
	}
	parent.SegmentState.Stage = "source"
	parents["1"] = parent
	if err := translator.generateSegmentTranslations(context.Background(), input, parents, true, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err == nil {
		t.Fatal("faithful draft merged IDs")
	}
}

func TestSegmentedJSONRepairsOnlyMissingClosers(t *testing.T) {
	var result segmentResponse
	good := `{"sentences":[{"sentence_id":"1","segments":[{"segment_id":"1.1","direct":"中文"}]}]`
	if err := decodeSegmentJSON(good, &result); err != nil || len(result.Sentences) != 1 || result.Sentences[0].Segments[0].Direct != "中文" {
		t.Fatal("structural-only repair failed", err)
	}
	for _, bad := range []string{`{"sentences":[{"sentence_id":"1","segments":[{"segment_id":"1.1","direct":"中`, `{"sentences":[{"sentence_id":"1","segments":`, `{"sentences":]}`} {
		if decodeSegmentJSON(bad, &result) == nil {
			t.Fatal("invented missing content", bad)
		}
	}
}

func TestSegmentedRepairedMergeMustPassHardLimitAgain(t *testing.T) {
	text := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	source := pairedTranslationSource{ID: "1", Text: text}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "reviewed"
	parent.SegmentState.Units[0].Direct = "因为他们思想历久弥新，并用哲学语言谈论当代道德，"
	parent.SegmentState.Units[0].Target = parent.SegmentState.Units[0].Direct
	parent = materializeSegmentedSentence(parent, "zh_cn")
	parents := map[string]pairedSentence{"1": parent}
	input := pairedTranslationInput{MaxTargetChars: 65, Sentences: []pairedTranslationSource{source}}
	splits, reviews := 0, 0
	translator := &Translator{nlpBoundaryChecker: segmentTestLLMBoundaryChecker, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_split\n") || strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			var payload struct {
				Requests []segmentOverflow `json:"requests"`
			}
			json.NewDecoder(strings.NewReader(strings.Split(prompt, "输入 JSON：\n")[1])).Decode(&payload)
			cut := strings.HasPrefix(prompt, "任务：translation_segment_cut\n")
			if !cut {
				splits++
			}
			current := splits
			if cut {
				current++
			}
			id := payload.Requests[0].ID
			if current == 2 && !strings.Contains(payload.Requests[0].Issue, "bad old boundary") {
				t.Fatal("lost prior cut failure evidence")
			}
			pieces := []map[string]string{{"source": "because they are timeless and they speak", "target_text": "因为他们思想历久弥新，而且他们谈论"}, {"source": "in very general philosophical terms about contemporary morals,", "target_text": "用宏观的哲学语言谈论当代道德，"}}
			if current == 2 {
				pieces = []map[string]string{{"source": "because they are timeless", "target_text": "因为他们思想历久弥新，"}, {"source": "and they speak in very general philosophical terms", "target_text": "并从宏观的哲学层面探讨，"}, {"source": "about contemporary morals,", "target_text": "当代道德问题，"}}
			}
			data, _ := json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": id, "segments": pieces}}})
			return string(data), nil
		}
		payload := segmentTestInput(t, prompt)
		if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
			reviews++
			if reviews == 1 {
				ids := []string{}
				for _, u := range payload.Parents[0].Units {
					ids = append(ids, u.ID)
				}
				return segmentTestReview(payload, []segmentReviewIssue{{ID: "1", SegmentIDs: ids, Reason: "bad old boundary; change the source cut"}}), nil
			}
			return segmentTestReview(payload, []segmentReviewIssue{}), nil
		}
		ids := []string{}
		for _, u := range payload.Parents[0].Units {
			ids = append(ids, u.ID)
		}
		data, _ := json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": "1", "segments": []any{map[string]any{"segment_ids": ids, "target_text": "因为他们思想历久弥新，并用哲学语言谈论当代道德，"}}}}})
		return string(data), nil
	})}
	err := translator.splitSegmentOverflows(context.Background(), input, parents, "en", "zh_cn", func(s pairedSentence, complete bool) error {
		if complete && pairedFinalLengthIssue(s) != nil {
			t.Fatal("overlong repaired merge published")
		}
		return nil
	})
	if err != nil || splits != 2 || reviews != 3 || pairedFinalLengthIssue(parents["1"]) != nil {
		t.Fatalf("splits=%d reviews=%d err=%v", splits, reviews, err)
	}
}

func segmentTestSources(parent segmentRequestParent) []string {
	var result []string
	for _, u := range parent.Units {
		result = append(result, u.Source)
	}
	return result
}

func TestSegmentedImportedCJKDoesNotInsertSpacesInsideWords(t *testing.T) {
	translator := &Translator{segmentTranslation: true, nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		return translationNLPResult{Unavailable: "test_no_model"}, nil
	}}
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_context\n") {
			return `{"summary":"A speaker reads a book.","terms":[]}`, nil
		}
		payload := segmentTestInput(t, prompt)
		if len(payload.Parents) != 1 || strings.Join(segmentTestSources(payload.Parents[0]), "") != "私は本を読みます。" {
			t.Fatal("cue boundary inserted into Japanese word", payload)
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
			return segmentTestReview(payload, []segmentReviewIssue{}), nil
		}
		return segmentTestResponse(payload, strings.HasPrefix(prompt, "任务：translation_segment_faithful\n"), func(string) string { return "我读书。" }), nil
	})
	got, err := translator.BatchTranslateSrtBlocks(context.Background(), []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: "私は本"}, {Index: 2, Timestamp: "00:00:01,000 --> 00:00:02,000", OriginLanguageSentence: "を読みます。"}}, "ja", "zh_cn", &types.SubtitleTask{})
	if err != nil || len(got) != 1 || got[0].OriginLanguageSentence != "私は本を読みます。" || got[0].Timestamp != "00:00:00,000 --> 00:00:02,000" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
}

func TestSegmentedAuditsFinalOverflowLayoutOnce(t *testing.T) {
	text := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	input := pairedTranslationInput{MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: text}}}
	phases := []string{}
	translator := &Translator{nlpBoundaryChecker: segmentTestLLMBoundaryChecker, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		phase := strings.Split(prompt, "\n")[0]
		phases = append(phases, phase)
		if strings.Contains(phase, "split") || strings.Contains(phase, "cut") {
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"because they are timeless","target_text":"因为他们思想历久弥新，"},{"source":"and they speak in very general philosophical terms","target_text":"并从宏观的哲学层面探讨，"},{"source":"about contemporary morals,","target_text":"当代道德问题，"}]}]}`, nil
		}
		payload := segmentTestInput(t, prompt)
		if strings.Contains(phase, "review") {
			if len(payload.Parents[0].Units) != 3 {
				t.Fatal("audited provisional overlong layout")
			}
			return segmentTestReview(payload, []segmentReviewIssue{}), nil
		}
		return segmentTestResponse(payload, strings.Contains(phase, "faithful"), func(string) string { return "因为他们思想历久弥新，并用哲学语言谈论当代道德，" }), nil
	})}
	if err := translator.completeSegmentedBatch(context.Background(), input, nil, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(phases, []string{"任务：translation_segment_faithful", "任务：translation_segment_expressive", "任务：translation_segment_cut", "任务：translation_segment_split", "任务：translation_segment_review"}) {
		t.Fatal("redundant pre-split review", phases)
	}
}

func TestSegmentedRejectsImplicitMergeAndPreservesOriginal(t *testing.T) {
	input := pairedTranslationInput{MaxTargetChars: 65, Sentences: []pairedTranslationSource{{ID: "1", Text: "Because you need the opportunity to read when it feels right.", NLPSourceHint: []string{"Because you need the opportunity", "to read when it feels right."}}}}
	parent, _ := sourceSegmentedSentence(input.Sentences[0])
	parent.SegmentState.Stage = "repair"
	parent.SegmentState.Issue = "repair boundary"
	for i := range parent.SegmentState.Units {
		parent.SegmentState.Units[i].Direct = "需要阅读。"
		parent.SegmentState.Units[i].Target = "需要阅读。"
	}
	parents := map[string]pairedSentence{"1": parent}
	saves := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		return `{"sentences":[{"sentence_id":"1","segments":[{"segment_id":"1.1","target_text":"因为你需要机会，在感觉合适时阅读。"},{"segment_id":"1.2","target_text":""}]}]}`, nil
	})}
	if err := translator.generateSegmentTranslations(context.Background(), input, parents, false, "en", "zh_cn", func(pairedSentence, bool) error { saves++; return nil }); err == nil || saves != 0 || len(parents["1"].SegmentState.Units) != 2 || parents["1"].SegmentState.Stage != "repair" {
		t.Fatal("implicit merge accepted or original overwritten", err)
	}
}

func TestSegmentedTermCorrectionIsScopedPersistedAndDoesNotMutatePlan(t *testing.T) {
	input := pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: "It has a utilitarian role."}}, SemanticContext: &translationBatchSemanticContext{Terms: []translationSemanticTerm{{Source: "utilitarian", Target: "实用主义的", Meaning: "实际用途", SentenceIDs: []string{"1", "2"}, Kind: "context"}}}}
	parent, _ := sourceSegmentedSentence(input.Sentences[0])
	parent.SegmentState.Stage = "faithful"
	parent.SegmentState.Units[0].Direct = "它有实用主义的作用。"
	parent.SegmentState.Units[0].Target = parent.SegmentState.Units[0].Direct
	parents := map[string]pairedSentence{"1": parent}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		return `{"sentences":[{"sentence_id":"1","term_decisions":[{"source":"utilitarian","target":"实用的","reason":"这里描述实际用途，没有指某种哲学学派"}],"segments":[{"segment_id":"1.1","target_text":"它有实际用途。"}]}]}`, nil
	})}
	var saved pairedSentence
	if err := translator.generateSegmentTranslations(context.Background(), input, parents, false, "en", "zh_cn", func(s pairedSentence, _ bool) error { data, _ := json.Marshal(s); return json.Unmarshal(data, &saved) }); err != nil {
		t.Fatal(err)
	}
	context := makeSegmentRequest(input, []pairedSentence{saved}).SemanticContext
	if len(saved.SegmentState.TermDecisions) != 1 || len(context.Terms) != 2 || context.Terms[0].Target != "实用的" || !slices.Equal(context.Terms[0].SentenceIDs, []string{"1"}) || context.Terms[1].Target != "实用主义的" || !slices.Equal(context.Terms[1].SentenceIDs, []string{"2"}) {
		t.Fatalf("lost scoped decision: %+v", context)
	}
	if input.SemanticContext.Terms[0].Target != "实用主义的" || len(input.SemanticContext.Terms[0].SentenceIDs) != 2 {
		t.Fatal("shared plan mutated")
	}
	if validateSegmentTermDecisions([]segmentTermDecision{{Source: "unknown", Target: "未知", Reason: "凭空"}}, parent, input, "en") == "" {
		t.Fatal("unscoped term accepted")
	}
}

func TestSegmentedAlignmentCannotChangeValidatedSourceCuts(t *testing.T) {
	text := "I keep a book about the history of modern philosophy beside my bed, and I read it every evening."
	source := pairedTranslationSource{ID: "1", Text: text}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "expressive"
	parent.SegmentState.Units[0].Direct = "床边放着一本现代哲学史，我每晚都读。"
	parent.SegmentState.Units[0].Target = parent.SegmentState.Units[0].Direct
	parents := map[string]pairedSentence{"1": parent}
	saves := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"I keep a book about the history of modern philosophy beside my bed,"},{"source":"and I read it every evening."}]}]}`, nil
		}
		return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"I keep a book about the history of modern philosophy","target_text":"我放着一本现代哲学史"},{"source":"beside my bed, and I read it every evening.","target_text":"在床边，我每晚都读。"}]}]}`, nil
	})}
	err := translator.splitSegmentOverflows(context.Background(), pairedTranslationInput{MaxTargetChars: 75, Sentences: []pairedTranslationSource{source}}, parents, "en", "zh_cn", func(pairedSentence, bool) error { saves++; return nil })
	if err == nil || saves != 0 || len(parents["1"].SegmentState.Units) != 1 {
		t.Fatal("alignment changed fixed cuts", err)
	}
}

func TestSegmentedCutCacheSurvivesCancelledAlignment(t *testing.T) {
	text := "I keep a book about the history of modern philosophy beside my bed, and I read it every evening."
	source := pairedTranslationSource{ID: "1", Text: text}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "expressive"
	parent.SegmentState.Units[0].Direct = "床边放着一本现代哲学史，我每晚都读。"
	parent.SegmentState.Units[0].Target = parent.SegmentState.Units[0].Direct
	parents := map[string]pairedSentence{"1": parent}
	cuts, aligns := 0, 0
	translator := &Translator{nlpBoundaryChecker: segmentTestLLMBoundaryChecker, checkpointDir: t.TempDir(), chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			cuts++
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"I keep a book about the history of modern philosophy beside my bed,"},{"source":"and I read it every evening."}]}]}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_segment_review\n") {
			return segmentTestReview(segmentTestInput(t, prompt), []segmentReviewIssue{}), nil
		}
		aligns++
		if aligns == 1 {
			return "", context.Canceled
		}
		return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"I keep a book about the history of modern philosophy beside my bed,","target_text":"床边放着一本现代哲学史，"},{"source":"and I read it every evening.","target_text":"我每晚都读。"}]}]}`, nil
	})}
	input := pairedTranslationInput{MaxTargetChars: 75, Sentences: []pairedTranslationSource{source}}
	save := func(pairedSentence, bool) error { return nil }
	if err := translator.splitSegmentOverflows(context.Background(), input, parents, "en", "zh_cn", save); err != context.Canceled {
		t.Fatal("cancellation swallowed", err)
	}
	if err := translator.splitSegmentOverflows(context.Background(), input, parents, "en", "zh_cn", save); err != nil || cuts != 1 || aligns != 2 || !parents["1"].SemanticReviewed {
		t.Fatalf("source cut repeated or invalid resume: cuts=%d aligns=%d err=%v", cuts, aligns, err)
	}
}

func TestSegmentedTermAliasRejectsConflicts(t *testing.T) {
	var d segmentTermDecision
	if err := json.Unmarshal([]byte(`{"source":"use","corrected_target":"用途","reason":"语境"}`), &d); err != nil || d.Target != "用途" {
		t.Fatal(d, err)
	}
	if json.Unmarshal([]byte(`{"source":"use","target":"用途","corrected_target":"利用","reason":"语境"}`), &d) == nil {
		t.Fatal("conflicting decisions accepted")
	}
}

func TestSegmentedRejectsDependencyBreakBeforeAlignment(t *testing.T) {
	work := []segmentOverflow{{ID: "1.1", Source: "We speak in very general terms about contemporary morals.", MinPieces: 2}}
	cuts, aligns, checks := 0, 0, 0
	translator := &Translator{nlpBoundaryChecker: func(_ context.Context, requests []translationNLPBoundaryRequest, _ types.StandardLanguageCode) ([]string, error) {
		checks++
		if checks == 1 {
			return []string{"Unsafe source boundary: keep in with terms (pobj)"}, nil
		}
		return []string{""}, nil
	}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if !strings.HasPrefix(prompt, "任务：translation_segment_cut\n") {
			aligns++
			t.Fatal("invalid cuts reached alignment")
		}
		cuts++
		if cuts == 1 {
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"We speak in"},{"source":"very general terms about contemporary morals."}]}]}`, nil
		}
		if !strings.Contains(prompt, "keep in with terms") {
			t.Fatal("lost dependency feedback")
		}
		return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"We speak in very general terms"},{"source":"about contemporary morals."}]}]}`, nil
	})}
	got, err := translator.cutSegmentOverflowSources(context.Background(), pairedTranslationInput{MaxTargetChars: 75}, work, "en")
	if err != nil || cuts != 2 || checks != 2 || aligns != 0 || len(got["1.1"]) != 2 {
		t.Fatal(got, cuts, checks, err)
	}
}
