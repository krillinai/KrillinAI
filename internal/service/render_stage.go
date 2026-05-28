package service

import (
	"context"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"os/exec"
	"path/filepath"
	"strings"
)

type RenderVideoRequest struct {
	Workdir      string
	InputVideo   string
	SubtitleFile string
	OutputFile   string
	Horizontal   bool
	StepParam    *types.SubtitleTaskStepParam
}

func (s Service) RenderVideo(ctx context.Context, req RenderVideoRequest) (string, error) {
	_ = ctx
	return renderSubtitleFile(req)
}

func buildEmbedSubtitleArgs(req RenderVideoRequest) ([]string, string) {
	assPath := filepath.Join(req.Workdir, "formatted_subtitles.ass")
	ass := strings.ReplaceAll(assPath, "\\", "/")
	return []string{
		"-y",
		"-i", req.InputVideo,
		"-vf", fmt.Sprintf("ass=%s", ass),
		"-c:a", "aac",
		"-b:a", "192k",
		req.OutputFile,
	}, assPath
}

func renderSubtitleFile(req RenderVideoRequest) (string, error) {
	assPath := filepath.Join(req.Workdir, "formatted_subtitles.ass")
	stepParam := req.StepParam
	if stepParam == nil {
		stepParam = &types.SubtitleTaskStepParam{TaskBasePath: req.Workdir}
	}
	if err := srtToAss(req.SubtitleFile, assPath, req.Horizontal, stepParam); err != nil {
		return "", fmt.Errorf("renderSubtitleFile srtToAss error: %w", err)
	}
	args, _ := buildEmbedSubtitleArgs(req)
	cmd := exec.Command(storage.FfmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("renderSubtitleFile ffmpeg error: %w, output: %s", err, string(output))
	}
	return req.OutputFile, nil
}
