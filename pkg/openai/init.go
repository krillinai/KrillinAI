package openai

import (
	"fmt"
	"github.com/sashabaranov/go-openai"
	"krillin-ai/config"
	"net/http"
	"net/url"
)

type Client struct {
	client *openai.Client
}

func NewClient() *Client {
	cfg := openai.DefaultConfig(config.Conf.Openai.ApiKey)

	proxy := config.Conf.App.Proxy
	if proxy != "" {
		proxyUrl, err := url.Parse(config.Conf.App.Proxy)
		if err != nil {
			panic(fmt.Sprintf("代理地址解析失败: %v", err))
		}
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
