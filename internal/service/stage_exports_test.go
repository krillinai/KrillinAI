package service

import (
	"context"
	"krillin-ai/internal/types"
	"testing"
)

func TestStageExportMethodsExist(t *testing.T) {
	var svc Service
	param := &types.SubtitleTaskStepParam{}

	_ = svc.PrepareMedia
	_ = svc.GenerateSubtitlesFromAudio
	_ = svc.GenerateSpeechFromSRT
	_ = svc.FinalizeSubtitleResults

	if false {
		_ = svc.PrepareMedia(context.Background(), param)
		_ = svc.GenerateSubtitlesFromAudio(context.Background(), param)
		_ = svc.GenerateSpeechFromSRT(context.Background(), param)
		_ = svc.FinalizeSubtitleResults(context.Background(), param)
	}
}
