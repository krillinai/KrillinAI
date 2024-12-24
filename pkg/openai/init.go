package openai

import (
	"github.com/sashabaranov/go-openai"
	"net/http"
	"net/url"
)

type Client struct {
	client *openai.Client
}

func NewClient(apiKey string, proxyUrl *url.URL) *Client {
	cfg := openai.DefaultConfig(apiKey)

	if proxyUrl != nil {
		transport := &http.Transport{
			Proxy: http.ProxyURL(proxyUrl),
		}
		cfg.HTTPClient = &http.Client{
			Transport: transport,
		}
	}

	client := openai.NewClientWithConfig(cfg)
	return &Client{client: client}
}
