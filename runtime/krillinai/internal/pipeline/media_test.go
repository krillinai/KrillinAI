package pipeline

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareVideoOnDemandAndReuseAcrossStages(t *testing.T) {
	root := t.TempDir()
	cache := filepath.Join(root, "source-media")
	firstWorkdir := filepath.Join(root, "first")
	if err := os.MkdirAll(firstWorkdir, 0700); err != nil {
		t.Fatal(err)
	}
	first := NewManifest("first", firstWorkdir)
	fake := &fakeStageService{}
	video, err := ensureSourceVideo(context.Background(), fake, first, "https://www.youtube.com/watch?v=demo", cache, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(fake.calls) != 1 || fake.lastPrepare == nil || !fake.lastPrepare.SkipAudio {
		t.Fatalf("media preparation = %+v, calls = %v", fake.lastPrepare, fake.calls)
	}
	second := NewManifest("second", filepath.Join(root, "second"))
	reused, err := ensureSourceVideo(context.Background(), fake, second, "https://www.youtube.com/watch?v=demo", cache, nil)
	if err != nil || reused != video || len(fake.calls) != 1 {
		t.Fatalf("video = %s, error = %v, calls = %v", reused, err, fake.calls)
	}
}

func TestGenerateAudioOnlyTTSDoesNotPrepareVideo(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "target.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\nhello\n\n"), 0600); err != nil {
		t.Fatal(err)
	}
	fake := &fakeStageService{}
	response, err := GenerateTTS(context.Background(), fake, TTSRequest{Workdir: root, TaskID: "audio-only", InputSRT: input, AudioOnly: true, SourceURL: "https://www.youtube.com/watch?v=demo"})
	if err != nil || !response.OK {
		t.Fatalf("response = %+v, error = %v", response, err)
	}
	if fake.lastSpeech == nil || !fake.lastSpeech.TtsAudioOnly || fake.lastSpeech.InputVideoPath != "" || response.Outputs.VideoWithTTS != "" {
		t.Fatalf("audio-only output = %+v, step = %+v", response.Outputs, fake.lastSpeech)
	}
	for _, call := range fake.calls {
		if call == "prepare" {
			t.Fatal("audio-only TTS prepared a video")
		}
	}
}
