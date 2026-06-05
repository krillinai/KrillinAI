package dubbing

import (
	"math"
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

func TestAssembleAudioRejectsInvalidWindowBeforeRunner(t *testing.T) {
	dir := t.TempDir()
	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rawDir, "1.wav"), []byte("raw"), 0644); err != nil {
		t.Fatal(err)
	}
	calls := 0
	plan := []PlanItem{{Index: 1, NewStart: 1.0, NewEnd: 1.0, SpeedFactor: 1.0}}
	err := AssembleAudio(plan, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
		calls++
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "new end must be greater than new start") {
		t.Fatalf("AssembleAudio() error = %v, want invalid window error", err)
	}
	if calls != 0 {
		t.Fatalf("runner calls = %d, want 0", calls)
	}
}

func TestAssembleAudioRejectsOverlappingPlanBeforeRunner(t *testing.T) {
	dir := t.TempDir()
	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"1.wav", "2.wav"} {
		if err := os.WriteFile(filepath.Join(rawDir, name), []byte("raw"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	calls := 0
	plan := []PlanItem{
		{Index: 1, NewStart: 1.0, NewEnd: 2.0, SpeedFactor: 1.0},
		{Index: 2, NewStart: 0.5, NewEnd: 1.5, SpeedFactor: 1.0},
	}
	err := AssembleAudio(plan, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
		calls++
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "starts before previous end") {
		t.Fatalf("AssembleAudio() error = %v, want overlap error", err)
	}
	if calls != 0 {
		t.Fatalf("runner calls = %d, want 0", calls)
	}
}

func TestAssembleAudioRejectsInvalidSpeedFactorBeforeRunner(t *testing.T) {
	tests := []struct {
		name        string
		speedFactor float64
	}{
		{name: "zero", speedFactor: 0},
		{name: "infinity", speedFactor: math.Inf(1)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			rawDir := filepath.Join(dir, "raw")
			if err := os.MkdirAll(rawDir, 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(rawDir, "1.wav"), []byte("raw"), 0644); err != nil {
				t.Fatal(err)
			}
			calls := 0
			plan := []PlanItem{{Index: 1, NewStart: 0, NewEnd: 1, SpeedFactor: tt.speedFactor}}
			err := AssembleAudio(plan, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
				calls++
				t.Fatalf("runner called with args = %v", args)
				return nil
			})
			if err == nil {
				t.Fatal("AssembleAudio() error = nil, want invalid speed factor error")
			}
			if calls != 0 {
				t.Fatalf("runner calls = %d, want 0", calls)
			}
		})
	}
}

func TestAssembleAudioRejectsMissingRawSegmentBeforeRunner(t *testing.T) {
	dir := t.TempDir()
	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		t.Fatal(err)
	}
	calls := 0
	plan := []PlanItem{{Index: 1, NewStart: 0, NewEnd: 1, SpeedFactor: 1}}
	err := AssembleAudio(plan, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
		calls++
		t.Fatalf("runner called with args = %v", args)
		return nil
	})
	if err == nil {
		t.Fatal("AssembleAudio() error = nil, want missing raw segment error")
	}
	if calls != 0 {
		t.Fatalf("runner calls = %d, want 0", calls)
	}
}

func TestAssembleAudioRejectsEmptyPlan(t *testing.T) {
	dir := t.TempDir()
	calls := 0
	err := AssembleAudio(nil, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
		calls++
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "plan is empty") {
		t.Fatalf("AssembleAudio() error = %v, want empty plan error", err)
	}
	if calls != 0 {
		t.Fatalf("runner calls = %d, want 0", calls)
	}
}
