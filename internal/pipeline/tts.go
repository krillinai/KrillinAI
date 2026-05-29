package pipeline

import (
	"context"
	"errors"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
)

const ttsInputFileName = "tts_input.srt"

type TTSRequest struct {
	Workdir          string
	TaskID           string
	InputSRT         string
	LineMode         LineMode
	Video            string
	Voice            string
	VoiceCloneSource string
}

func GenerateTTS(ctx context.Context, svc StageService, req TTSRequest) (Response, error) {
	if req.LineMode == "" {
		req.LineMode = LineModeTargetOnly
	}
	manifest, err := ttsManifest(req)
	if err != nil {
		return ttsFailureResponse(req, nil, ErrorKindInternal, "load_manifest_failed", err), err
	}
	manifest.TaskID = req.TaskID
	manifest.Workdir = req.Workdir
	existingOutputs := manifest.Outputs
	if err := manifest.ApplyDefaultOutputs(); err != nil {
		return ttsFailureResponse(req, manifest, ErrorKindInternal, "apply_outputs_failed", err), err
	}
	restoreOutputs(manifest, existingOutputs)

	inputSRT := req.InputSRT
	if inputSRT == "" {
		inputSRT = manifest.Outputs.TargetSRT
	}
	ttsSource := inputSRT
	if req.LineMode != LineModeTargetOnly {
		ttsSource = filepath.Join(req.Workdir, ttsInputFileName)
		if err := ExtractTargetSRT(inputSRT, ttsSource, req.LineMode); err != nil {
			return failTTSStage(req, manifest, "extract_tts_input_failed", err)
		}
	}

	inputVideo := req.Video
	if inputVideo == "" {
		inputVideo = manifest.Outputs.OriginVideo
	}
	stepParam := &types.SubtitleTaskStepParam{
		TaskId:               req.TaskID,
		TaskPtr:              &types.SubtitleTask{TaskId: req.TaskID, Status: types.SubtitleTaskStatusProcessing},
		TaskBasePath:         req.Workdir,
		EnableTts:            true,
		TtsSourceFilePath:    ttsSource,
		TtsResultFilePath:    manifest.Outputs.TTSAudio,
		InputVideoPath:       inputVideo,
		TtsVoiceCode:         req.Voice,
		VoiceCloneAudioUrl:   req.VoiceCloneSource,
		VideoWithTtsFilePath: manifest.Outputs.VideoWithTTS,
	}
	if err := svc.GenerateSpeechFromSRT(ctx, stepParam); err != nil {
		return failTTSStage(req, manifest, "generate_speech_failed", err)
	}
	if stepParam.TtsResultFilePath != "" {
		manifest.Outputs.TTSAudio = stepParam.TtsResultFilePath
	}
	if stepParam.VideoWithTtsFilePath != "" {
		manifest.Outputs.VideoWithTTS = stepParam.VideoWithTtsFilePath
	}
	manifest.MarkStage(StageTTS, true, "")
	if err := manifest.Save(); err != nil {
		return ttsFailureResponse(req, manifest, ErrorKindInternal, "save_manifest_failed", err), err
	}
	return ttsResponse(true, req, manifest, nil), nil
}

func ttsManifest(req TTSRequest) (*Manifest, error) {
	manifest, err := LoadManifest(req.Workdir)
	if err == nil {
		return manifest, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return NewManifest(req.TaskID, req.Workdir), nil
	}
	return nil, err
}

func restoreOutputs(manifest *Manifest, existing Outputs) {
	if existing.OriginVideo != "" {
		manifest.Outputs.OriginVideo = existing.OriginVideo
	}
	if existing.OriginAudio != "" {
		manifest.Outputs.OriginAudio = existing.OriginAudio
	}
	if existing.OriginSRT != "" {
		manifest.Outputs.OriginSRT = existing.OriginSRT
	}
	if existing.TargetSRT != "" {
		manifest.Outputs.TargetSRT = existing.TargetSRT
	}
	if existing.BilingualSRT != "" {
		manifest.Outputs.BilingualSRT = existing.BilingualSRT
	}
	if existing.ShortOriginSRT != "" {
		manifest.Outputs.ShortOriginSRT = existing.ShortOriginSRT
	}
	if existing.ShortOriginMixedSRT != "" {
		manifest.Outputs.ShortOriginMixedSRT = existing.ShortOriginMixedSRT
	}
	if existing.TTSAudio != "" {
		manifest.Outputs.TTSAudio = existing.TTSAudio
	}
	if existing.VideoWithTTS != "" {
		manifest.Outputs.VideoWithTTS = existing.VideoWithTTS
	}
	if existing.HorizontalVideo != "" {
		manifest.Outputs.HorizontalVideo = existing.HorizontalVideo
	}
	if existing.VerticalVideo != "" {
		manifest.Outputs.VerticalVideo = existing.VerticalVideo
	}
	if existing.TransferredVideo != "" {
		manifest.Outputs.TransferredVideo = existing.TransferredVideo
	}
	if existing.OriginCover != "" {
		manifest.Outputs.OriginCover = existing.OriginCover
	}
	if existing.GeneratedCover != "" {
		manifest.Outputs.GeneratedCover = existing.GeneratedCover
	}
	if existing.FinalCoverPrompt != "" {
		manifest.Outputs.FinalCoverPrompt = existing.FinalCoverPrompt
	}
	if existing.OriginText != "" {
		manifest.Outputs.OriginText = existing.OriginText
	}
	if existing.TargetText != "" {
		manifest.Outputs.TargetText = existing.TargetText
	}
}

func failTTSStage(req TTSRequest, manifest *Manifest, code string, err error) (Response, error) {
	if manifest != nil {
		manifest.MarkStage(StageTTS, false, err.Error())
		_ = manifest.Save()
	}
	return ttsFailureResponse(req, manifest, ErrorKindRetryable, code, err), err
}

func ttsFailureResponse(req TTSRequest, manifest *Manifest, kind ErrorKind, code string, err error) Response {
	return ttsResponse(false, req, manifest, &Error{
		Kind:      kind,
		Code:      code,
		Message:   err.Error(),
		Retryable: kind == ErrorKindRetryable,
	})
}

func ttsResponse(ok bool, req TTSRequest, manifest *Manifest, pipelineErr *Error) Response {
	resp := Response{
		OK:      ok,
		Stage:   StageTTS,
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
