package openai

import (
	"context"
	"fmt"
	"io"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"net/http"
	"os"
	"strings"

	openai "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
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
		Stream:    true,
		MaxTokens: 8192,
	}
	if config.Conf.Openai.Model != "" {
		req.Model = config.Conf.Openai.Model
	}

	stream, err := c.client.CreateChatCompletionStream(context.Background(), req)
	if err != nil {
		log.GetLogger().Error("openai create chat completion stream failed", zap.Error(err))
		return "", err
	}
	defer stream.Close()

	var resContent string
	for {
		response, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.GetLogger().Error("openai stream receive failed", zap.Error(err))
			return "", err
		}
		if len(response.Choices) == 0 {
			log.GetLogger().Info("openai stream receive no choices", zap.Any("response", response))
			continue
		}

		resContent += response.Choices[0].Delta.Content
	}

	return resContent, nil
}

func (c *Client) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	transReq := openai.AudioRequest{
		Model:    openai.Whisper1,
		FilePath: audioFile,
		Format:   openai.AudioResponseFormatVerboseJSON,
		TimestampGranularities: []openai.TranscriptionTimestampGranularity{
			openai.TranscriptionTimestampGranularityWord,
		},
		Language: language,
	}
	if config.Conf.Openai.Model != "" {
		transReq.Model = config.Conf.Openai.Model
	}

	resp, err := c.client.CreateTranscription(context.Background(), transReq)
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

func (c *Client) TextToSpeech(text, voice string, outputFile string) error {
	url := fmt.Sprintf(c.BaseUrl, "/v1/audio/speech")

	// 创建HTTP请求
	reqBody := fmt.Sprintf(`{
		"model": "tts-1",
		"input": "%s",
		"voice":"%s",
		"response_format": "wav"
	}`, text, voice)
	req, err := http.NewRequest("POST", url, strings.NewReader(reqBody))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", "sk-AseODaJRaIsYRCKOAufuVHvWZ9Dm6IwCp308qJdQXBok2SzT"))

	// 发送HTTP请求
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("non-200 response: %d", resp.StatusCode)
	}

	// 保存音频文件
	file, err := os.Create(outputFile)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		return err
	}

	return nil
}
