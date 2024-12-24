package service

import (
	"krillin-ai/config"
	"krillin-ai/pkg/aliyun"
	"krillin-ai/pkg/openai"
)

type Service struct {
	OpenaiClient    *openai.Client
	CosyCloneClient *aliyun.CosyCloneClient
}

func NewService() *Service {
	return &Service{
		OpenaiClient:    openai.NewClient(config.Conf.Openai.ApiKey, config.Conf.App.ParsedProxy),
		CosyCloneClient: aliyun.NewCosyCloneClient(),
	}
}
