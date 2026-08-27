package pipeline

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractTargetOnlyKeepsSingleLineBlocks(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "target.srt")
	out := filepath.Join(dir, "tts.srt")
	content := "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractTargetSRT(in, out, LineModeTargetOnly); err != nil {
		t.Fatalf("ExtractTargetSRT() error = %v", err)
	}
	got, _ := os.ReadFile(out)
	if string(got) != content {
		t.Fatalf("output = %q, want %q", string(got), content)
	}
}

func TestExtractBilingualTargetTop(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "bilingual.srt")
	out := filepath.Join(dir, "tts.srt")
	content := "1\n00:00:00,000 --> 00:00:01,000\n你好\nhello\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractTargetSRT(in, out, LineModeBilingualTargetTop); err != nil {
		t.Fatalf("ExtractTargetSRT() error = %v", err)
	}
	got, _ := os.ReadFile(out)
	if !strings.Contains(string(got), "\n你好\n\n") {
		t.Fatalf("target top not extracted: %q", string(got))
	}
	if strings.Contains(string(got), "hello") {
		t.Fatalf("origin line leaked into target output: %q", string(got))
	}
}

func TestExtractBilingualTargetBottom(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "bilingual.srt")
	out := filepath.Join(dir, "tts.srt")
	content := "1\n00:00:00,000 --> 00:00:01,000\nhello\n你好\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractTargetSRT(in, out, LineModeBilingualTargetBottom); err != nil {
		t.Fatalf("ExtractTargetSRT() error = %v", err)
	}
	got, _ := os.ReadFile(out)
	if !strings.Contains(string(got), "\n你好\n\n") {
		t.Fatalf("target bottom not extracted: %q", string(got))
	}
}

func TestValidateSRTTimelineRejectsInvalidDuration(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "invalid.srt")
	content := "1\n00:00:01,000 --> 00:00:01,000\nhello\n\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := validateSRTTimelineFile(path, false); err == nil {
		t.Fatal("validateSRTTimelineFile() error = nil, want invalid duration")
	}
}

func TestValidateSRTTimelineAllowsOverlapOnlyWhenRequested(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mixed.srt")
	content := "1\n00:00:01,000 --> 00:00:02,000\ntarget\n\n2\n00:00:01,200 --> 00:00:01,500\norigin\n\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := validateSRTTimelineFile(path, false); err == nil {
		t.Fatal("validateSRTTimelineFile() error = nil, want overlap error")
	}
	if err := validateSRTTimelineFile(path, true); err != nil {
		t.Fatalf("validateSRTTimelineFile(allow overlap) error = %v", err)
	}
}
