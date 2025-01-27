package openai

import (
	"context"
	openai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/log"
)

func (c *Client) ChatCompletion(query string) (string, error) {
	req := openai.ChatCompletionRequest{
		Model: openai.GPT4oMini20240718,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: "You are an assistant that helps with subtitle translation.",
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: query,
			},
		},
	}
	if config.Conf.Openai.Model != "" {
		req.Model = config.Conf.Openai.Model
	}

	resp, err := c.client.CreateChatCompletion(context.Background(), req)
	if err != nil {
		log.GetLogger().Error("openai create chat completion failed", zap.Error(err))
		return "", err
	}

	resContent := resp.Choices[0].Message.Content

	return resContent, nil
}
