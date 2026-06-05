package dubbing

import (
	"strings"
	"testing"
)

func TestBuildAtempoFilterChainsLargeSpeed(t *testing.T) {
	got := buildAtempoFilter(3.0)
	if got != "atempo=2.000,atempo=1.500" {
		t.Fatalf("buildAtempoFilter(3) = %q", got)
	}
}

func TestBuildMuxArgsMapsVideoAndDubAudio(t *testing.T) {
	args := buildMuxArgs("input.mp4", "dub.wav", "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-map 0:v:0") || !strings.Contains(joined, "-map 1:a:0") {
		t.Fatalf("args should map original video and dub audio: %v", args)
	}
}
