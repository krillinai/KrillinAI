package service

import (
	"krillin-ai/internal/types"
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

func TestPrepareRenderVideoInputConvertsHorizontalVerticalRequest(t *testing.T) {
	workdir := filepath.Join("tasks", "demo")
	req := RenderVideoRequest{
		Workdir:    workdir,
		InputVideo: filepath.Join(workdir, "origin_video.mp4"),
		Horizontal: false,
		StepParam: &types.SubtitleTaskStepParam{
			TaskBasePath: workdir,
		},
	}

	got, err := prepareRenderVideoInput(req, 1280, 720, func(input, output, majorTitle, minorTitle string) error {
		if input != req.InputVideo {
			t.Fatalf("convert input = %q, want %q", input, req.InputVideo)
		}
		wantOutput := filepath.Join(workdir, types.SubtitleTaskTransferredVerticalVideoFileName)
		if output != wantOutput {
			t.Fatalf("convert output = %q, want %q", output, wantOutput)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("prepareRenderVideoInput() error = %v", err)
	}
	want := filepath.Join(workdir, types.SubtitleTaskTransferredVerticalVideoFileName)
	if got != want {
		t.Fatalf("prepareRenderVideoInput() = %q, want %q", got, want)
	}
	if req.StepParam.InputVideoPath != want {
		t.Fatalf("StepParam.InputVideoPath = %q, want %q", req.StepParam.InputVideoPath, want)
	}
}

func TestGetFontPathsUsesChineseCapableFontsOnDarwin(t *testing.T) {
	bold, regular, err := fontPathsForOS("darwin", func(path string) bool {
		return strings.Contains(path, "Hiragino Sans GB")
	})
	if err != nil {
		t.Fatalf("fontPathsForOS() error = %v", err)
	}
	if !strings.Contains(bold, "Arial Unicode") && !strings.Contains(bold, "Hiragino") && !strings.Contains(bold, "Heiti") {
		t.Fatalf("bold font %q does not look Chinese-capable", bold)
	}
	if !strings.Contains(regular, "Arial Unicode") && !strings.Contains(regular, "Hiragino") && !strings.Contains(regular, "Heiti") {
		t.Fatalf("regular font %q does not look Chinese-capable", regular)
	}
}

func TestGetFontPathsUsesChineseCapableFontsOnWindows(t *testing.T) {
	bold, regular, err := fontPathsForOS("windows", func(path string) bool {
		return strings.Contains(path, "msyh")
	})
	if err != nil {
		t.Fatalf("fontPathsForOS() error = %v", err)
	}
	if !strings.Contains(bold, "msyh") || !strings.Contains(regular, "msyh") {
		t.Fatalf("windows fonts = %q, %q; want Microsoft YaHei candidates", bold, regular)
	}
}

func TestBuildVerticalFilterEscapesTitleTextAndUsesCompactHeader(t *testing.T) {
	filter := buildVerticalFilter("CLI 集成测试: A's", "副标题", "/fonts/chinese.ttf", "/fonts/chinese.ttf")
	if !strings.Contains(filter, "drawbox=y=0:h=250") {
		t.Fatalf("filter should use compact 250px title header: %s", filter)
	}
	if !strings.Contains(filter, "fontsize=44") {
		t.Fatalf("filter should use smaller title font size: %s", filter)
	}
	if !strings.Contains(filter, `CLI 集成测试\: A\\'s`) {
		t.Fatalf("filter did not escape title text safely: %s", filter)
	}
}
