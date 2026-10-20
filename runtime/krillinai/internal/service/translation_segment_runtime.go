package service

import (
	"context"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"sync/atomic"
)

// 可恢复的模型格式/内容校验错误与接口、磁盘错误分开，不能取消其他有效批次。
type segmentValidationError struct{ message string }

func (e *segmentValidationError) Error() string { return e.message }

func segmentValidationFailure(format string, args ...any) error {
	return &segmentValidationError{message: fmt.Sprintf(format, args...)}
}

// JSON截断/结构错误时缩小失败批次；不重复已经保存的其他父句或完整初译。
func (t *Translator) generateSegmentSubBatches(ctx context.Context, input pairedTranslationInput, pending []pairedSentence, parents map[string]pairedSentence, faithful bool, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	var failures []error
	for _, group := range [][]pairedSentence{pending[:len(pending)/2], pending[len(pending)/2:]} {
		narrow := input
		narrow.Sentences = nil
		ids := map[string]bool{}
		for _, parent := range group {
			ids[parent.ID] = true
		}
		for _, source := range input.Sentences {
			if ids[source.ID] {
				narrow.Sentences = append(narrow.Sentences, source)
			}
		}
		err := t.generateSegmentTranslations(ctx, narrow, parents, faithful, originLang, targetLang, save)
		if err != nil {
			var validation *segmentValidationError
			if !errors.As(err, &validation) {
				return err
			}
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}

// 持续补充空闲槽位；限流后先等在途任务结束，再只保留一个槽位。
func runSegmentedJobs(ctx context.Context, count, parallel int, limited *atomic.Bool, run func(context.Context, int) error) error {
	work, cancel := context.WithCancel(ctx)
	defer cancel()
	type completion struct{ err error }
	results := make(chan completion, max(1, parallel))
	next, active := 0, 0
	var failures []error
	fatal := false
	for next < count || active > 0 {
		if err := ctx.Err(); err != nil && !fatal {
			failures = append(failures, err)
			fatal = true
			cancel()
		}
		capacity := max(1, parallel)
		if limited.Load() {
			capacity = 1
		}
		for !fatal && next < count && active < capacity {
			index := next
			next++
			active++
			go func() { results <- completion{run(work, index)} }()
		}
		if active == 0 {
			break
		}
		result := <-results
		active--
		if result.err != nil {
			failures = append(failures, result.err)
			var validation *segmentValidationError
			if !errors.As(result.err, &validation) {
				fatal = true
				cancel()
			}
		}
	}
	return errors.Join(failures...)
}

func (t *Translator) runSegmentedInputs(ctx context.Context, inputs []pairedTranslationInput, checkpoint *translationCheckpoint, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error, commit func() error) error {
	type job struct {
		input   pairedTranslationInput
		parents map[string]pairedSentence
	}
	var jobs []job
	for _, input := range inputs {
		parents := make(map[string]pairedSentence)
		pending := false
		for _, source := range input.Sentences {
			sentence, ok := t.recoverSegmentedSentence(checkpoint.sentences[source.ID], source, originLang, targetLang)
			if !ok {
				var err error
				sentence, err = sourceSegmentedSentence(source, originLang)
				if err != nil {
					return err
				}
			}
			parents[source.ID] = sentence
			if sentence.SegmentState.Stage == "reviewed" && pairedFinalLengthIssue(sentence) == nil {
				sentence.LayoutTarget = input.MaxTargetChars
				if err := save(sentence, true); err != nil {
					return err
				}
			} else {
				pending = true
			}
		}
		if pending {
			jobs = append(jobs, job{input, parents})
		}
	}
	if err := commit(); err != nil {
		return err
	}
	var limited atomic.Bool
	worker := *t
	worker.onRateLimit = func() {
		if limited.CompareAndSwap(false, true) {
			t.translationNotice("翻译服务暂时限流，后续请求已降低为串行处理")
		}
	}
	return runSegmentedJobs(ctx, len(jobs), translationParallelism(), &limited, func(ctx context.Context, index int) error {
		item := jobs[index]
		// 阶段内已按失败ID重试；只允许一次任务内续跑，已通过阶段不重做。
		for attempt := 0; ; attempt++ {
			err := worker.completeSegmentedBatch(ctx, item.input, item.parents, originLang, targetLang, save)
			if err == nil {
				return commit()
			}
			var validation *segmentValidationError
			if attempt > 0 || !errors.As(err, &validation) || ctx.Err() != nil {
				return err
			}
			t.translationNotice("部分字幕校验未通过，正在从已保存阶段重试该批，其余批次继续处理")
		}
	})
}
