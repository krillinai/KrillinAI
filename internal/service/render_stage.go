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

type resolutionProbe func(inputVideo string) (int, int, error)

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
		"-c:v", "libx264",
		"-preset", "fast",
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
	preparedReq, err := prepareSubtitleRenderLayout(req, getResolution, convertToVertical)
	if err != nil {
		return "", fmt.Errorf("renderSubtitleFile prepare subtitle layout error: %w", err)
	}
	req = preparedReq
	if err := srtToAss(req.SubtitleFile, assPath, req.Horizontal, req.StepParam); err != nil {
		return "", fmt.Errorf("renderSubtitleFile srtToAss error: %w", err)
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

func prepareSubtitleRenderLayout(req RenderVideoRequest, probe resolutionProbe, convert verticalConverter) (RenderVideoRequest, error) {
	if req.StepParam == nil {
		req.StepParam = &types.SubtitleTaskStepParam{TaskBasePath: req.Workdir}
	}
	width, height, err := probe(req.InputVideo)
	if err != nil {
		return req, fmt.Errorf("get resolution error: %w", err)
	}
	if !req.Horizontal {
		inputVideo, err := prepareRenderVideoInput(req, width, height, convert)
		if err != nil {
			return req, fmt.Errorf("prepare vertical input error: %w", err)
		}
		req.InputVideo = inputVideo
		if width > height {
			width, height = 720, 1280
		}
	}
	req.StepParam.RenderWidth = width
	req.StepParam.RenderHeight = height
	return req, nil
}

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
