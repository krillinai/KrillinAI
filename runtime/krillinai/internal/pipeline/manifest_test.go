package pipeline

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManifestRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := NewManifest("demo", dir)
	m.InputURL = "https://www.youtube.com/watch?v=abc"
	m.OriginLanguage = "en"
	m.TargetLanguage = "zh_cn"
	m.Outputs.BilingualSRT = filepath.Join(dir, "bilingual_srt.srt")
	m.MarkStage(StageSubtitle, true, "")

	if err := m.Save(); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	loaded, err := LoadManifest(dir)
	if err != nil {
		t.Fatalf("LoadManifest() error = %v", err)
	}
	if loaded.TaskID != "demo" {
		t.Fatalf("TaskID = %q, want demo", loaded.TaskID)
	}
	if loaded.Stages[string(StageSubtitle)].OK != true {
		t.Fatalf("subtitle stage not marked ok")
	}
}

func TestApplyDefaultOutputs(t *testing.T) {
	dir := t.TempDir()
	m := NewManifest("demo", dir)
	if err := m.ApplyDefaultOutputs(); err != nil {
		t.Fatalf("ApplyDefaultOutputs() error = %v", err)
	}

	want := filepath.Join(dir, "target_language_srt.srt")
	if m.Outputs.TargetSRT != want {
		t.Fatalf("TargetSRT = %q, want %q", m.Outputs.TargetSRT, want)
	}
	if m.Outputs.ShortOriginMixedSRT != filepath.Join(dir, "short_origin_mixed_srt.srt") {
		t.Fatalf("ShortOriginMixedSRT = %q", m.Outputs.ShortOriginMixedSRT)
	}
	if _, err := os.Stat(filepath.Join(dir, "output")); err != nil {
		t.Fatalf("output dir was not created: %v", err)
	}
}
