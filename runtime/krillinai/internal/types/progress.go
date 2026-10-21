package types

// TaskProgress describes real work reported by a service. Percent uses that
// service's range; the pipeline maps it into its stage's overall range.
type TaskProgress struct {
	Phase     string
	Percent   int
	Message   string
	Completed int
	Total     int
}

func (t *SubtitleTask) SetDetailedProgressReporter(reporter func(TaskProgress)) {
	if t != nil {
		t.detailedProgressReporter = reporter
	}
}

// 恢复消息不修改旧任务百分比；统一流水线负责保持整体进度单调。
func (t *SubtitleTask) ReportTranslationRecovery(message string) {
	if t != nil && t.detailedProgressReporter != nil {
		t.detailedProgressReporter(TaskProgress{Phase: "recovering_translation", Message: message})
	}
}

func (t *SubtitleTask) ReportProgress(progress TaskProgress) {
	if t == nil {
		return
	}
	progress.Percent = max(0, min(100, progress.Percent))
	if t.detailedProgressReporter != nil {
		t.detailedProgressReporter(progress)
		return
	}
	// 旧 HTTP 流程使用整个字幕任务的百分比；媒体准备只占 3%-10%。
	// 统一流水线由 detailedProgressReporter 自行映射阶段进度。
	switch progress.Phase {
	case "preparing_source", "downloading_media", "extracting_audio":
		progress.Percent = 3 + progress.Percent*7/100
	}
	t.SetProgress(uint8(progress.Percent))
}
