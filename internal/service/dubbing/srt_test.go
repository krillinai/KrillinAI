package dubbing

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseSRTSupportsMultilineCRLFAndNoTrailingBlank(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "input.srt")
	content := "1\r\n00:00:01,000 --> 00:00:03,500\r\n第一行\r\n第二行\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,250\r\n最后一句"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	cues, err := ParseSRTFile(path)
	if err != nil {
		t.Fatalf("ParseSRTFile() error = %v", err)
	}
	if len(cues) != 2 {
		t.Fatalf("len(cues) = %d, want 2", len(cues))
	}
	if cues[0].Start != 1 || cues[0].End != 3.5 || cues[0].Text != "第一行 第二行" {
		t.Fatalf("first cue = %+v", cues[0])
	}
	if cues[1].Start != 4 || cues[1].End != 5.25 || cues[1].Text != "最后一句" {
		t.Fatalf("second cue = %+v", cues[1])
	}
}

func TestParseSRTFileReturnsErrorForMalformedBlock(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.srt")
	content := "1\n00:00:01,000 --> 00:00:02,000\n你好\n\n2\n只有编号没有时间线\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseSRTFile(path); err == nil {
		t.Fatalf("ParseSRTFile() error = nil, want malformed block error")
	}
}

func TestParseSRTFileAllowsFlexibleArrowWhitespace(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "input.srt")
	content := "1\n00:00:01,000-->00:00:02,000\n你好\n\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	cues, err := ParseSRTFile(path)
	if err != nil {
		t.Fatalf("ParseSRTFile() error = %v", err)
	}
	if len(cues) != 1 || cues[0].Start != 1 || cues[0].End != 2 {
		t.Fatalf("cues = %+v", cues)
	}
}

func TestParseSRTFileRejectsNonPositiveCueDuration(t *testing.T) {
	cases := []struct {
		name    string
		content string
	}{
		{
			name:    "zero duration",
			content: "1\n00:00:01,000 --> 00:00:01,000\n你好\n\n",
		},
		{
			name:    "end before start",
			content: "1\n00:00:02,000 --> 00:00:01,000\n你好\n\n",
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "bad.srt")
			if err := os.WriteFile(path, []byte(tt.content), 0644); err != nil {
				t.Fatal(err)
			}
			if _, err := ParseSRTFile(path); err == nil {
				t.Fatalf("ParseSRTFile() error = nil, want non-positive duration error")
			}
		})
	}
}

func TestParseTimestampRejectsOutOfRangeValues(t *testing.T) {
	badValues := []string{
		"00:60:00,000",
		"00:00:60,000",
		"00:00:00,1000",
		"-01:00:00,000",
	}
	for _, value := range badValues {
		if _, err := ParseTimestamp(value); err == nil {
			t.Fatalf("ParseTimestamp(%q) error = nil, want range error", value)
		}
	}
}

func TestWriteSRTUsesNewTimeline(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dub.srt")
	cues := []Cue{{Index: 1, Start: 0.2, End: 1.45, Text: "你好"}, {Index: 2, Start: 2, End: 3.01, Text: "世界"}}
	if err := WriteSRTFile(path, cues); err != nil {
		t.Fatalf("WriteSRTFile() error = %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "1\n00:00:00,200 --> 00:00:01,450\n你好\n\n2\n00:00:02,000 --> 00:00:03,010\n世界\n\n"
	if string(data) != want {
		t.Fatalf("srt = %q, want %q", string(data), want)
	}
}
