package types

import "testing"

func TestMediaStageProgressUsesLegacyOverallRange(t *testing.T) {
	for _, phase := range []string{"preparing_source", "downloading_media", "extracting_audio"} {
		t.Run(phase, func(t *testing.T) {
			task := &SubtitleTask{Status: SubtitleTaskStatusProcessing}
			for _, percent := range []int{0, 50, 100} {
				task.ReportProgress(TaskProgress{Phase: phase, Percent: percent})
				if want := uint8(3 + percent*7/100); task.ProcessPct != want {
					t.Fatalf("阶段进度 %d 应映射为整体进度 %d，实际 %d", percent, want, task.ProcessPct)
				}
			}
		})
	}
}

func TestDetailedMediaProgressRetainsStageRange(t *testing.T) {
	task := &SubtitleTask{}
	want := TaskProgress{Phase: "preparing_source", Percent: 100, Message: "媒体文件准备完成"}
	var got TaskProgress
	task.SetDetailedProgressReporter(func(progress TaskProgress) { got = progress })
	task.ReportProgress(want)
	if got != want || task.ProcessPct != 0 {
		t.Fatalf("统一流水线应保留独立的阶段进度: got=%+v, overall=%d", got, task.ProcessPct)
	}
}
