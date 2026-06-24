package minimax

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"krillin-ai/config"
	"krillin-ai/log"

	"go.uber.org/zap"
)

const (
	// DefaultBaseUrl 海外版地址，国内可改用 https://api.minimaxi.com
	DefaultBaseUrl = "https://api.minimax.io"
	// DefaultModel 推荐默认 TTS 模型，音色相似度最高
	DefaultModel = "speech-2.8-hd"
	// DefaultVoice 当未指定音色时使用的默认音色
	DefaultVoice = "English_Graceful_Lady"
)

// TtsClient 调用 MiniMax T2A v2 文本转语音接口，实现 types.Ttser。
type TtsClient struct {
	BaseUrl    string
	ApiKey     string
	Model      string
	httpClient *http.Client
}

// NewTtsClient 创建 MiniMax TTS 客户端，空参数回退到默认值。
func NewTtsClient(baseUrl, apiKey, model string) *TtsClient {
	baseUrl = strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if baseUrl == "" {
		baseUrl = DefaultBaseUrl
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultModel
	}

	transport := &http.Transport{}
	if config.Conf.App.Proxy != "" && config.Conf.App.ParsedProxy != nil {
		transport.Proxy = http.ProxyURL(config.Conf.App.ParsedProxy)
	}

	return &TtsClient{
		BaseUrl: baseUrl,
		ApiKey:  apiKey,
		Model:   model,
		httpClient: &http.Client{
			Timeout:   60 * time.Second,
			Transport: transport,
		},
	}
}

type voiceSetting struct {
	VoiceID string  `json:"voice_id"`
	Speed   float64 `json:"speed"`
	Vol     float64 `json:"vol"`
	Pitch   int     `json:"pitch"`
}

type audioSetting struct {
	SampleRate int    `json:"sample_rate"`
	Format     string `json:"format"`
	Channel    int    `json:"channel"`
}

type t2aRequest struct {
	Model        string       `json:"model"`
	Text         string       `json:"text"`
	Stream       bool         `json:"stream"`
	VoiceSetting voiceSetting `json:"voice_setting"`
	AudioSetting audioSetting `json:"audio_setting"`
}

type t2aResponse struct {
	Data struct {
		Audio  string `json:"audio"`
		Status int    `json:"status"`
	} `json:"data"`
	BaseResp struct {
		StatusCode int    `json:"status_code"`
		StatusMsg  string `json:"status_msg"`
	} `json:"base_resp"`
}

// buildRequestBody 组装非流式 T2A v2 请求体，输出 wav 以匹配下游配音流程。
func (c *TtsClient) buildRequestBody(text, voice string) ([]byte, error) {
	voice = strings.TrimSpace(voice)
	if voice == "" {
		voice = DefaultVoice
	}
	reqBody := t2aRequest{
		Model:  c.Model,
		Text:   text,
		Stream: false,
		VoiceSetting: voiceSetting{
			VoiceID: voice,
			Speed:   1,
			Vol:     1,
			Pitch:   0,
		},
		AudioSetting: audioSetting{
			SampleRate: 44100,
			Format:     "wav",
			Channel:    1,
		},
	}
	return json.Marshal(reqBody)
}

// decodeAudio 解析非流式响应，校验业务状态码后将 hex 音频解码为字节。
func decodeAudio(respBody []byte) ([]byte, error) {
	var parsed t2aResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("minimax tts decode response failed: %w", err)
	}
	if parsed.BaseResp.StatusCode != 0 {
		return nil, fmt.Errorf("minimax tts api error: status_code=%d, status_msg=%s", parsed.BaseResp.StatusCode, parsed.BaseResp.StatusMsg)
	}
	if parsed.Data.Audio == "" {
		return nil, fmt.Errorf("minimax tts api returned empty audio")
	}
	// MiniMax 返回 hex 编码音频（非 base64）
	audio, err := hex.DecodeString(parsed.Data.Audio)
	if err != nil {
		return nil, fmt.Errorf("minimax tts hex decode failed: %w", err)
	}
	return audio, nil
}

// Text2Speech 将文本合成为语音并写入 outputFile（wav）。
func (c *TtsClient) Text2Speech(text, voice, outputFile string) error {
	if c.ApiKey == "" {
		return fmt.Errorf("minimax tts api key is empty")
	}

	body, err := c.buildRequestBody(text, voice)
	if err != nil {
		return fmt.Errorf("minimax tts build request failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	url := c.BaseUrl + "/v1/t2a_v2"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.ApiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.GetLogger().Error("minimax tts request failed", zap.Error(err))
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		log.GetLogger().Error("minimax tts non-200 status", zap.Int("status_code", resp.StatusCode), zap.String("body", string(respBody)))
		return fmt.Errorf("minimax tts none-200 status code: %d", resp.StatusCode)
	}

	audio, err := decodeAudio(respBody)
	if err != nil {
		log.GetLogger().Error("minimax tts decode audio failed", zap.Error(err))
		return err
	}

	outputDir := filepath.Dir(outputFile)
	if err = os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("minimax tts create output dir failed: %w", err)
	}
	if err = os.WriteFile(outputFile, audio, 0644); err != nil {
		return fmt.Errorf("minimax tts write output file failed: %w", err)
	}

	return nil
}
