package service

import (
	"context"
	"errors"
	"krillin-ai/internal/types"
	pkgimage "krillin-ai/pkg/image"
)

var ErrYouTubeSubtitleServiceNotInitialized = errors.New("youtube subtitle service not initialized")
var ErrImageClientNotInitialized = errors.New("image client not initialized")

func (s Service) PrepareMedia(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.linkToFile(ctx, stepParam)
}

func (s Service) GenerateSubtitlesFromAudio(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.audioToSubtitle(ctx, stepParam)
}

func (s Service) GenerateSpeechFromSRT(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.srtFileToSpeech(ctx, stepParam)
}

func (s Service) FinalizeSubtitleResults(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.uploadSubtitles(ctx, stepParam)
}

func (s Service) DownloadYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	if s.YouTubeSubtitleSrv == nil {
		return "", ErrYouTubeSubtitleServiceNotInitialized
	}
	return s.YouTubeSubtitleSrv.downloadYouTubeSubtitle(ctx, req)
}

func (s Service) ProcessYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	if s.YouTubeSubtitleSrv == nil {
		return "", ErrYouTubeSubtitleServiceNotInitialized
	}
	return s.YouTubeSubtitleSrv.processYouTubeSubtitle(ctx, req)
}

func (s Service) GenerateCoverImage(ctx context.Context, req pkgimage.GenerateRequest) (pkgimage.GenerateResult, error) {
	if s.ImageClient == nil {
		return pkgimage.GenerateResult{}, ErrImageClientNotInitialized
	}
	return s.ImageClient.Generate(ctx, req)
}
