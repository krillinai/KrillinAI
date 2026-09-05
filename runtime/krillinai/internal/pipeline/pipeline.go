package pipeline

import (
	"fmt"
	"strings"
)

type PipelineRequest struct {
	Subtitle SubtitleRequest
	TTS      TTSRequest
	Outputs  string
	Async    bool
}

func PlanOutputs(outputs string) ([]Stage, error) {
	parts := strings.Split(outputs, ",")
	stages := make([]Stage, 0, len(parts))
	for _, part := range parts {
		output := strings.TrimSpace(part)
		switch output {
		case "subtitle":
			stages = append(stages, StageSubtitle)
		case "tts":
			stages = append(stages, StageTTS)
		case "horizontal-bilingual", "horizontal-dubbed":
			stages = append(stages, StageRenderHorizontal)
		case "vertical-bilingual", "vertical-dubbed":
			stages = append(stages, StageRenderVertical)
		case "cover":
			stages = append(stages, StageCover)
		case "":
		default:
			return nil, fmt.Errorf("unsupported output: %s", part)
		}
	}
	return stages, nil
}
