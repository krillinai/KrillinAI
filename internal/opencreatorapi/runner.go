package opencreatorapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/internal/pipeline"
	"krillin-ai/internal/service"
	subtitlestyle "krillin-ai/internal/subtitle_style"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type StageRunner interface {
	Run(context.Context, CreateTaskRequest, string, ProgressReporter) (RunResult, error)
}

type ProgressReporter func(phase string, percent int, message string)

type RunResult struct {
	Artifacts []ResultArtifact
	Metadata  map[string]interface{}
}

type RunError struct {
	Code      string
	Message   string
	Retryable bool
}

func (e *RunError) Error() string {
	return e.Message
}

type PipelineRunner struct {
	guard *PathGuard
}

func NewPipelineRunner(guard *PathGuard) *PipelineRunner {
	return &PipelineRunner{guard: guard}
}

func (r *PipelineRunner) Run(ctx context.Context, req CreateTaskRequest, workdir string, report ProgressReporter) (RunResult, error) {
	reportProgress(report, "validating", 5, "正在检查任务设置")
	previous := config.Conf
	defer func() { config.Conf = previous }()
	applyProviderConfig(req.ProviderConfig)
	if err := config.CheckBaseConfig(); err != nil {
		return RunResult{}, runError("invalid_provider_config", err, false)
	}
	if err := deps.CheckCoreDependencies(); err != nil {
		return RunResult{}, runError("dependency_not_packaged", err, false)
	}
	if req.StageType == StageTTS {
		if err := deps.CheckTTSDependency(); err != nil {
			return RunResult{}, runError("dependency_not_packaged", err, false)
		}
	}
	svc := service.NewService()
	if svc == nil {
		return RunResult{}, &RunError{Code: "provider_initialization_failed", Message: "KrillinAI provider initialization failed", Retryable: false}
	}
	adapter := pipeline.NewServiceAdapter(svc)
	response, err := r.execute(ctx, req, workdir, adapter, svc, report)
	if err != nil {
		if response.Error != nil {
			return RunResult{}, &RunError{
				Code: response.Error.Code, Message: response.Error.Message, Retryable: response.Error.Retryable,
			}
		}
		return RunResult{}, runError("krillin_stage_failed", err, true)
	}
	artifacts, err := r.collectArtifacts(req, response.Outputs)
	if err != nil {
		return RunResult{}, err
	}
	metadata := map[string]interface{}{}
	if response.CaptionSource != "" {
		metadata["captionSource"] = response.CaptionSource
	}
	if len(response.Warnings) > 0 {
		metadata["warnings"] = response.Warnings
	}
	return RunResult{Artifacts: artifacts, Metadata: metadata}, nil
}

