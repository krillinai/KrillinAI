package service

import (
	"krillin-ai/pkg/aliyun"
	"krillin-ai/pkg/openai"
)

type Service struct {
	OpenaiClient    *openai.Client
	CosyCloneClient *aliyun.CosyCloneClient
}

func NewService() *Service {
	return &Service{
		OpenaiClient:    openai.NewClient(),
		CosyCloneClient: aliyun.NewCosyCloneClient(),
	}
}
