package dubbing

import (
	"fmt"
	"krillin-ai/internal/storage"
	"math"
	"os/exec"
	"strings"
)

func defaultFFmpegRunner(args []string) error {
	cmd := exec.Command(storage.FfmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %w, output: %s", err, string(output))
	}
	return nil
}

func WriteTinySilence(output string, run CommandRunner) error {
	if run == nil {
		run = defaultFFmpegRunner
	}
	return run([]string{
		"-y",
		"-f", "lavfi",
		"-i", "anullsrc=channel_layout=mono:sample_rate=44100",
		"-t", "0.100",
		"-ar", "44100",
		"-ac", "1",
		"-c:a", "pcm_s16le",
		output,
	})
}

func buildAtempoFilter(speed float64) (string, error) {
	if speed <= 0 || math.IsNaN(speed) || math.IsInf(speed, 0) {
		return "", fmt.Errorf("speed must be finite and > 0: %v", speed)
	}

	parts := []string{}
	for speed > 2.0 {
		parts = append(parts, "atempo=2.000")
		speed /= 2.0
	}
	for speed < 0.5 {
		parts = append(parts, "atempo=0.500")
		speed /= 0.5
	}
	parts = append(parts, fmt.Sprintf("atempo=%.3f", speed))
	return strings.Join(parts, ","), nil
}

func buildMuxArgs(inputVideo, inputAudio, outputVideo string) []string {
	return []string{
		"-y",
		"-i", inputVideo,
		"-i", inputAudio,
		"-c:v", "copy",
		"-map", "0:v:0",
		"-map", "1:a:0",
		"-c:a", "aac",
		"-b:a", "192k",
		"-shortest",
		outputVideo,
	}
}