func (r *PipelineRunner) execute(
	ctx context.Context,
	req CreateTaskRequest,
	workdir string,
	adapter pipeline.StageService,
	svc *service.Service,
	report ProgressReporter,
) (pipeline.Response, error) {
	switch req.StageType {
	case StageDownload:
		reportProgress(report, "preparing_source", 10, "正在准备视频来源")
		input := optionString(req.Options, "sourceUrl")
		if input == "" {
			return pipeline.Response{}, &RunError{Code: "source_missing", Message: "sourceUrl is required", Retryable: false}
		}
		result, err := svc.DownloadMedia(ctx, input, workdir, req.StageRunID)
		reportProgress(report, "collecting_outputs", 95, "正在整理下载结果")
		manifest := pipeline.NewManifest(req.StageRunID, workdir)
		if applyErr := manifest.ApplyDefaultOutputs(); applyErr != nil {
			return pipeline.Response{}, applyErr
		}
		manifest.InputURL = input
		manifest.Outputs.OriginVideo = result.VideoPath
		manifest.Outputs.OriginAudio = result.AudioPath
		if err != nil {
			manifest.MarkStage(pipeline.StageDownload, false, err.Error())
			_ = manifest.Save()
			return pipeline.Response{Stage: pipeline.StageDownload, Workdir: workdir, TaskID: req.StageRunID, Outputs: manifest.Outputs}, err
		}
		manifest.MarkStage(pipeline.StageDownload, true, "")
		if err := manifest.Save(); err != nil {
			return pipeline.Response{}, err
		}
		return pipeline.Response{OK: true, Stage: pipeline.StageDownload, Workdir: workdir, TaskID: req.StageRunID, Outputs: manifest.Outputs}, nil
	case StageSubtitle:
		source, err := r.sourceInput(req)
		if err != nil {
			return pipeline.Response{}, err
		}
		return pipeline.GenerateSubtitles(ctx, adapter, pipeline.SubtitleRequest{
			Input: source, Workdir: workdir, TaskID: req.StageRunID,
			OriginLang:    optionString(req.Options, "originLanguage"),
			TargetLang:    optionString(req.Options, "targetLanguage"),
			CaptionSource: pipeline.CaptionSource(defaultString(optionString(req.Options, "captionSource"), "any")),
			BilingualTop:  optionBool(req.Options, "bilingualTop"),
			PrepareVideo:  true,
			ReportProgress: func(phase string, percent int, message string) {
				reportProgress(report, phase, percent, message)
			},
		})
	case StageTTS:
		reportProgress(report, "generating_voice", 10, "正在准备配音")
		inputSRT, err := r.artifactByKind(req, "target_subtitle")
		if err != nil {
			return pipeline.Response{}, err
		}
		video, _ := r.artifactByKind(req, "source_video")
		return pipeline.GenerateTTS(ctx, adapter, pipeline.TTSRequest{
			Workdir: workdir, TaskID: req.StageRunID, InputSRT: inputSRT,
			LineMode: pipeline.LineModeTargetOnly, Video: video, Voice: optionString(req.Options, "voiceCode"),
		})
	case StageRenderHorizontal, StageRenderVertical:
		reportProgress(report, "rendering_video", 10, "正在准备视频渲染")
		subtitleStyle, err := subtitleStyleFromOptions(req.Options)
		if err != nil {
			return pipeline.Response{}, err
		}
		video, err := r.artifactByKind(req, "source_video", "dubbed_video")
		if err != nil {
			return pipeline.Response{}, err
		}
		subtitle, err := r.renderSubtitleInput(req)
		if err != nil {
			return pipeline.Response{}, err
		}
		return pipeline.Render(ctx, adapter, pipeline.RenderRequest{
			Workdir: workdir, TaskID: req.StageRunID, Video: video, Subtitle: subtitle,
			Horizontal:    req.StageType == StageRenderHorizontal,
			Dubbed:        optionBool(req.Options, "dubbed"),
			MajorTitle:    optionString(req.Options, "verticalTitle"),
			MinorTitle:    optionString(req.Options, "verticalSubtitle"),
			SubtitleStyle: subtitleStyle,
		})
	default:
		return pipeline.Response{}, &RunError{Code: "stage_not_supported", Message: "Unsupported KrillinAI stage", Retryable: false}
	}
}

func subtitleStyleFromOptions(options map[string]interface{}) (*subtitlestyle.StyleSet, error) {
	values := mapObject(options, "subtitleStyle")
	if values == nil {
		return nil, nil
	}
	data, err := json.Marshal(values)
	if err != nil {
		return nil, &RunError{Code: "invalid_subtitle_style", Message: "subtitleStyle must be valid JSON", Retryable: false}
	}
	override, err := subtitlestyle.Decode(data, "options.subtitleStyle")
	if err != nil {
		return nil, &RunError{Code: "invalid_subtitle_style", Message: err.Error(), Retryable: false}
	}
	merged, err := subtitlestyle.Merge(subtitlestyle.DefaultStyleSet(), override)
	if err != nil {
		return nil, &RunError{Code: "invalid_subtitle_style", Message: err.Error(), Retryable: false}
	}
	return merged, nil
}

func reportProgress(report ProgressReporter, phase string, percent int, message string) {
	if report == nil {
		return
	}
	report(phase, percent, message)
}

func renderSubtitleKinds(stage StageType, options map[string]interface{}) []string {
	if optionBool(options, "bilingual") {
		if stage == StageRenderVertical {
			return []string{"vertical_subtitle", "bilingual_subtitle", "target_subtitle"}
		}
		return []string{"bilingual_subtitle", "target_subtitle"}
	}
	return []string{"target_subtitle"}
}

func (r *PipelineRunner) renderSubtitleInput(req CreateTaskRequest) (string, error) {
	path, kind, err := r.artifactByKindWithKind(req, renderSubtitleKinds(req.StageType, req.Options)...)
	if err != nil {
		return "", err
	}
	if req.StageType != StageRenderVertical || kind != "bilingual_subtitle" {
		return path, nil
	}

	// Jobs created before vertical_subtitle became a first-class artifact still
	// have the short subtitle beside bilingual_srt.srt in the trusted Job root.
	legacyShort := filepath.Join(filepath.Dir(path), "short_origin_mixed_srt.srt")
	info, statErr := os.Stat(legacyShort)
	if statErr == nil && info.Mode().IsRegular() {
		return legacyShort, nil
	}
	return path, nil
}

