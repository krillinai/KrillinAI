package service

import (
	"context"
	"krillin-ai/internal/types"
	"slices"
	"strings"
	"testing"
)

func TestSegmentedReviewRepairKeepsDisjointBlocksAndExactPositions(t *testing.T) {
	source := pairedTranslationSource{ID: "1", Text: "One part, another part, middle part, fourth part, final part.", NLPSourceHint: []string{"One part,", "another part,", "middle part,", "fourth part,", "final part."}}
	parent, _ := sourceSegmentedSentence(source)
	for i := range parent.SegmentState.Units {
		parent.SegmentState.Units[i].Direct = "原译，"
		parent.SegmentState.Units[i].Target = "候选，"
	}
	original := cloneSegmentedSentence(parent)
	prepareSegmentReviewRepair(&parent, []segmentReviewIssue{
		{ID: "1", SegmentIDs: []string{"1.2", "1.1"}},
		{ID: "1", SegmentIDs: []string{"1.4", "1.5"}},
	}, "zh_cn")
	units := parent.SegmentState.Units
	if len(units) != 3 || units[1].ID != "1.3" || units[1].Source != "middle part," || len(parent.SegmentState.RejectedCuts) != 2 {
		t.Fatal("disjoint repairs expanded", units)
	}
	if !slices.Equal(units[0].OriginIDs, []string{"1.1", "1.2"}) || !slices.Equal(units[2].OriginIDs, []string{"1.4", "1.5"}) {
		t.Fatal("origin IDs lost", units)
	}
	for _, u := range units {
		if source.Text[u.Start:u.End] != u.Source {
			t.Fatal("source/time mapping changed")
		}
	}
	if len(original.SegmentState.Units) != 5 || len(original.SegmentState.RejectedCuts) != 0 {
		t.Fatal("repair mutated saved candidate")
	}
}

func TestSegmentedRejectedCutCannotReachAlignment(t *testing.T) {
	text := "because they are timeless and they speak in very general philosophical terms about contemporary morals,"
	bad := []string{"because they are timeless and they speak", "in very general philosophical terms about contemporary morals,"}
	work := []segmentOverflow{{ID: "1.1", Source: text, MinPieces: 2, RejectedParts: [][]string{bad}}}
	calls, checks := 0, 0
	translator := &Translator{nlpBoundaryChecker: func(_ context.Context, _ []translationNLPBoundaryRequest, _ types.StandardLanguageCode) ([]string, error) {
		checks++
		return []string{""}, nil
	}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if !strings.Contains(prompt, "rejected_source_parts") {
			t.Fatal("lost failed source cut")
		}
		if calls == 1 {
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"because they are timeless and they speak"},{"source":"in very general philosophical terms about contemporary morals,"}]}]}`, nil
		}
		return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"because they are timeless"},{"source":"and they speak in very general philosophical terms"},{"source":"about contemporary morals,"}]}]}`, nil
	})}
	parts, err := translator.cutSegmentOverflowSources(context.Background(), pairedTranslationInput{MaxTargetChars: 75}, work, "en")
	if err != nil || calls != 2 || checks != 1 || len(parts["1.1"]) != 3 {
		t.Fatal("repeated failed cut accepted or valid alternative lost", calls, checks, parts, err)
	}
	item := work[0]
	item.SourceParts = bad
	item.SourceOptions = [][]string{bad}
	if segmentAlignmentSourceAllowed(item, bad) {
		t.Fatal("rejected option reached alignment")
	}
}
