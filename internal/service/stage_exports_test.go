package service

import (
	"context"
	"errors"
	"krillin-ai/internal/types"
	"testing"
)

type stageExporter interface {
	PrepareMedia(context.Context, *types.SubtitleTaskStepParam) error
	GenerateSubtitlesFromAudio(context.Context, *types.SubtitleTaskStepParam) error
	GenerateSpeechFromSRT(context.Context, *types.SubtitleTaskStepParam) error
	FinalizeSubtitleResults(context.Context, *types.SubtitleTaskStepParam) error
	DownloadYouTubeSubtitle(context.Context, *YoutubeSubtitleReq) (string, error)
	ProcessYouTubeSubtitle(context.Context, *YoutubeSubtitleReq) (string, error)
}

var _ stageExporter = Service{}

func TestStageExportMethodsExist(t *testing.T) {
	var _ stageExporter = Service{}
}

func TestYouTubeStageExportsReturnErrorWhenServiceMissing(t *testing.T) {
	var svc Service

	if _, err := svc.DownloadYouTubeSubtitle(context.Background(), &YoutubeSubtitleReq{}); !errors.Is(err, ErrYouTubeSubtitleServiceNotInitialized) {
		t.Fatalf("DownloadYouTubeSubtitle error = %v, want %v", err, ErrYouTubeSubtitleServiceNotInitialized)
	}

	if _, err := svc.ProcessYouTubeSubtitle(context.Background(), &YoutubeSubtitleReq{}); !errors.Is(err, ErrYouTubeSubtitleServiceNotInitialized) {
		t.Fatalf("ProcessYouTubeSubtitle error = %v, want %v", err, ErrYouTubeSubtitleServiceNotInitialized)
	}
}
