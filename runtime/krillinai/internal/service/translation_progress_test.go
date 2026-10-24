package service

import (
	"context"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"strings"
	"testing"
)

func TestSubtitleDraftProgressIsVisibleBeforeReviewReturns(t *testing.T) {
	var events []types.TaskProgress
	task := &types.SubtitleTask{}
	task.SetDetailedProgressReporter(func(progress types.TaskProgress) { events = append(events, progress) })
	legacyCompleted := 0
	task.SetTranslationProgressReporter(func(completed, _ int) { legacyCompleted = completed })
	calls := 0
	translator := &Translator{
		preparedTranslation: &preparedTranslationContext{Texts: []string{"Hello."}, Plan: &translationSemanticPlan{}},
		reviseTranslation:   true,
		chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
			calls++
			if strings.Contains(prompt, "任务：translation_content\n") {
				return `{"sentences":[{"sentence_id":"1","target_text":"你好。"}]}`, nil
			}
			if strings.Contains(prompt, "任务：translation_revision\n") {
				last := events[len(events)-1]
				if last.Percent <= 0 || last.Completed != 0 || last.Total != 1 || legacyCompleted != 0 || !strings.Contains(last.Message, "初译 1/1；字幕完成 0/1；正在审校") {
					t.Fatalf("draft hidden or counted as finished while review is pending: %+v, legacy=%d", last, legacyCompleted)
				}
				return `{"corrections":[]}`, nil
			}
			t.Fatalf("unexpected additional model request")
			return "", nil
		}),
	}
	blocks, err := translator.BatchTranslateSrtBlocks(context.Background(), []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:02,000", OriginLanguageSentence: "Hello."}}, "en", "zh_cn", task)
	if err != nil || len(blocks) != 1 || calls != 2 {
		t.Fatalf("blocks=%v calls=%d error=%v", blocks, calls, err)
	}
	last := events[len(events)-1]
	if last.Completed != 1 || last.Total != 1 || last.Percent != 100 || legacyCompleted != 1 {
		t.Fatalf("final or legacy completion lost: %+v legacy=%d", last, legacyCompleted)
	}
}

func TestSubtitleContextPreparationReportsTotalBeforeModelReturns(t *testing.T) {
	var last types.TaskProgress
	progress := newTranslationWorkProgress(func(event types.TaskProgress) { last = event })
	translator := &Translator{translationProgress: progress, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.Contains(prompt, "任务：translation_context\n") {
			if last.Total != 1 || last.Completed != 0 || last.Percent <= 0 || !strings.Contains(last.Message, "正在整理字幕语境 1/1 段") {
				t.Fatalf("total/status unavailable during context preparation: %+v", last)
			}
			return `{"summary":"A greeting.","terms":[]}`, nil
		}
		return `{"sentences":[{"sentence_id":"1","target_text":"你好。"}]}`, nil
	})}
	if _, err := translator.translatePairedSentences(context.Background(), []string{"Hello."}, "en", "zh_cn", 50, 1, nil); err != nil {
		t.Fatal(err)
	}
}

func TestSubtitleWorkProgressAdvancesThroughPreparationReviewAndLayout(t *testing.T) {
	var last types.TaskProgress
	previous := 0
	p := newTranslationWorkProgress(func(event types.TaskProgress) {
		if event.Percent < last.Percent || event.Percent > 100 {
			t.Fatalf("progress regressed or overflowed: %+v -> %+v", last, event)
		}
		last = event
	})
	p.prepare(1, "正在整理字幕语境")
	for _, done := range []int{40, 90, 100} {
		p.prepared(done)
		if last.Percent <= previous || last.Completed != 0 {
			t.Fatalf("preparation was hidden or counted as finished: %+v", last)
		}
		previous = last.Percent
	}
	sentence := pairedSentence{ID: "1", FullTarget: "你好。"}
	p.saved(sentence, false)
	if last.Percent <= previous || last.Completed != 0 {
		t.Fatalf("draft did not advance real work: %+v", last)
	}
	previous = last.Percent
	p.working([]pairedTranslationSource{{ID: "1"}}, "排版")
	if last.Percent <= previous || last.Completed != 0 {
		t.Fatalf("completed review was hidden: %+v", last)
	}
	previous = last.Percent
	sentence.LayoutReviewed = true
	p.saved(sentence, false)
	if last.Percent <= previous || last.Percent >= 100 || last.Completed != 0 {
		t.Fatalf("layout did not advance before finalization: %+v", last)
	}
	// A repeated checkpoint and an older preparation update cannot regress it.
	p.saved(sentence, false)
	p.prepared(10)
	p.saved(sentence, true)
	if last.Percent != 100 || last.Completed != 1 {
		t.Fatalf("final work was not completed: %+v", last)
	}
}
