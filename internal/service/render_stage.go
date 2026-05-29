package service

import (
	"context"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"os"
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
	return renderSubtitleFile(ctx, req)
}

func renderAssPath(req RenderVideoRequest) string {
	base := strings.TrimSuffix(filepath.Base(req.OutputFile), filepath.Ext(req.OutputFile))
	if base == "" || base == "." {
		base = "subtitles"
	}
	return filepath.Join(req.Workdir, fmt.Sprintf("formatted_%s.ass", base))
}

func escapeAssFilterPath(path string) string {
	p := strings.ReplaceAll(path, "\\", "/")
	p = strings.ReplaceAll(p, ":", `\:`)
	return p
}

func buildEmbedSubtitleArgs(req RenderVideoRequest) ([]string, string) {
	assPath := renderAssPath(req)
	ass := escapeAssFilterPath(assPath)
	return []string{
		"-y",
		"-i", req.InputVideo,
		"-vf", fmt.Sprintf("ass=%s", ass),
		"-c:a", "aac",
		"-b:a", "192k",
		req.OutputFile,
	}, assPath
}

func renderSubtitleFile(ctx context.Context, req RenderVideoRequest) (string, error) {
	if err := os.MkdirAll(filepath.Dir(req.OutputFile), 0755); err != nil {
		return "", fmt.Errorf("renderSubtitleFile mkdir output dir error: %w", err)
	}

	assPath := renderAssPath(req)
	stepParam := req.StepParam
	if stepParam == nil {
		stepParam = &types.SubtitleTaskStepParam{TaskBasePath: req.Workdir}
		req.StepParam = stepParam
	}
	if err := srtToAss(req.SubtitleFile, assPath, req.Horizontal, stepParam); err != nil {
		return "", fmt.Errorf("renderSubtitleFile srtToAss error: %w", err)
	}
	if !req.Horizontal {
		width, height, err := getResolution(req.InputVideo)
		if err != nil {
			return "", fmt.Errorf("renderSubtitleFile getResolution error: %w", err)
		}
		inputVideo, err := prepareRenderVideoInput(req, width, height, convertToVertical)
		if err != nil {
			return "", fmt.Errorf("renderSubtitleFile prepare vertical input error: %w", err)
		}
		req.InputVideo = inputVideo
	}
	args, _ := buildEmbedSubtitleArgs(req)
	cmd := exec.CommandContext(ctx, storage.FfmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("renderSubtitleFile ffmpeg error: %w, output: %s", err, string(output))
	}
	return req.OutputFile, nil
}

type verticalConverter func(inputVideo, outputVideo, majorTitle, minorTitle string) error

func prepareRenderVideoInput(req RenderVideoRequest, width, height int, convert verticalConverter) (string, error) {
	if req.Horizontal || width <= height {
		return req.InputVideo, nil
	}
	majorTitle, minorTitle := "", ""
	if req.StepParam != nil {
		majorTitle = req.StepParam.VerticalVideoMajorTitle
		minorTitle = req.StepParam.VerticalVideoMinorTitle
	}
	output := filepath.Join(req.Workdir, types.SubtitleTaskTransferredVerticalVideoFileName)
	if err := convert(req.InputVideo, output, majorTitle, minorTitle); err != nil {
		return "", err
	}
	if req.StepParam != nil {
		req.StepParam.InputVideoPath = output
	}
	return output, nil
}
