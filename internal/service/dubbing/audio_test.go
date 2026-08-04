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
	// apad 必须与 -shortest 同时存在：只有 -shortest 会截断视频尾部，
	// 只有 apad 会无限补静音导致 ffmpeg 不退出。
	if !strings.Contains(joined, "-af apad") {
		t.Fatalf("args should pad audio with apad so the video tail is not truncated: %v", args)
	}
}

func TestBuildMuxArgsPadsAudioInsteadOfTruncatingVideo(t *testing.T) {
	args := buildMuxArgs("input.mp4", "dub.wav", "out.mp4")

	// 真实约束是 apad 必须作为 -af 的值出现（裸 token 会被 ffmpeg 当成输出文件），
	// 且 -shortest 必须同时存在。两者在命令行上的先后顺序不影响 ffmpeg 行为：
	// -af 是滤镜选项，-shortest 是输出选项，作用在不同阶段。
	afValue, shortest := "", false
	for i, a := range args {
		switch a {
		case "-af":
			if i+1 < len(args) {
				afValue = args[i+1]
			}
		case "-shortest":
			shortest = true
		}
	}
	if afValue != "apad" {
		t.Fatalf("-af should be apad, got %q: %v", afValue, args)
	}
	if !shortest {
		t.Fatalf("-shortest missing: %v", args)
	}
}
