package dubbing

import (
	"context"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
)

func GenerateRawSegments(ctx context.Context, tts types.Ttser, plan []PlanItem, voice, dir string, run CommandRunner, duration DurationProbe) ([]PlanItem, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if run == nil {
		run = defaultFFmpegRunner
	}
	if duration == nil {
		return nil, errors.New("duration probe is required")
	}

	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		return nil, err
	}

	for i := range plan {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		output := filepath.Join(rawDir, fmt.Sprintf("%d.wav", plan[i].Index))
		if IsSilenceOnlyText(plan[i].SpokenText) {
			if err := WriteTinySilence(output, run); err != nil {
				return nil, err
			}
		} else {
			if tts == nil {
				return nil, errors.New("tts is required for non-silence text")
			}
			if err := retryTTS(tts, plan[i].SpokenText, voice, output, 3); err != nil {
				return nil, fmt.Errorf("tts segment %d failed: %w", plan[i].Index, err)
			}
		}

		dur, err := duration(output)
		if err != nil {
			return nil, err
		}
		plan[i].ActualDuration = dur
	}

	return plan, nil
}

func retryTTS(tts types.Ttser, text, voice, output string, attempts int) error {
	var last error
	for i := 0; i < attempts; i++ {
		last = tts.Text2Speech(text, voice, output)
		if last == nil {
			if _, err := os.Stat(output); err == nil {
				return nil
			}
			last = fmt.Errorf("output file missing: %s", output)
		}
	}
	return last
}