func (r *PipelineRunner) sourceInput(req CreateTaskRequest) (string, error) {
	if path, err := r.artifactByKind(req, "source_video"); err == nil {
		return "local:" + path, nil
	}
	source := optionString(req.Options, "sourceUrl")
	if source == "" {
		return "", &RunError{Code: "source_missing", Message: "A registered source video or sourceUrl is required", Retryable: false}
	}
	return source, nil
}

func (r *PipelineRunner) artifactByKind(req CreateTaskRequest, kinds ...string) (string, error) {
	path, _, err := r.artifactByKindWithKind(req, kinds...)
	return path, err
}

func (r *PipelineRunner) artifactByKindWithKind(req CreateTaskRequest, kinds ...string) (string, string, error) {
	for _, wanted := range kinds {
		for _, id := range req.InputArtifactIDs {
			path, kind, err := r.guard.ResolveArtifact(req.JobID, id)
			if err == nil && kind == wanted {
				return path, kind, nil
			}
		}
	}
	return "", "", &RunError{Code: "input_artifact_missing", Message: fmt.Sprintf("Required artifact is missing: %s", strings.Join(kinds, " or ")), Retryable: false}
}

func (r *PipelineRunner) collectArtifacts(req CreateTaskRequest, outputs pipeline.Outputs) ([]ResultArtifact, error) {
	type candidate struct {
		kind string
		path string
		mime string
	}
	candidates := []candidate{}
	switch req.StageType {
	case StageDownload:
		candidates = append(candidates, candidate{"source_video", outputs.OriginVideo, "video/mp4"})
	case StageSubtitle:
		candidates = append(candidates,
			candidate{"source_video", outputs.OriginVideo, "video/mp4"},
			candidate{"source_subtitle", outputs.OriginSRT, "application/x-subrip"},
			candidate{"target_subtitle", outputs.TargetSRT, "application/x-subrip"},
			candidate{"bilingual_subtitle", outputs.BilingualSRT, "application/x-subrip"},
			candidate{"vertical_subtitle", outputs.ShortOriginMixedSRT, "application/x-subrip"},
		)
	case StageTTS:
		candidates = append(candidates,
			candidate{"dubbed_audio", outputs.TTSAudio, "audio/wav"},
			candidate{"dubbed_video", outputs.VideoWithTTS, "video/mp4"},
		)
	case StageRenderHorizontal:
		candidates = append(candidates, candidate{"horizontal_video", outputs.HorizontalVideo, "video/mp4"})
	case StageRenderVertical:
		candidates = append(candidates, candidate{"vertical_video", outputs.VerticalVideo, "video/mp4"})
	}
	artifacts := make([]ResultArtifact, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.path == "" {
			continue
		}
		info, err := os.Stat(candidate.path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		relative, err := r.guard.RelativeToRoot(candidate.path)
		if err != nil {
			return nil, &RunError{Code: "output_path_escape", Message: err.Error(), Retryable: false}
		}
		hash, err := fileSHA256(candidate.path)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, ResultArtifact{
			ID:   req.StageRunID + "_" + strings.ReplaceAll(candidate.kind, "-", "_"),
			Kind: candidate.kind, RelativePath: relative, MimeType: candidate.mime, Size: info.Size(), SHA256: hash,
		})
	}
	if len(artifacts) == 0 {
		return nil, &RunError{Code: "output_missing", Message: "KrillinAI produced no output artifacts", Retryable: false}
	}
	return artifacts, nil
}

