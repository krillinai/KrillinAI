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

// 输入目标语言字幕，生成配音
func (s Service) srtFileToSpeech(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if !stepParam.EnableTts {
		return nil
	}
	if stepParam.TtsSourceFilePath == "" {
		stepParam.TtsSourceFilePath = targetSRTPathForDubbing(stepParam.TaskBasePath)
	}

	voiceCode := stepParam.TtsVoiceCode
	if stepParam.VoiceCloneAudioUrl != "" {
		if s.VoiceCloneClient == nil {
			return fmt.Errorf("srtFileToSpeech CosyVoiceClone error: voice clone client is nil")
		}
		code, err := s.VoiceCloneClient.CosyVoiceClone("krillinai", stepParam.VoiceCloneAudioUrl)
		if err != nil {
			return fmt.Errorf("srtFileToSpeech CosyVoiceClone error: %w", err)
		}
		voiceCode = code
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
