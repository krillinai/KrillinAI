package service

import (
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/aliyun"
	"krillin-ai/pkg/openai"
)

type Service struct {
	OpenaiClient    *openai.Client
	CosyCloneClient *aliyun.AliyunClient

	Transcriber types.Transcriber
}

func NewService() *Service {
	var transcriber types.Transcriber

	switch config.Conf.App.TranscribeProvider {
	case "openai":
		transcriber = openai.NewClient(config.Conf.Openai.ApiKey, config.Conf.App.ParsedProxy)
	case "aliyun":
		transcriber = aliyun.NewClient()
	}

	return &Service{
		OpenaiClient:    openai.NewClient(config.Conf.Openai.ApiKey, config.Conf.App.ParsedProxy),
		CosyCloneClient: aliyun.NewClient(),

		Transcriber: transcriber,
	}
}
