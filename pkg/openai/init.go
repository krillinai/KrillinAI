package openai

import (
	"github.com/sashabaranov/go-openai"
)

type Client struct {
	client *openai.Client
}

func NewClient(baseUrl, apiKey, proxyAddr string) *Client {
	cfg := openai.DefaultConfig(apiKey)
	if baseUrl != "" {
		cfg.BaseURL = baseUrl
	}

	client := openai.NewClientWithConfig(cfg)
	return &Client{client: client}
}
