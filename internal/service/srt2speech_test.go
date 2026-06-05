package service

import (
	"path/filepath"
	"testing"
)

func TestTargetSRTPathForDubbingUsesTargetLanguageFile(t *testing.T) {
	base := filepath.Join("tasks", "demo")
	got := targetSRTPathForDubbing(base)
	want := filepath.Join(base, "target_language_srt.srt")
	if got != want {
		t.Fatalf("targetSRTPathForDubbing() = %q, want %q", got, want)
	}
}
