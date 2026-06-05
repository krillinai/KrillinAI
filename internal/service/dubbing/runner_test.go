package dubbing

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fakeRunnerWritingOutputs(dir string) CommandRunner {
	return func(args []string) error {
		out := args[len(args)-1]
		if strings.HasSuffix(out, ".wav") || strings.HasSuffix(out, ".mp4") {
			return os.WriteFile(out, []byte("media"), 0644)
		}
		return nil
	}
}

func TestRunWritesDubbingArtifactsWithFakeTTS(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.srt")
	video := filepath.Join(dir, "origin.mp4")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(video, []byte("video"), 0644); err != nil {
		t.Fatal(err)
	}
	deps := Dependencies{
		TTS:         &fakeTTS{writeOnReturn: true},
		Language:    "zh_cn",
		Voice:       "voice",
		Workdir:     dir,
		InputSRT:    input,
		InputVideo:  video,
		OutputAudio: filepath.Join(dir, "tts_final_audio.wav"),
		OutputVideo: filepath.Join(dir, "video_with_tts.mp4"),
		Config:      DefaultConfig(),
		FFmpeg:      fakeRunnerWritingOutputs(dir),
		Duration: func(string) (float64, error) {
			return 0.8, nil
		},
	}
	result, err := NewRunner(deps).Run(context.Background())
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	for _, path := range []string{
		filepath.Join(dir, DubbingDirName, DubbingInputFileName),
		filepath.Join(dir, DubbingDirName, DubbingPlanFileName),
		filepath.Join(dir, DubbingDirName, DubbingReportName),
		filepath.Join(dir, DubbingDirName, DubSubtitleFileName),
		result.Audio,
		result.Video,
	} {
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			t.Fatalf("missing output %s: info=%v err=%v", path, info, err)
		}
	}
}

func TestRunnerRequiresInputVideoForMux(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	deps := Dependencies{
		TTS:         &fakeTTS{writeOnReturn: true},
		Language:    "zh_cn",
		Voice:       "voice",
		Workdir:     dir,
		InputSRT:    input,
		OutputAudio: filepath.Join(dir, "tts_final_audio.wav"),
		OutputVideo: filepath.Join(dir, "video_with_tts.mp4"),
		Config:      DefaultConfig(),
		FFmpeg:      fakeRunnerWritingOutputs(dir),
		Duration: func(string) (float64, error) {
			return 0.8, nil
		},
	}
	_, err := NewRunner(deps).Run(context.Background())
	if err == nil {
		t.Fatalf("Run() error = nil, want missing input video error")
	}
}
