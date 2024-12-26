package openai

import (
	"context"
	openai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"krillin-ai/internal/types"
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

	resp, err := c.client.CreateChatCompletion(context.Background(), req)
	if err != nil {
		log.GetLogger().Error("openai create chat completion failed", zap.Error(err))
		return "", err
	}

	resContent := resp.Choices[0].Message.Content

	return resContent, nil
}

func (c *Client) Transcription(audioFile, language string) (*types.TranscriptionData, error) {
	resp, err := c.client.CreateTranscription(
		context.Background(),
		openai.AudioRequest{
			Model:    openai.Whisper1,
			FilePath: audioFile,
			Format:   openai.AudioResponseFormatVerboseJSON,
			TimestampGranularities: []openai.TranscriptionTimestampGranularity{
				openai.TranscriptionTimestampGranularityWord,
			},
			Language: language,
		},
	)
	if err != nil {
		log.GetLogger().Error("openai create transcription failed", zap.Error(err))
		return nil, err
	}

	transcriptionData := &types.TranscriptionData{
		Language: resp.Language,
		Text:     resp.Text,
		Words:    make([]types.Word, 0),
	}
	num := 0
	for _, word := range resp.Words {
		wordItem := types.Word{
			Num:   num,
			Text:  word.Word,
			Start: word.Start,
			End:   word.End,
		}
		num++
		transcriptionData.Words = append(transcriptionData.Words, wordItem)
	}

	return transcriptionData, nil
}
