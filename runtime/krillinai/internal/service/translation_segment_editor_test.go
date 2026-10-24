package service

import (
	"context"
	"strings"
	"testing"
)

func TestSegmentedEditorKeyedReplyKeepsOrderAndSourcePositions(t *testing.T) {
	source := pairedTranslationSource{ID: "1", Text: "The device lets users save files, but it does not upload them.", NLPSourceHint: []string{"The device lets users save files,", "but it does not upload them."}}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "faithful"
	for i := range parent.SegmentState.Units {
		parent.SegmentState.Units[i].Direct = "草稿。"
		parent.SegmentState.Units[i].Target = "草稿。"
	}
	parents := map[string]pairedSentence{"1": parent}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		p := segmentTestInput(t, prompt)
		if p.Parents[0].Source != source.Text || p.Parents[0].Units[0].Source != source.NLPSourceHint[0] || p.Parents[0].Units[0].Direct != "草稿。" {
			t.Fatal("editor lost parent/source/draft")
		}
		// Object key order is not subtitle order.
		return `{"1.2":{"reflect":"保留否定","free":"但不会上传。"},"1.1":{"reflect":"使用自然动词搭配","free":"这个设备能让用户保存文件，"}}`, nil
	})}
	if err := translator.generateSegmentTranslations(context.Background(), pairedTranslationInput{Sentences: []pairedTranslationSource{source}}, parents, false, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	got := parents["1"]
	if got.Target[0] != "这个设备能让用户保存文件，" || got.Target[1] != "但不会上传。" || got.SemanticReviewed {
		t.Fatal("wrong order or unreviewed editor output published", got)
	}
	for _, u := range got.SegmentState.Units {
		if source.Text[u.Start:u.End] != u.Source {
			t.Fatal("editor changed source position")
		}
	}
}

func TestSegmentedEditorRejectsAmbiguousCoverage(t *testing.T) {
	payload := segmentRequest{Parents: []segmentRequestParent{{ID: "1", Units: []segmentPromptUnit{{ID: "1.1"}, {ID: "1.2"}}}}}
	for _, raw := range []string{
		`{"1.1":{"free":"甲"},"1.1":{"free":"乙"}}`,
		`{"wrong":{"free":"甲"}}`,
		`{"1.2":{"segment_ids":["1.1","1.2"],"free":"甲"}}`,
	} {
		var out segmentResponse
		if decodeSegmentEditorJSON(raw, payload, &out) == nil {
			t.Fatal("ambiguous editor output accepted", raw)
		}
	}
	var out segmentResponse
	if err := decodeSegmentEditorJSON("```json\n{\"1.1\":{\"segment_ids\":[\"1.1\",\"1.2\"],\"free\":\"甲乙\"}}\n```", payload, &out); err != nil || len(out.Sentences[0].Segments) != 1 || len(out.Sentences[0].Segments[0].IDs) != 2 {
		t.Fatal("explicit keyed merge rejected", err, out)
	}
}

func TestSegmentedEditorClosesStructureWithoutInventingText(t *testing.T) {
	payload := segmentRequest{Parents: []segmentRequestParent{{ID: "1", Units: []segmentPromptUnit{{ID: "1.1"}}}}}
	response := "```json\n" + `{"1.1":{"origin":"He said \"ready\".","direct":"他说准备好了。","free":"他说，准备好了。"}` + "\n```"
	var out segmentResponse
	if err := decodeSegmentEditorJSON(response, payload, &out); err != nil || len(out.Sentences) != 1 || len(out.Sentences[0].Segments) != 1 || out.Sentences[0].Segments[0].Target != "他说，准备好了。" {
		t.Fatal("missing outer closure discarded complete editor rows", err, out)
	}
	for _, broken := range []string{
		`{"1.1":{"free":"没有写完`,
		`{"1.1":{"free":"甲"} "1.2":{"free":"乙"}}`,
		`{"1.1":{"free":"甲"},"1.1":{"free":"乙"}`,
	} {
		if decodeSegmentEditorJSON(broken, payload, &out) == nil {
			t.Fatal("invented text or accepted ambiguous structure", broken)
		}
	}
}

func TestSegmentedAlignmentUsesOnlyOfferedSourceOptions(t *testing.T) {
	item := segmentOverflow{SourceParts: []string{"The guide is useful", "in my work because it explains the rules."}, SourceOptions: [][]string{{"The guide is useful in my work", "because it explains the rules."}}}
	if !segmentAlignmentSourceAllowed(item, item.SourceParts) || !segmentAlignmentSourceAllowed(item, item.SourceOptions[0]) {
		t.Fatal("validated option rejected")
	}
	if segmentAlignmentSourceAllowed(item, []string{"The guide", "is useful in my work because it explains the rules."}) || segmentAlignmentSourceAllowed(item, []string{"The guide is useful", "because it explains the rules."}) {
		t.Fatal("unoffered or mixed source cuts accepted")
	}
}

func TestSegmentedReviewAggregatesMultipleDefectsOfOneParent(t *testing.T) {
	source := pairedTranslationSource{ID: "1", Text: "I read it, but you do not.", NLPSourceHint: []string{"I read it,", "but you do not."}}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "expressive"
	parents := map[string]pairedSentence{"1": parent}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		return segmentTestReview(segmentTestInput(t, prompt), []segmentReviewIssue{
			{ID: "1", SegmentIDs: []string{"1.1"}, Kind: "faithfulness", Reason: "speaker role changed"},
			{ID: "1", SegmentIDs: []string{"1.2"}, Kind: "fluency", Reason: "wrong collocation"},
		}), nil
	})}
	err := translator.reviewSegmentTranslations(context.Background(), pairedTranslationInput{Sentences: []pairedTranslationSource{source}}, parents, "zh_cn", func(pairedSentence, bool) error { return nil })
	issue := parents["1"].SegmentState.Issue
	if err != nil || !strings.Contains(issue, "speaker role changed") || !strings.Contains(issue, "wrong collocation") || !strings.Contains(issue, "1.1") || !strings.Contains(issue, "1.2") {
		t.Fatal("review lost one defect or rejected auxiliary category", err, issue)
	}
}

func TestSegmentedReviewReceivesChangedAlignmentReference(t *testing.T) {
	source := pairedTranslationSource{ID: "1", Text: "It helps me in daily life."}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "expressive"
	parent.SegmentState.Units[0].Direct = "它对我的日常生活有帮助。"
	parent.SegmentState.Units[0].Target = "它帮助我，在日常生活中。"
	parent.SegmentState.AlignmentDrafts = []segmentPromptUnit{{ID: "1.1", Source: source.Text, Target: "它对我的日常生活有帮助。"}}
	parents := map[string]pairedSentence{"1": parent}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		p := segmentTestInput(t, prompt)
		if len(p.Parents[0].BeforeAlignment) != 1 || p.Parents[0].BeforeAlignment[0].Target != "它对我的日常生活有帮助。" || strings.Contains(prompt, `"direct"`) {
			t.Fatal("lost reference or leaked initial draft")
		}
		return segmentTestReview(p, []segmentReviewIssue{{ID: "1", SegmentIDs: []string{"1.1"}, Kind: "fluency", Reason: "状语后置使口语生硬"}}), nil
	})}
	if err := translator.reviewSegmentTranslations(context.Background(), pairedTranslationInput{Sentences: []pairedTranslationSource{source}}, parents, "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil || parents["1"].SegmentState.Stage != "repair" {
		t.Fatal("alignment regression skipped review", err)
	}
}
