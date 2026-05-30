package pipeline

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateTTSExtractsBilingualTargetBeforeSpeech(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "bilingual.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\nhello\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	fake := &fakeStageService{}
	req := TTSRequest{
		Workdir:  dir,
		TaskID:   "demo",
		InputSRT: input,
		LineMode: LineModeBilingualTargetBottom,
	}
	resp, err := GenerateTTS(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateTTS() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	extracted := filepath.Join(dir, "tts_input.srt")
	data, err := os.ReadFile(extracted)
	if err != nil {
		t.Fatalf("tts input not written: %v", err)
	}
	if string(data) != "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n" {
		t.Fatalf("tts input = %q", string(data))
	}
	if fake.lastSpeech == nil {
		t.Fatalf("GenerateSpeechFromSRT was not called")
	}
	if fake.lastSpeech.TtsSourceFilePath != extracted {
		t.Fatalf("TtsSourceFilePath = %q, want %q", fake.lastSpeech.TtsSourceFilePath, extracted)
	}
}

func TestGenerateTTSUsesManifestTargetSRTWhenInputEmpty(t *testing.T) {
	dir := t.TempDir()
	customTarget := filepath.Join(dir, "custom_target.srt")
	if err := os.WriteFile(customTarget, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	manifest := NewManifest("demo", dir)
	manifest.Outputs.TargetSRT = customTarget
	manifest.FailedIndexes = []int{2}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(ManifestPath(dir), data, 0644); err != nil {
		t.Fatal(err)
	}

	fake := &fakeStageService{}
	req := TTSRequest{
		Workdir:          dir,
		TaskID:           "demo",
		Video:            "custom_video.mp4",
		Voice:            "voice-a",
		VoiceCloneSource: "clone.wav",
	}
	resp, err := GenerateTTS(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateTTS() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if fake.lastSpeech == nil {
		t.Fatalf("GenerateSpeechFromSRT was not called")
	}
	if fake.lastSpeech.TtsSourceFilePath != customTarget {
		t.Fatalf("TtsSourceFilePath = %q, want %q", fake.lastSpeech.TtsSourceFilePath, customTarget)
	}
	if !fake.lastSpeech.EnableTts {
		t.Fatalf("EnableTts = false, want true")
	}
	if fake.lastSpeech.InputVideoPath != "custom_video.mp4" {
		t.Fatalf("InputVideoPath = %q", fake.lastSpeech.InputVideoPath)
	}
	if fake.lastSpeech.TtsVoiceCode != "voice-a" {
		t.Fatalf("TtsVoiceCode = %q", fake.lastSpeech.TtsVoiceCode)
	}
	if fake.lastSpeech.VoiceCloneAudioUrl != "clone.wav" {
		t.Fatalf("VoiceCloneAudioUrl = %q", fake.lastSpeech.VoiceCloneAudioUrl)
	}
	if len(resp.FailedIndexes) != 1 || resp.FailedIndexes[0] != 2 {
		t.Fatalf("FailedIndexes = %v, want [2]", resp.FailedIndexes)
	}
}
