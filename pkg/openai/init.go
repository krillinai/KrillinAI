package openai

import (
	"krillin-ai/config"
	"net/http"

	"github.com/sashabaranov/go-openai"
)

type Client struct {
	client  *openai.Client
	BaseUrl string
	ApiKey  string
}

func NewClient(baseUrl, apiKey, proxyAddr string) *Client {
	cfg := openai.DefaultConfig(apiKey)
	if baseUrl != "" {
		cfg.BaseURL = baseUrl
	}

	if proxyAddr != "" {
		transport := &http.Transport{
			Proxy: http.ProxyURL(config.Conf.App.ParsedProxy),
		}
		cfg.HTTPClient = &http.Client{
			Transport: transport,
		}
	}

	openAIclient := openai.NewClientWithConfig(cfg)
	return &Client{
		client:  openAIclient,
		BaseUrl: baseUrl,
		ApiKey:  apiKey,
	}
}
