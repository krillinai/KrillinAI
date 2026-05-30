package service

import (
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"krillin-ai/internal/types"
)

func TestSplitChineseTextDoesNotBreakCommonWords(t *testing.T) {
	got := splitChineseText("你花在刷屏上的每一小时", 10)
	joined := strings.Join(got, "\n")
	if strings.Contains(joined, "小\n时") {
		t.Fatalf("splitChineseText broke 小时: %q", joined)
	}
	if strings.Contains(joined, "每一小\n时") {
		t.Fatalf("splitChineseText broke 每一小时: %q", joined)
	}
}

func TestSplitChineseTextAvoidsShortTrailingLine(t *testing.T) {
	got := splitChineseText("你每小时花在划屏上的时间", 10)
	joined := strings.Join(got, "\n")
	if strings.HasSuffix(joined, "\n时间") {
		t.Fatalf("splitChineseText created a short trailing line: %q", joined)
	}
	if len(got) != 2 {
		t.Fatalf("line count = %d, want 2; lines = %#v", len(got), got)
	}
}

func TestSplitChineseTextBalancesDisplayWidth(t *testing.T) {
	got := splitChineseText("你花在刷屏上的每一小时都会从未来的自己那里借走注意力", 10)
	if len(got) < 2 {
		t.Fatalf("line count = %d, want at least 2; lines = %#v", len(got), got)
	}

	firstWidth := subtitleDisplayWidth(got[0])
	secondWidth := subtitleDisplayWidth(got[1])
	if math.Abs(float64(firstWidth-secondWidth)) > 6 {
		t.Fatalf("line widths are not balanced: lines=%#v widths=%d,%d", got, firstWidth, secondWidth)
	}
}

func TestVerticalAssKeepsChineseLineInSingleDialogueWithLineBreak(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "short.srt")
	out := filepath.Join(dir, "short.ass")
	content := "1\n00:00:28,600 --> 00:00:30,190\n大多数人看完这个视频后什么也不会做。\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	err := srtToAss(in, out, false, &types.SubtitleTaskStepParam{TaskBasePath: dir})
	if err != nil {
		t.Fatalf("srtToAss() error = %v", err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	ass := string(data)
	if count := strings.Count(ass, "Dialogue:"); count != 1 {
		t.Fatalf("Dialogue count = %d, want 1; ass = %s", count, ass)
	}
	if strings.Contains(ass, `\N`) {
		t.Fatalf("moderate vertical Chinese subtitle should stay on one line: %s", ass)
	}
}

func subtitleDisplayWidth(text string) int {
	width := 0
	for _, r := range text {
		if r >= '\u4e00' && r <= '\u9fff' {
			width += 2
		} else {
			width++
		}
	}
	return width
}

func TestVerticalAssSplitsLongChineseAcrossTime(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "short.srt")
	out := filepath.Join(dir, "short.ass")
	content := "1\n00:00:28,600 --> 00:00:30,190\n你花在刷屏上的每一小时都会从未来的自己那里借走注意力。\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	err := srtToAss(in, out, false, &types.SubtitleTaskStepParam{TaskBasePath: dir})
	if err != nil {
		t.Fatalf("srtToAss() error = %v", err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	ass := string(data)
	if count := strings.Count(ass, "Dialogue:"); count < 2 {
		t.Fatalf("Dialogue count = %d, want at least 2 for time-sliced Chinese lines; ass = %s", count, ass)
	}
	if strings.Contains(ass, `\N`) {
		t.Fatalf("long vertical Chinese subtitle should be split across time, not stacked with line breaks: %s", ass)
	}
}
