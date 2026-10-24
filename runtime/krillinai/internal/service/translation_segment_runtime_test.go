package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// LLM回退分支的固定测试数据不应随机器是否安装spaCy模型而切换分支。
func segmentTestLLMBoundaryChecker(ctx context.Context, requests []translationNLPBoundaryRequest, _ types.StandardLanguageCode) ([]string, error) {
	return make([]string, len(requests)), ctx.Err()
}

func TestSegmentedSemanticJSONRepairsClosersWithoutInventingContent(t *testing.T) {
	for _, test := range []struct {
		raw   string
		valid bool
	}{
		{`{"checked_ids":["1"],"issues":[]`, true},
		{`{"checked_ids":["1"],"issues":[{"reason":"truncated`, false},
		{`{"checked_ids":["1"] "issues":[]}`, false},
	} {
		translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) { return test.raw, nil })}
		var result struct {
			Checked []string          `json:"checked_ids"`
			Issues  []json.RawMessage `json:"issues"`
		}
		ok, err := translator.semanticJSON(context.Background(), "translation_segment_review", "", nil, "checked_ids", &result, func() bool { return len(result.Checked) == 1 && result.Issues != nil })
		if err != nil || ok != test.valid {
			t.Fatal(test, ok, err)
		}
	}
}

func TestSegmentedJobsRefillBeforeSlowPeerFinishes(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	started := make(chan int, 8)
	release := make(chan struct{})
	defer close(release)
	var limited atomic.Bool
	done := make(chan error, 1)
	go func() {
		done <- runSegmentedJobs(ctx, 8, 3, &limited, func(ctx context.Context, index int) error {
			started <- index
			if index == 0 {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-release:
				}
			}
			return nil
		})
	}()
	for {
		select {
		case index := <-started:
			if index >= 3 {
				cancel()
				<-done
				return
			}
		case <-ctx.Done():
			<-done
			t.Fatal("idle workers waited for slow batch instead of taking queued work")
		}
	}
}

func TestSegmentedJobsIsolateValidationAndCancelFatalErrors(t *testing.T) {
	for _, validation := range []bool{false, true} {
		t.Run(fmt.Sprint(validation), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			var limited atomic.Bool
			var calls atomic.Int32
			err := runSegmentedJobs(ctx, 12, 3, &limited, func(ctx context.Context, index int) error {
				calls.Add(1)
				if index == 0 {
					if validation {
						return segmentValidationFailure("invalid candidate")
					}
					return errors.New("disk unavailable")
				}
				if !validation {
					<-ctx.Done()
					return ctx.Err()
				}
				return nil
			})
			if err == nil || validation && calls.Load() != 12 || !validation && calls.Load() > 3 {
				t.Fatalf("unrelated jobs lost or fatal error kept scheduling: calls=%d err=%v", calls.Load(), err)
			}
		})
	}
}

func TestSegmentedJobsHonorReducedConcurrency(t *testing.T) {
	var limited atomic.Bool
	limited.Store(true)
	var active atomic.Int32
	err := runSegmentedJobs(context.Background(), 12, 3, &limited, func(context.Context, int) error {
		if active.Add(1) != 1 {
			t.Error("parallel work started after rate limit")
		}
		defer active.Add(-1)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSegmentedCheckpointResumeUsesAllWorkers(t *testing.T) {
	previous := config.Conf.App.TranslateParallelNum
	config.Conf.App.TranslateParallelNum = 3
	t.Cleanup(func() { config.Conf.App.TranslateParallelNum = previous })
	texts := []string{"The first example is ready.", "The second example is ready.", "The third example is ready.", "The fourth example is ready."}
	plan := &translationSemanticPlan{}
	translator := &Translator{segmentTranslation: true, checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts, Plan: plan}}
	checkpoint, err := translator.openTranslationCheckpoint(texts, "en", "zh_cn", plan)
	if err != nil {
		t.Fatal(err)
	}
	for i, text := range texts {
		sentence, _ := sourceSegmentedSentence(pairedTranslationSource{ID: strconv.Itoa(i + 1), Text: text})
		sentence.SegmentState.Stage = "faithful"
		sentence.SegmentState.Units[0].Direct = "例子已准备好。"
		sentence.SegmentState.Units[0].Target = "例子已准备好。"
		if err := checkpoint.save(materializeSegmentedSentence(sentence, "zh_cn")); err != nil {
			t.Fatal(err)
		}
	}
	entered := make(chan struct{}, 4)
	release := make(chan struct{})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	translator.chatCompleter = semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_segment_faithful") {
			t.Error("resumed parent was translated from scratch")
		}
		input := segmentTestInput(t, prompt)
		if strings.HasPrefix(prompt, "任务：translation_segment_review") {
			return segmentTestReview(input, []segmentReviewIssue{}), nil
		}
		entered <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
			return "", ctx.Err()
		}
		return segmentTestResponse(input, false, func(string) string { return "例子已准备好了。" }), nil
	})
	done := make(chan error, 1)
	go func() {
		_, err := translator.translatePairedSentences(ctx, texts, "en", "zh_cn", 75, 1, nil)
		done <- err
	}()
	for range 3 {
		select {
		case <-entered:
		case <-ctx.Done():
			close(release)
			<-done
			t.Fatal("checkpoint completion still serialized")
		}
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestSegmentedTruncatedBatchBisectsWithoutRepeatingDrafts(t *testing.T) {
	sources := []pairedTranslationSource{{ID: "1", Text: "The first example is ready."}, {ID: "2", Text: "The second example is ready."}}
	parents := map[string]pairedSentence{}
	for _, source := range sources {
		p, _ := sourceSegmentedSentence(source)
		p.SegmentState.Stage = "faithful"
		p.SegmentState.Units[0].Direct = "例子已准备好。"
		p.SegmentState.Units[0].Target = "例子已准备好。"
		parents[p.ID] = p
	}
	var sizes []int
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		input := segmentTestInput(t, prompt)
		sizes = append(sizes, len(input.Parents))
		if len(input.Parents) > 1 {
			return `{"1.1":{"free":"truncated`, nil
		}
		return segmentTestResponse(input, false, func(string) string { return "例子已准备好了。" }), nil
	})}
	err := translator.generateSegmentTranslations(context.Background(), pairedTranslationInput{Sentences: sources}, parents, false, "en", "zh_cn", func(pairedSentence, bool) error { return nil })
	if err != nil || fmt.Sprint(sizes) != "[2 1 1]" || parents["1"].SegmentState.Stage != "expressive" || parents["2"].SegmentState.Stage != "expressive" {
		t.Fatal(sizes, err)
	}
}

