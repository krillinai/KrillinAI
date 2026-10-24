package pipeline

import (
	"krillin-ai/internal/types"
	"sync"
	"sync/atomic"
)

type ProgressReporter func(phase string, percent int, message string, counts ...ProgressCounts)

// Keep retries, overlapping work and legacy callbacks from moving a stage
// backwards. Counts and messages still flow when the integer percent is equal.
func monotonicProgress(report ProgressReporter) ProgressReporter {
	var mu sync.Mutex
	last := 0
	return func(phase string, percent int, message string, counts ...ProgressCounts) {
		if report == nil {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		last = max(last, min(99, percent))
		report(phase, last, message, counts...)
	}
}

func forwardTaskProgress(task *types.SubtitleTask, report ProgressReporter, scale func(int) int) {
	task.SetDetailedProgressReporter(func(progress types.TaskProgress) {
		if report == nil {
			return
		}
		percent := progress.Percent
		if scale != nil {
			percent = scale(percent)
		}
		if progress.Total > 0 {
			report(progress.Phase, percent, progress.Message, ProgressCounts{progress.Completed, progress.Total})
		} else {
			report(progress.Phase, percent, progress.Message)
		}
	})
}

// Whole-subtitle translation reports its own 0–100 work range. Media
// preparation continues to use its original range; legacy counts still work.
func forwardSubtitleTranslationProgress(task *types.SubtitleTask, report ProgressReporter, start, end int, legacyMessage string) {
	var detailed atomic.Bool
	task.SetTranslationProgressReporter(func(completed, total int) {
		if report != nil && total > 0 && !detailed.Load() {
			report("translating_subtitles", start+completed*(end-start)/total, legacyMessage, ProgressCounts{completed, total})
		}
	})
	forwardTaskProgress(task, func(phase string, percent int, message string, counts ...ProgressCounts) {
		if report == nil {
			return
		}
		if phase == "translating_subtitles" {
			detailed.Store(true)
			percent = start + percent*(end-start)/100
		} else {
			percent = 2 + percent*23/100
		}
		report(phase, percent, message, counts...)
	}, nil)
}
