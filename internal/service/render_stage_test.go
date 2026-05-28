package service

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildEmbedSubtitleArgsUsesRequestedSubtitleAndOutput(t *testing.T) {
	req := RenderVideoRequest{
		Workdir:      "tasks/demo",
		InputVideo:   "tasks/demo/origin_video.mp4",
		SubtitleFile: "tasks/demo/target_language_srt.srt",
		OutputFile:   "tasks/demo/output/horizontal_dubbed.mp4",
		Horizontal:   true,
	}
	args, assPath := buildEmbedSubtitleArgs(req)
	joined := strings.Join(args, " ")
	if !strings.Contains(assPath, filepath.Join("tasks", "demo")) {
		t.Fatalf("assPath = %q does not use workdir", assPath)
	}
	if !strings.Contains(joined, "tasks/demo/origin_video.mp4") {
		t.Fatalf("args do not contain input video: %v", args)
	}
	if !strings.Contains(joined, "tasks/demo/output/horizontal_dubbed.mp4") {
		t.Fatalf("args do not contain output file: %v", args)
	}
}

func TestRenderAssPathDerivesFromOutputFile(t *testing.T) {
	req := RenderVideoRequest{
		Workdir:    "tasks/demo",
		OutputFile: "tasks/demo/output/horizontal_dubbed.mp4",
	}

	got := renderAssPath(req)
	want := filepath.Join("tasks", "demo", "formatted_horizontal_dubbed.ass")
	if got != want {
		t.Fatalf("renderAssPath() = %q, want %q", got, want)
	}
	if strings.Contains(got, "formatted_subtitles.ass") {
		t.Fatalf("renderAssPath() still uses fixed subtitle name: %q", got)
	}
}

func TestEscapeAssFilterPathEscapesWindowsDriveAndSeparators(t *testing.T) {
	got := escapeAssFilterPath(`C:\tasks\demo\formatted_horizontal_dubbed.ass`)
	want := `C\:/tasks/demo/formatted_horizontal_dubbed.ass`
	if got != want {
		t.Fatalf("escapeAssFilterPath() = %q, want %q", got, want)
	}
}