func TestSegmentedCutRetriesOnlyFailedSource(t *testing.T) {
	first := "We read books about science and share our ideas with friends."
	second := "We speak in very general terms about contemporary morals."
	work := []segmentOverflow{{ID: "1.1", Source: first, MinPieces: 2}, {ID: "2.1", Source: second, MinPieces: 2}}
	calls, checks := 0, 0
	translator := &Translator{nlpBoundaryChecker: func(_ context.Context, requests []translationNLPBoundaryRequest, _ types.StandardLanguageCode) ([]string, error) {
		checks++
		if checks == 1 {
			return []string{"", "Unsafe source boundary: keep in with terms"}, nil
		}
		if len(requests) != 1 || requests[0].Source != second {
			t.Fatal("valid source checked again", requests)
		}
		return []string{""}, nil
	}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if calls == 1 {
			return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"We read books about science"},{"source":"and share our ideas with friends."}]},{"sentence_id":"2.1","segments":[{"source":"We speak in"},{"source":"very general terms about contemporary morals."}]}]}`, nil
		}
		if strings.Contains(prompt, first) || !strings.Contains(prompt, "keep in with terms") {
			t.Fatal("valid source retried or validation feedback lost")
		}
		return `{"sentences":[{"sentence_id":"2.1","segments":[{"source":"We speak in very general terms"},{"source":"about contemporary morals."}]}]}`, nil
	})}
	got, err := translator.cutSegmentOverflowSources(context.Background(), pairedTranslationInput{MaxTargetChars: 75}, work, "en")
	if err != nil || calls != 2 || checks != 2 || len(got) != 2 {
		t.Fatal(got, calls, checks, err)
	}
}

func TestSegmentedUnsafeCutFailurePersistsEvidenceWithoutPublishing(t *testing.T) {
	text := "that a teenager on their first week of work could produce a consistent product,"
	source := pairedTranslationSource{ID: "1", Text: text}
	parent, _ := sourceSegmentedSentence(source)
	parent.SegmentState.Stage = "expressive"
	parent.SegmentState.Units[0].Target = "一个刚上班一周的年轻人也能做出品质一致的产品。"
	parents := map[string]pairedSentence{"1": parent}
	checks, calls, saves := 0, 0, 0
	translator := &Translator{nlpBoundaryChecker: func(context.Context, []translationNLPBoundaryRequest, types.StandardLanguageCode) ([]string, error) {
		checks++
		return []string{"Unsafe source boundary: keep that with produce"}, nil
	}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if !strings.HasPrefix(prompt, "任务：translation_segment_cut") {
			t.Fatal("invalid source reached translation alignment")
		}
		return `{"sentences":[{"sentence_id":"1.1","segments":[{"source":"that a teenager on their first week of work"},{"source":"could produce a consistent product,"}]}]}`, nil
	})}
	err := translator.splitSegmentOverflows(context.Background(), pairedTranslationInput{MaxTargetChars: 75, Sentences: []pairedTranslationSource{source}}, parents, "en", "zh_cn", func(p pairedSentence, complete bool) error {
		saves++
		if complete {
			t.Error("invalid cut published")
		}
		return nil
	})
	var validation *segmentValidationError
	got := parents["1"]
	if !errors.As(err, &validation) || calls != 3 || checks != 1 || saves != 1 || len(got.SegmentState.RejectedCuts) != 1 || got.SegmentState.BoundaryIssue == "" || len(got.SegmentState.Units) != 1 || got.SegmentState.Units[0].Source != text {
		t.Fatal(calls, checks, saves, got, err)
	}
}
