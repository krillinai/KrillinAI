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
