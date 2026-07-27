package service

import (
	"fmt"
	"strings"

	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/twelvelabs"

	"go.uber.org/zap"
)

// enrichVideoContext is an OPT-IN step that uses a video-understanding provider
// (currently TwelveLabs Pegasus) to produce a short scene/context summary of
// the source video. The summary is stored on stepParam and later prepended to
// translation prompts for more context-aware ("scene-aware") translation.
//
// It is a no-op unless content_understanding.provider is configured, so the
// default translation behavior is unchanged. Any failure is logged and
// swallowed: content understanding is an enhancement, never a hard dependency
// of the translation pipeline.
func (s Service) enrichVideoContext(stepParam *types.SubtitleTaskStepParam) {
	provider := strings.TrimSpace(config.Conf.ContentUnderstanding.Provider)
	if provider == "" {
		return // 未启用，保持原有行为
	}

	switch provider {
	case "twelvelabs":
		cfg := config.Conf.ContentUnderstanding.TwelveLabs
		if strings.TrimSpace(cfg.ApiKey) == "" {
			log.GetLogger().Warn("content_understanding provider is twelvelabs but api_key is empty; skipping video context")
			return
		}
		if strings.TrimSpace(stepParam.InputVideoPath) == "" {
			log.GetLogger().Info("content_understanding: no input video available; skipping video context", zap.Any("taskId", stepParam.TaskId))
			return
		}

		client := twelvelabs.NewClient(cfg.BaseUrl, cfg.ApiKey, cfg.Model, cfg.Prompt)
		summary, err := client.AnalyzeVideoFile(stepParam.InputVideoPath)
		if err != nil {
			// 内容理解为增强项，失败不应中断翻译流程
			log.GetLogger().Warn("content_understanding: twelvelabs analyze failed; continuing without video context", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
			return
		}
		stepParam.VideoContextSummary = summary
		log.GetLogger().Info("content_understanding: generated video context summary", zap.Any("taskId", stepParam.TaskId), zap.Int("summaryLen", len(summary)))
	default:
		log.GetLogger().Warn("content_understanding: unsupported provider; skipping video context", zap.String("provider", provider))
	}
}

// withVideoContext prepends the video scene summary to a translation prompt
// when one is available; otherwise the prompt is returned unchanged.
func withVideoContext(summary, prompt string) string {
	summary = strings.TrimSpace(summary)
	if summary == "" {
		return prompt
	}
	return fmt.Sprintf(types.VideoContextPromptPrefix, summary) + prompt
}
