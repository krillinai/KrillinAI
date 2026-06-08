package pipeline

import (
	"context"
	"errors"
	"krillin-ai/internal/service"
	subtitlestyle "krillin-ai/internal/subtitle_style"
	"krillin-ai/internal/types"
	"os"
	"strings"
)

const defaultSubtitleMaxWordOneLine = 12

type SubtitleRequest struct {
	Input             string
	Workdir           string
	TaskID            string
	OriginLang        string
	TargetLang        string
	UserLang          string
	CaptionSource     CaptionSource
	BilingualTop      bool
	MaxWordOneLine    int
	SubtitleStyleFile string
	SubtitleStyle     *subtitlestyle.StyleSet
}

func GenerateSubtitles(ctx context.Context, svc StageService, req SubtitleRequest) (Response, error) {
	if req.CaptionSource == "" {
		req.CaptionSource = CaptionSourceAny
	}

	manifest, err := subtitleManifest(req)
	if err != nil {
		return subtitleFailureResponse(req, nil, ErrorKindInternal, "load_manifest_failed", err), err
	}
	manifest.TaskID = req.TaskID
	manifest.Workdir = req.Workdir
	manifest.InputURL = req.Input
	manifest.OriginLanguage = req.OriginLang
	manifest.TargetLanguage = req.TargetLang
	manifest.CaptionSource = string(req.CaptionSource)
	if err := manifest.ApplyDefaultOutputs(); err != nil {
		return subtitleFailureResponse(req, manifest, ErrorKindInternal, "apply_outputs_failed", err), err
	}

	stepParam := subtitleStepParam(req)
	if err := svc.PrepareMedia(ctx, stepParam); err != nil {
		return failSubtitleStage(req, manifest, ErrorKindRetryable, "prepare_media_failed", err)
	}

	if isYouTubeInput(req.Input) && req.CaptionSource != CaptionSourceWhisper {
		youtubeReq := subtitleYouTubeReq(req, stepParam.TaskPtr)
		vttFile, err := svc.DownloadYouTubeSubtitle(ctx, youtubeReq)
		if err == nil {
			youtubeReq.VttFile = vttFile
			_, err = svc.ProcessYouTubeSubtitle(ctx, youtubeReq)
		}
		if err == nil {
			manifest.CaptionSource = "youtube_vtt"
			if err := prepareOriginalMediaForRendering(ctx, svc, stepParam); err != nil {
				return failSubtitleStage(req, manifest, ErrorKindRetryable, "prepare_media_for_render_failed", err)
			}
			return saveSubtitleSuccess(manifest, req, CaptionSource("youtube_vtt"))
		}
		if req.CaptionSource != CaptionSourceAny {
			return failSubtitleStage(req, manifest, ErrorKindRetryable, "platform_caption_failed", err)
		}
		manifest.Warnings = append(manifest.Warnings, "平台字幕不可用，回退到转录")
		stepParam.VttSwitch = false
		if err := svc.PrepareMedia(ctx, stepParam); err != nil {
			return failSubtitleStage(req, manifest, ErrorKindRetryable, "prepare_audio_fallback_failed", err)
		}
	}

	if err := svc.GenerateSubtitlesFromAudio(ctx, stepParam); err != nil {
		return failSubtitleStage(req, manifest, ErrorKindRetryable, "audio_transcription_failed", err)
	}
	manifest.CaptionSource = string(CaptionSourceWhisper)
	return saveSubtitleSuccess(manifest, req, CaptionSourceWhisper)
}

func subtitleManifest(req SubtitleRequest) (*Manifest, error) {
	manifest, err := LoadManifest(req.Workdir)
	if err == nil {
		return manifest, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return NewManifest(req.TaskID, req.Workdir), nil
	}
	return nil, err
}