func applyProviderConfig(values map[string]interface{}) {
	config.Conf.App.Proxy = mapString(values, "proxy")
	if llm := mapObject(values, "llm"); llm != nil {
		config.Conf.Llm.BaseUrl = mapString(llm, "baseUrl")
		config.Conf.Llm.ApiKey = mapString(llm, "apiKey")
		config.Conf.Llm.Model = defaultString(mapString(llm, "model"), config.Conf.Llm.Model)
	}
	if transcription := mapObject(values, "transcription"); transcription != nil {
		provider := mapString(transcription, "provider")
		provider = strings.NewReplacer("faster-whisper", "fasterwhisper", "whisper.cpp", "whispercpp").Replace(provider)
		if provider != "" {
			config.Conf.Transcribe.Provider = provider
		}
		if gpu, ok := transcription["enableGpuAcceleration"].(bool); ok {
			config.Conf.Transcribe.EnableGpuAcceleration = gpu
		}
		if openai := mapObject(transcription, "openai"); openai != nil {
			config.Conf.Transcribe.Openai.BaseUrl = mapString(openai, "baseUrl")
			config.Conf.Transcribe.Openai.ApiKey = mapString(openai, "apiKey")
			config.Conf.Transcribe.Openai.Model = defaultString(mapString(openai, "model"), config.Conf.Transcribe.Openai.Model)
		}
		if local := mapObject(transcription, "fasterWhisper"); local != nil {
			config.Conf.Transcribe.Fasterwhisper.Model = defaultString(mapString(local, "model"), config.Conf.Transcribe.Fasterwhisper.Model)
		}
		if local := mapObject(transcription, "whisperCpp"); local != nil {
			config.Conf.Transcribe.Whispercpp.Model = defaultString(mapString(local, "model"), config.Conf.Transcribe.Whispercpp.Model)
		}
		if local := mapObject(transcription, "whisperKit"); local != nil {
			config.Conf.Transcribe.Whisperkit.Model = defaultString(mapString(local, "model"), config.Conf.Transcribe.Whisperkit.Model)
		}
		if aliyun := mapObject(transcription, "aliyun"); aliyun != nil {
			applyAliyunOSS(mapObject(aliyun, "oss"), &config.Conf.Transcribe.Aliyun.Oss)
			applyAliyunSpeech(mapObject(aliyun, "speech"), &config.Conf.Transcribe.Aliyun.Speech)
		}
	}
	if tts := mapObject(values, "tts"); tts != nil {
		if provider := mapString(tts, "provider"); provider != "" {
			config.Conf.Tts.Provider = provider
		}
		if openai := mapObject(tts, "openai"); openai != nil {
			config.Conf.Tts.Openai.BaseUrl = mapString(openai, "baseUrl")
			config.Conf.Tts.Openai.ApiKey = mapString(openai, "apiKey")
			config.Conf.Tts.Openai.Model = defaultString(mapString(openai, "model"), config.Conf.Tts.Openai.Model)
		}
		if minimax := mapObject(tts, "minimax"); minimax != nil {
			config.Conf.Tts.Minimax.BaseUrl = mapString(minimax, "baseUrl")
			config.Conf.Tts.Minimax.ApiKey = mapString(minimax, "apiKey")
			config.Conf.Tts.Minimax.Model = defaultString(mapString(minimax, "model"), config.Conf.Tts.Minimax.Model)
		}
		if aliyun := mapObject(tts, "aliyun"); aliyun != nil {
			applyAliyunOSS(mapObject(aliyun, "oss"), &config.Conf.Tts.Aliyun.Oss)
			applyAliyunSpeech(mapObject(aliyun, "speech"), &config.Conf.Tts.Aliyun.Speech)
		}
	}
}

func applyAliyunOSS(values map[string]interface{}, target *config.AliyunOssConfig) {
	if values == nil {
		return
	}
	target.AccessKeyId = mapString(values, "accessKeyId")
	target.AccessKeySecret = mapString(values, "accessKeySecret")
	target.Bucket = mapString(values, "bucket")
}

func applyAliyunSpeech(values map[string]interface{}, target *config.AliyunSpeechConfig) {
	if values == nil {
		return
	}
	target.AccessKeyId = mapString(values, "accessKeyId")
	target.AccessKeySecret = mapString(values, "accessKeySecret")
	target.AppKey = mapString(values, "appKey")
}

func optionString(values map[string]interface{}, key string) string { return mapString(values, key) }

func optionBool(values map[string]interface{}, key string) bool {
	value, _ := values[key].(bool)
	return value
}

func mapObject(values map[string]interface{}, key string) map[string]interface{} {
	value, _ := values[key].(map[string]interface{})
	return value
}

func mapString(values map[string]interface{}, key string) string {
	value, _ := values[key].(string)
	return strings.TrimSpace(value)
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func runError(code string, err error, retryable bool) *RunError {
	return &RunError{Code: code, Message: redactSecrets(err.Error()), Retryable: retryable}
}

func redactSecrets(value string) string {
	for _, marker := range []string{"api_key", "apiKey", "token", "secret", "accessKeySecret"} {
		if strings.Contains(strings.ToLower(value), strings.ToLower(marker)) {
			return "Provider configuration is invalid or unavailable"
		}
	}
	return value
}

func fileSHA256(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func newResultManifest(task Task, result RunResult) (ResultManifest, error) {
	id, err := randomID("manifest")
	if err != nil {
		return ResultManifest{}, err
	}
	return ResultManifest{
		ProtocolVersion: ProtocolVersion, ID: id, TaskID: task.ID, JobID: task.JobID,
		StageRunID: task.StageRunID, Artifacts: result.Artifacts, Metadata: result.Metadata, CreatedAt: time.Now().UTC(),
	}, nil
}

func writeResultManifest(guard *PathGuard, task Task, manifest ResultManifest) error {
	dir, err := guard.TaskDir(task.JobID, task.ID)
	if err != nil {
		return err
	}
	return atomicWriteJSON(filepath.Join(dir, "result-manifest.json"), manifest)
}
