package pipeline

import (
	"context"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestVideoStagesForwardActualWorkWithoutRegressing(t *testing.T) {
	for _, stage := range []string{"subtitle", "tts", "render"} {
		t.Run(stage, func(t *testing.T) {
			events := []types.TaskProgress{
				{Phase: "processing_audio", Percent: 25, Message: "audio details", Completed: 0, Total: 8},
				{Phase: "processing_audio", Percent: 50, Message: "partial results", Completed: 3, Total: 8},
				{Phase: "processing_audio", Percent: 45, Message: "late transcription update", Completed: 3, Total: 8},
				{Phase: "processing_audio", Percent: 50, Message: "same percent, more work", Completed: 4, Total: 8},
			}
			fake := &fakeStageService{detailedProgress: events}
			var counts []ProgressCounts
			last := 0
			report := func(phase string, percent int, message string, details ...ProgressCounts) {
				if percent < last || percent >= 100 {
					t.Fatalf("invalid stage progress: %d -> %d", last, percent)
				}
				last = percent
				if len(details) > 0 {
					counts = append(counts, details[0])
				}
			}
			var err error
			switch stage {
			case "subtitle":
				_, err = GenerateSubtitles(context.Background(), fake, SubtitleRequest{Workdir: t.TempDir(), CaptionSource: CaptionSourceWhisper, ReportProgress: report})
				// The fake also uses these events for media preparation.
				counts = counts[len(events):]
			case "tts":
				_, err = GenerateTTS(context.Background(), fake, TTSRequest{Workdir: t.TempDir(), AudioOnly: true, ReportProgress: report})
			case "render":
				_, err = Render(context.Background(), fake, RenderRequest{Workdir: t.TempDir(), Horizontal: true, ReportProgress: report})
			}
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(counts, []ProgressCounts{{0, 8}, {3, 8}, {3, 8}, {4, 8}}) {
				t.Fatalf("detailed progress lost: %+v", counts)
			}
		})
	}
}

func TestSubtitleDraftWorkProgressUsesTranslationRange(t *testing.T) {
	for _, source := range []string{"platform", "import"} {
		t.Run(source, func(t *testing.T) {
			root := t.TempDir()
			fake := &fakeStageService{translationWorkProgress: []types.TaskProgress{
				{Phase: "translating_subtitles", Percent: 0, Message: "正在整理原文翻译单元"},
				{Phase: "translating_subtitles", Percent: 0, Message: "正在整理字幕语境", Total: 10},
				{Phase: "translating_subtitles", Percent: 20, Message: "初译 5/10；字幕完成 0/10；正在审校", Total: 10},
			}}
			var percentages []int
			req := SubtitleRequest{Input: "https://www.youtube.com/watch?v=progress", Workdir: root, OriginLang: "en", TargetLang: "zh_cn"}
			start, end := 5, 96
			if source == "import" {
				req.InputSRT = filepath.Join(root, "input.srt")
				if err := os.WriteFile(req.InputSRT, []byte("1\n00:00:00,000 --> 00:00:01,000\nHello.\n"), 0600); err != nil {
					t.Fatal(err)
				}
				start, end = 5, 95
			}
			req.ReportProgress = func(phase string, percent int, message string, counts ...ProgressCounts) {
				if phase == "translating_subtitles" && (message == "正在整理原文翻译单元" || len(counts) > 0) {
					percentages = append(percentages, percent)
					if len(counts) > 0 && (counts[0].Completed != 0 || counts[0].Total != 10) {
						t.Fatalf("draft was counted as completed: %v", counts)
					}
				}
			}
			_, err := GenerateSubtitles(context.Background(), fake, req)
			want := []int{start, start, start + (end-start)*20/100}
			if err != nil || !reflect.DeepEqual(percentages, want) {
				t.Fatalf("progress=%v want=%v err=%v", percentages, want, err)
			}
		})
	}
}

func TestPlatformVideoTranslationReportsSentenceCounts(t *testing.T) {
	fake := &fakeStageService{translationProgress: []ProgressCounts{{0, 13}, {1, 13}, {13, 13}}}
	var counts []ProgressCounts
	_, err := GenerateSubtitles(context.Background(), fake, SubtitleRequest{
		Input: "https://www.youtube.com/watch?v=progress", Workdir: t.TempDir(), OriginLang: "en", TargetLang: "zh_cn",
		ReportProgress: func(phase string, percent int, _ string, details ...ProgressCounts) {
			if len(details) > 0 {
				if phase != "translating_subtitles" || percent > 96 {
					t.Fatalf("wrong phase/range: %s %d", phase, percent)
				}
				counts = append(counts, details[0])
			}
		},
	})
	if err != nil || !reflect.DeepEqual(counts, fake.translationProgress) {
		t.Fatalf("counts=%v, error=%v", counts, err)
	}
}

func TestDetailedSubtitleProgressIsNotOverwrittenByLegacyCounts(t *testing.T) {
	task := &types.SubtitleTask{}
	var events []types.TaskProgress
	forwardSubtitleTranslationProgress(task, func(phase string, percent int, message string, counts ...ProgressCounts) {
		events = append(events, types.TaskProgress{Phase: phase, Percent: percent, Message: message})
	}, 5, 96, "legacy")
	task.ReportTranslationWorkProgress(types.TaskProgress{Phase: "translating_subtitles", Percent: 50, Message: "初译 10/10；字幕完成 0/10；正在审校", Total: 10})
	task.SetTranslationProgress(0, 10)
	if len(events) != 1 || events[0].Percent < 50 || events[0].Message == "legacy" {
		t.Fatalf("legacy counters hid detailed work: %+v", events)
	}
}

func TestPlatformTranslationReservesVideoPreparationOnlyWhenRequested(t *testing.T) {
	for _, prepareVideo := range []bool{false, true} {
		fake := &fakeStageService{translationWorkProgress: []types.TaskProgress{
			{Phase: "translating_subtitles", Percent: 100, Completed: 10, Total: 10},
		}}
		translationEnd := 0
		_, err := GenerateSubtitles(context.Background(), fake, SubtitleRequest{
			Input: "https://www.youtube.com/watch?v=progress", Workdir: t.TempDir(), PrepareVideo: prepareVideo,
			ReportProgress: func(phase string, percent int, _ string, _ ...ProgressCounts) {
				if phase == "translating_subtitles" {
					translationEnd = percent
				}
			},
		})
		want := 96
		if prepareVideo {
			want = 85
		}
		if err != nil || translationEnd != want {
			t.Fatalf("prepareVideo=%v translationEnd=%d want=%d err=%v", prepareVideo, translationEnd, want, err)
		}
	}
}