func subtitleStepParam(req SubtitleRequest) *types.SubtitleTaskStepParam {
	userLang := req.UserLang
	if userLang == "" {
		userLang = string(types.LanguageNameSimplifiedChinese)
	}
	resultType := types.SubtitleResultTypeBilingualTranslationOnBottom
	if req.BilingualTop {
		resultType = types.SubtitleResultTypeBilingualTranslationOnTop
	}
	maxWordOneLine := req.MaxWordOneLine
	if maxWordOneLine <= 0 {
		maxWordOneLine = defaultSubtitleMaxWordOneLine
	}

	taskPtr := &types.SubtitleTask{
		TaskId:   req.TaskID,
		VideoSrc: req.Input,
		Status:   types.SubtitleTaskStatusProcessing,
	}
	return &types.SubtitleTaskStepParam{
		TaskId:                 req.TaskID,
		TaskPtr:                taskPtr,
		TaskBasePath:           req.Workdir,
		Link:                   req.Input,
		SubtitleResultType:     resultType,
		OriginLanguage:         types.StandardLanguageCode(req.OriginLang),
		TargetLanguage:         types.StandardLanguageCode(req.TargetLang),
		UserUILanguage:         types.StandardLanguageCode(userLang),
		MaxWordOneLine:         maxWordOneLine,
		VttSwitch:              isYouTubeInput(req.Input) && req.CaptionSource != CaptionSourceWhisper,
		EmbedSubtitleVideoType: "none",
		SubtitleStyle:          req.SubtitleStyle,
	}
}

func prepareOriginalMediaForRendering(ctx context.Context, svc StageService, stepParam *types.SubtitleTaskStepParam) error {
	stepParam.VttSwitch = false
	stepParam.EmbedSubtitleVideoType = "all"
	return svc.PrepareMedia(ctx, stepParam)
}

func subtitleYouTubeReq(req SubtitleRequest, taskPtr *types.SubtitleTask) *service.YoutubeSubtitleReq {
	return &service.YoutubeSubtitleReq{
		TaskBasePath:        req.Workdir,
		TaskId:              req.TaskID,
		URL:                 req.Input,
		OriginLanguage:      req.OriginLang,
		TargetLanguage:      req.TargetLang,
		TaskPtr:             taskPtr,
		TargetLanguageFirst: req.BilingualTop,
	}
}

func saveSubtitleSuccess(manifest *Manifest, req SubtitleRequest, captionSource CaptionSource) (Response, error) {
	manifest.MarkStage(StageSubtitle, true, "")
	if err := manifest.Save(); err != nil {
		return subtitleFailureResponse(req, manifest, ErrorKindInternal, "save_manifest_failed", err), err
	}
	return subtitleResponse(true, req, manifest, captionSource, nil), nil
}

func failSubtitleStage(req SubtitleRequest, manifest *Manifest, kind ErrorKind, code string, err error) (Response, error) {
	if manifest != nil {
		manifest.MarkStage(StageSubtitle, false, err.Error())
		_ = manifest.Save()
	}
	return subtitleFailureResponse(req, manifest, kind, code, err), err
}

func subtitleFailureResponse(req SubtitleRequest, manifest *Manifest, kind ErrorKind, code string, err error) Response {
	pipelineErr := &Error{
		Kind:      kind,
		Code:      code,
		Message:   err.Error(),
		Retryable: kind == ErrorKindRetryable,
	}
	return subtitleResponse(false, req, manifest, req.CaptionSource, pipelineErr)
}

func subtitleResponse(ok bool, req SubtitleRequest, manifest *Manifest, captionSource CaptionSource, pipelineErr *Error) Response {
	resp := Response{
		OK:            ok,
		Stage:         StageSubtitle,
		Workdir:       req.Workdir,
		TaskID:        req.TaskID,
		CaptionSource: captionSource,
		Error:         pipelineErr,
	}
	if manifest != nil {
		resp.Workdir = manifest.Workdir
		resp.TaskID = manifest.TaskID
		resp.Outputs = manifest.Outputs
		resp.Warnings = manifest.Warnings
		if manifest.CaptionSource != "" {
			resp.CaptionSource = CaptionSource(manifest.CaptionSource)
		}
	}
	return resp
}

func isYouTubeInput(input string) bool {
	normalized := strings.ToLower(strings.TrimSpace(input))
	return strings.Contains(normalized, "youtube.com")
}
