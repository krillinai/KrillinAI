package openai

import (
	"context"
	openai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"strings"
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

func (c *Client) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
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
		Text:     strings.ReplaceAll(resp.Text, "-", " "), // 连字符处理，因为模型存在很多错误添加到连字符
		Words:    make([]types.Word, 0),
	}
	num := 0
	for _, word := range resp.Words {
		if strings.Contains(word.Word, "—") {
			// 对称切分
			mid := (word.Start + word.End) / 2
			seperatedWords := strings.Split(word.Word, "—")
			transcriptionData.Words = append(transcriptionData.Words, []types.Word{
				{
					Num:   num,
					Text:  seperatedWords[0],
					Start: word.Start,
					End:   mid,
				},
				{
					Num:   num + 1,
					Text:  seperatedWords[1],
					Start: mid,
					End:   word.End,
				},
			}...)
			num += 2
		} else {
			transcriptionData.Words = append(transcriptionData.Words, types.Word{
				Num:   num,
				Text:  word.Word,
				Start: word.Start,
				End:   word.End,
			})
			num++
		}
	}

	return transcriptionData, nil
}
