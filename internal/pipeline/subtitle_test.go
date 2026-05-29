package pipeline

import (
	"context"
	"errors"
	"krillin-ai/internal/service"
	"krillin-ai/internal/types"
	"testing"
)

type fakeStageService struct {
	downloadErr error
	processErr  error
	calls       []string
}

func (f *fakeStageService) PrepareMedia(context.Context, *types.SubtitleTaskStepParam) error {
	f.calls = append(f.calls, "prepare")
	return nil
}

func (f *fakeStageService) GenerateSubtitlesFromAudio(context.Context, *types.SubtitleTaskStepParam) error {
	f.calls = append(f.calls, "audio")
	return nil
}

func (f *fakeStageService) GenerateSpeechFromSRT(context.Context, *types.SubtitleTaskStepParam) error {
	return nil
}

func (f *fakeStageService) FinalizeSubtitleResults(context.Context, *types.SubtitleTaskStepParam) error {
	return nil
}

func (f *fakeStageService) DownloadYouTubeSubtitle(context.Context, *service.YoutubeSubtitleReq) (string, error) {
	f.calls = append(f.calls, "download-youtube")
	return "demo.en.vtt", f.downloadErr
}

func (f *fakeStageService) ProcessYouTubeSubtitle(context.Context, *service.YoutubeSubtitleReq) (string, error) {
	f.calls = append(f.calls, "process-youtube")
	return "bilingual_srt.srt", f.processErr
}

func (f *fakeStageService) RenderVideo(context.Context, service.RenderVideoRequest) (string, error) {
	return "", nil
}

func TestGenerateSubtitlesFallsBackToAudioWhenAnySourceFails(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{downloadErr: errors.New("no captions")}
	req := SubtitleRequest{
		Input:         "https://www.youtube.com/watch?v=abc",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceAny,
	}
	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateSubtitles() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if got := fake.calls; len(got) != 3 || got[0] != "prepare" || got[1] != "download-youtube" || got[2] != "audio" {
		t.Fatalf("calls = %v", got)
	}
}

func TestGenerateSubtitlesManualDoesNotFallback(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{downloadErr: errors.New("no captions")}
	req := SubtitleRequest{
		Input:         "https://www.youtube.com/watch?v=abc",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceManual,
	}
	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err == nil {
		t.Fatalf("GenerateSubtitles() error = nil, want error")
	}
	if resp.OK {
		t.Fatalf("OK = true, want false")
	}
	if got := fake.calls; len(got) != 2 || got[1] != "download-youtube" {
		t.Fatalf("calls = %v", got)
	}
}

func TestGenerateSubtitlesYouTubeCaptionsDoNotUseAudio(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{}
	req := SubtitleRequest{
		Input:         "https://youtu.be/abc",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceAny,
	}
	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateSubtitles() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if resp.CaptionSource == "" {
		t.Fatalf("CaptionSource is empty")
	}
	if got := fake.calls; len(got) != 3 || got[0] != "prepare" || got[1] != "download-youtube" || got[2] != "process-youtube" {
		t.Fatalf("calls = %v", got)
	}
}

func TestGenerateSubtitlesWhisperSkipsYouTubeDownload(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{}
	req := SubtitleRequest{
		Input:         "https://www.youtube.com/watch?v=abc",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceWhisper,
	}
	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateSubtitles() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if got := fake.calls; len(got) != 2 || got[0] != "prepare" || got[1] != "audio" {
		t.Fatalf("calls = %v", got)
	}
}
