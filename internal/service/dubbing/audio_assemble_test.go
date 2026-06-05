package dubbing

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssembleAudioWritesConcatListInFittedDir(t *testing.T) {
	dir := t.TempDir()
	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rawDir, "1.wav"), []byte("raw"), 0644); err != nil {
		t.Fatal(err)
	}
	plan := []PlanItem{{Index: 1, NewStart: 0.5, NewEnd: 1.3, SpeedFactor: 1.0}}
	err := AssembleAudio(plan, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
		return os.WriteFile(args[len(args)-1], []byte("media"), 0644)
	})
	if err != nil {
		t.Fatalf("AssembleAudio() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "fitted", "concat.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "silence_1.wav") || !strings.Contains(string(data), "1.wav") {
		t.Fatalf("concat list = %q", string(data))
	}
}
