package dubbing

import (
	"math"
	"strings"
	"testing"
)

func TestBuildAtempoFilterChainsLargeSpeed(t *testing.T) {
	got, err := buildAtempoFilter(3.0)
	if err != nil {
		t.Fatalf("buildAtempoFilter(3) error = %v", err)
	}
	if got != "atempo=2.000,atempo=1.500" {
		t.Fatalf("buildAtempoFilter(3) = %q", got)
	}
}

func TestBuildAtempoFilterChainsSmallSpeed(t *testing.T) {
	got, err := buildAtempoFilter(0.25)
	if err != nil {
		t.Fatalf("buildAtempoFilter(0.25) error = %v", err)
	}
	if got != "atempo=0.500,atempo=0.500" {
		t.Fatalf("buildAtempoFilter(0.25) = %q", got)
	}
}

func TestBuildAtempoFilterRejectsInvalidSpeed(t *testing.T) {
	for _, speed := range []float64{0, -1, math.Inf(1), math.NaN()} {
		if got, err := buildAtempoFilter(speed); err == nil {
			t.Fatalf("buildAtempoFilter(%v) = %q, nil error", speed, got)
		}
	}
}

func TestBuildMuxArgsMapsVideoAndDubAudio(t *testing.T) {
	args := buildMuxArgs("input.mp4", "dub.wav", "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-map 0:v:0") || !strings.Contains(joined, "-map 1:a:0") {
		t.Fatalf("args should map original video and dub audio: %v", args)
	}
	if !strings.Contains(joined, "-shortest") {
		t.Fatalf("args should include -shortest: %v", args)
	}
}
