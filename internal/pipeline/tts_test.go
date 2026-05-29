package pipeline

import (
	"context"
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
