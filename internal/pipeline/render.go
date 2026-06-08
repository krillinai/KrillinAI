package pipeline

import (
	"context"
	"errors"
	"krillin-ai/internal/service"
	subtitlestyle "krillin-ai/internal/subtitle_style"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
)

type RenderRequest struct {
	Workdir    string
	TaskID     string
	Video      string
	Audio      string
	Subtitle   string
	Horizontal bool
	Dubbed     bool
	MajorTitle string
	MinorTitle string
	SubtitleStyle *subtitlestyle.StyleSet
}

func Render(ctx context.Context, svc StageService, req RenderRequest) (Response, error) {
	manifest, err := renderManifest(req)
	if err != nil {
		return renderFailureResponse(req, nil, ErrorKindInternal, "load_manifest_failed", err), err
	}
	manifest.TaskID = req.TaskID
	manifest.Workdir = req.Workdir
	existingOutputs := manifest.Outputs
	if err := manifest.ApplyDefaultOutputs(); err != nil {
		return renderFailureResponse(req, manifest, ErrorKindInternal, "apply_outputs_failed", err), err
	}
	restoreOutputs(manifest, existingOutputs)

	inputVideo := renderInputVideo(req, manifest)
	subtitle := renderSubtitle(req, manifest)
	output := renderOutput(req)
	stepParam := &types.SubtitleTaskStepParam{
		TaskId:                  req.TaskID,
		TaskPtr:                 &types.SubtitleTask{TaskId: req.TaskID, Status: types.SubtitleTaskStatusProcessing},
		TaskBasePath:            req.Workdir,
		InputVideoPath:          inputVideo,
		VideoWithTtsFilePath:    manifest.Outputs.VideoWithTTS,
		TtsResultFilePath:       manifest.Outputs.TTSAudio,
		VerticalVideoMajorTitle: req.MajorTitle,
		VerticalVideoMinorTitle: req.MinorTitle,
		SubtitleStyle:           req.SubtitleStyle,
	}
	rendered, err := svc.RenderVideo(ctx, service.RenderVideoRequest{
		Workdir:      req.Workdir,
		InputVideo:   inputVideo,
		SubtitleFile: subtitle,
		OutputFile:   output,
		Horizontal:   req.Horizontal,
		StepParam:    stepParam,
	})
	if err != nil {
		return failRenderStage(req, manifest, renderStage(req), "render_video_failed", err)
	}
	if rendered != "" {
		output = rendered
	}
	if req.Horizontal {
		manifest.Outputs.HorizontalVideo = output
	} else {
		manifest.Outputs.VerticalVideo = output
	}
	manifest.MarkStage(renderStage(req), true, "")
	if err := manifest.Save(); err != nil {
		return renderFailureResponse(req, manifest, ErrorKindInternal, "save_manifest_failed", err), err
	}
	return renderResponse(true, req, manifest, nil), nil
}

func renderManifest(req RenderRequest) (*Manifest, error) {
	manifest, err := LoadManifest(req.Workdir)
	if err == nil {
		return manifest, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return NewManifest(req.TaskID, req.Workdir), nil
	}
	return nil, err
}

func renderInputVideo(req RenderRequest, manifest *Manifest) string {
	if req.Video != "" {
		return req.Video
	}
	if req.Dubbed && manifest.Outputs.VideoWithTTS != "" {
		return manifest.Outputs.VideoWithTTS
	}
	return manifest.Outputs.OriginVideo
}

func renderSubtitle(req RenderRequest, manifest *Manifest) string {
	if req.Subtitle != "" {
		return req.Subtitle
	}
	if req.Dubbed {
		return manifest.Outputs.TargetSRT
	}
	if req.Horizontal {
		return manifest.Outputs.BilingualSRT
	}
	return manifest.Outputs.ShortOriginMixedSRT
}

func renderOutput(req RenderRequest) string {
	name := "vertical_bilingual.mp4"
	switch {
	case req.Horizontal && req.Dubbed:
		name = "horizontal_dubbed.mp4"
	case req.Horizontal:
		name = "horizontal_bilingual.mp4"
	case req.Dubbed:
		name = "vertical_dubbed.mp4"
	}
	return filepath.Join(req.Workdir, name)
}

func renderStage(req RenderRequest) Stage {
	if req.Horizontal {
		return StageRenderHorizontal
	}
	return StageRenderVertical
}

func failRenderStage(req RenderRequest, manifest *Manifest, stage Stage, code string, err error) (Response, error) {
	if manifest != nil {
		manifest.MarkStage(stage, false, err.Error())
		_ = manifest.Save()
	}
	return renderFailureResponse(req, manifest, ErrorKindRetryable, code, err), err
}

func renderFailureResponse(req RenderRequest, manifest *Manifest, kind ErrorKind, code string, err error) Response {
	return renderResponse(false, req, manifest, &Error{
		Kind:      kind,
		Code:      code,
		Message:   err.Error(),
		Retryable: kind == ErrorKindRetryable,
	})
}

func renderResponse(ok bool, req RenderRequest, manifest *Manifest, pipelineErr *Error) Response {
	resp := Response{
		OK:      ok,
		Stage:   renderStage(req),
		Workdir: req.Workdir,
		TaskID:  req.TaskID,
		Error:   pipelineErr,
	}
	if manifest != nil {
		resp.Workdir = manifest.Workdir
		resp.TaskID = manifest.TaskID
		resp.Outputs = manifest.Outputs
		resp.Warnings = manifest.Warnings
		resp.FailedIndexes = manifest.FailedIndexes
	}
	return resp
}
