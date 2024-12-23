package openai

import (
	"context"
	openai "github.com/sashabaranov/go-openai"
	"github.com/wulien/jupiter/pkg/xlog"
)

type Word struct {
	Num   int
	Text  string
	Start float64
	End   float64
}

type TranscriptionData struct {
	Language string
	Text     string
	Words    []Word
}

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
		xlog.Default().Error("openai create chat completion failed", xlog.FieldErr(err))
		return "", err
	}

	resContent := resp.Choices[0].Message.Content

	return resContent, nil
}

func (c *Client) Transcription(audioFile, language string) (*TranscriptionData, error) {
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
		xlog.Default().Error("openai create transcription failed", xlog.FieldErr(err))
		return nil, err
	}

	transcriptionData := &TranscriptionData{
		Language: resp.Language,
		Text:     resp.Text,
		Words:    make([]Word, 0),
	}
	num := 0
	for _, word := range resp.Words {
		wordItem := Word{
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
