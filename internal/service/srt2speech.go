package service

import (
	"context"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/service/dubbing"
	"krillin-ai/internal/types"
	"path/filepath"
)

func targetSRTPathForDubbing(taskBasePath string) string {
	return filepath.Join(taskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
}

type voiceCloneFunc func(prefix, audioURL string) (string, error)

// voiceCloneFuncForProvider returns the voice clone implementation that belongs to
// the configured TTS provider, so a cloned voice is always created by the same
// provider that will synthesize the dubbing audio.
func (s Service) voiceCloneFuncForProvider(provider string) voiceCloneFunc {
	if provider == ttsProviderMinimax {
		if s.MinimaxVoiceCloneClient == nil {
			return nil
		}
		return s.MinimaxVoiceCloneClient.CloneVoice
	}
	if s.VoiceCloneClient == nil {
		return nil
	}
	return s.VoiceCloneClient.CosyVoiceClone
}

func resolveDubbingVoiceCode(baseVoice, cloneURL string, clone voiceCloneFunc) (string, error) {
	if cloneURL == "" {
		return baseVoice, nil
	}
	if clone == nil {
		return "", fmt.Errorf("srtFileToSpeech CosyVoiceClone error: voice clone client is nil")
	}
	code, err := clone("krillinai", cloneURL)
	if err != nil {
		return "", fmt.Errorf("srtFileToSpeech CosyVoiceClone error: %w", err)
	}
	return code, nil
}

// 输入目标语言字幕，生成配音
func (s Service) srtFileToSpeech(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if stepParam == nil {
		return fmt.Errorf("srtFileToSpeech stepParam is nil")
	}
	if !stepParam.EnableTts {
		return nil
	}
	if stepParam.TtsSourceFilePath == "" {
		stepParam.TtsSourceFilePath = targetSRTPathForDubbing(stepParam.TaskBasePath)
	}

	clone := s.voiceCloneFuncForProvider(config.Conf.Tts.Provider)
	voiceCode, err := resolveDubbingVoiceCode(stepParam.TtsVoiceCode, stepParam.VoiceCloneAudioUrl, clone)
	if err != nil {
		return err
	}

	outputAudio := stepParam.TtsResultFilePath
	if outputAudio == "" {
		outputAudio = filepath.Join(stepParam.TaskBasePath, types.TtsResultAudioFileName)
	}
	outputVideo := stepParam.VideoWithTtsFilePath
	if outputVideo == "" {
		outputVideo = filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskVideoWithTtsFileName)
	}

	runner := dubbing.NewRunner(dubbing.Dependencies{
		TTS:         s.TtsClient,
		Chat:        s.ChatCompleter,
		Language:    stepParam.TargetLanguage,
		Voice:       voiceCode,
		Workdir:     stepParam.TaskBasePath,
		InputSRT:    stepParam.TtsSourceFilePath,
		InputVideo:  stepParam.InputVideoPath,
		OutputAudio: outputAudio,
		OutputVideo: outputVideo,
		Config: dubbing.Config{
			MinSubtitleDuration: config.Conf.Dubbing.MinSubtitleDuration,
			MaxChunkSize:        config.Conf.Dubbing.MaxChunkSize,
			GapTolerance:        config.Conf.Dubbing.GapTolerance,
			SpeedMin:            config.Conf.Dubbing.SpeedMin,
			SpeedAccept:         config.Conf.Dubbing.SpeedAccept,
			SpeedMax:            config.Conf.Dubbing.SpeedMax,
			EnableTextRewrite:   config.Conf.Dubbing.EnableTextRewrite,
			RewriteMaxAttempts:  config.Conf.Dubbing.RewriteMaxAttempts,
			Estimator:           config.Conf.Dubbing.Estimator,
		},
	})
	result, err := runner.Run(ctx)
	if err != nil {
		return fmt.Errorf("srtFileToSpeech dubbing runner error: %w", err)
	}
	stepParam.TtsResultFilePath = result.Audio
	stepParam.VideoWithTtsFilePath = result.Video
	if stepParam.TaskPtr != nil {
		stepParam.TaskPtr.ProcessPct = 98
	}
	return nil
}
