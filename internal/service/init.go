package service

import (
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/aliyun"
	"krillin-ai/pkg/openai"
)

type Service struct {
	OpenaiClient    *openai.Client
	CosyCloneClient *aliyun.Client

	Transcriber   types.Transcriber
	ChatCompleter types.ChatCompleter
}

func NewService() *Service {
	var transcriber types.Transcriber
	var chatCompleter types.ChatCompleter

	switch config.Conf.App.TranscribeProvider {
	case "openai":
		transcriber = openai.NewClient(config.Conf.Openai.ApiKey, config.Conf.App.ParsedProxy)
	case "aliyun":
		transcriber = aliyun.NewClient()
	}
	log.GetLogger().Info("当前选择的转录源： ", zap.String("transcriber", config.Conf.App.TranscribeProvider))

	switch config.Conf.App.LlmProvider {
	case "openai":
		chatCompleter = openai.NewClient(config.Conf.Openai.ApiKey, config.Conf.App.ParsedProxy)
	case "aliyun":
		chatCompleter = aliyun.NewChatClient(config.Conf.Aliyun.Bailian.ApiKey)
	}
	log.GetLogger().Info("当前选择的LLM源： ", zap.String("llm", config.Conf.App.LlmProvider))

	return &Service{
		OpenaiClient:    openai.NewClient(config.Conf.Openai.ApiKey, config.Conf.App.ParsedProxy),
		CosyCloneClient: aliyun.NewClient(),

		Transcriber:   transcriber,
		ChatCompleter: chatCompleter,
	}
}
