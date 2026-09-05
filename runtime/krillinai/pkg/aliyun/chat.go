package aliyun

import (
	"context"
	goopenai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"krillin-ai/log"
)

type ChatClient struct {
	*goopenai.Client
}

func NewChatClient(apiKey string) *ChatClient {
	cfg := goopenai.DefaultConfig(apiKey)
	cfg.BaseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1" // 使用阿里云的openai兼容模式调用
	return &ChatClient{
		Client: goopenai.NewClientWithConfig(cfg),
	}
}

func (c ChatClient) ChatCompletion(query string) (string, error) {
	req := goopenai.ChatCompletionRequest{
		Model: "qwen-plus",
		Messages: []goopenai.ChatCompletionMessage{
			{
				Role:    goopenai.ChatMessageRoleSystem,
				Content: "You are an assistant that helps with subtitle translation.",
			},
			{
				Role:    goopenai.ChatMessageRoleUser,
				Content: query,
			},
		},
	}

	resp, err := c.CreateChatCompletion(context.Background(), req)
	if err != nil {
		log.GetLogger().Error("aliyun openai create chat completion failed", zap.Error(err))
		return "", err
	}

	resContent := resp.Choices[0].Message.Content

	return resContent, nil
}
