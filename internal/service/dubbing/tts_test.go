package dubbing

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type fakeTTS struct {
	failures int
	calls    int
}

func (f *fakeTTS) Text2Speech(text, voice, outputFile string) error {
	f.calls++
	if f.calls <= f.failures {
		return errors.New("tts failed")
	}
	return os.WriteFile(outputFile, []byte("wav"), 0644)
}

func TestGenerateRawSegmentsRetriesAndWritesFiles(t *testing.T) {
	dir := t.TempDir()
	tts := &fakeTTS{failures: 1}
	plan := []PlanItem{{Index: 1, SpokenText: "你好"}}
	got, err := GenerateRawSegments(context.Background(), tts, plan, "voice", dir, nil, func(string) (float64, error) {
		return 1.2, nil
	})
	if err != nil {
		t.Fatalf("GenerateRawSegments() error = %v", err)
	}
	if tts.calls != 2 {
		t.Fatalf("calls = %d, want 2", tts.calls)
	}
	if got[0].ActualDuration != 1.2 {
		t.Fatalf("ActualDuration = %v", got[0].ActualDuration)
	}
	if _, err := os.Stat(filepath.Join(dir, "raw", "1.wav")); err != nil {
		t.Fatalf("raw file missing: %v", err)
	}
}
