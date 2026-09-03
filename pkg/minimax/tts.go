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
	"krillin-ai/internal/types"
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
	return c.buildSpeechRequest(types.TTSSpeechOptions{Text: text, Voice: voice})
}

func (c *TtsClient) buildSpeechRequest(options types.TTSSpeechOptions) ([]byte, error) {
	voice := strings.TrimSpace(options.Voice)
	voice = strings.TrimSpace(voice)
	if voice == "" {
		voice = DefaultVoice
	}
	speed := options.Speed
	if speed <= 0 {
		speed = 1
	}
	reqBody := t2aRequest{
		Model:  c.Model,
		Text:   options.Text,
		Stream: false,
		VoiceSetting: voiceSetting{
			VoiceID: voice,
			Speed:   speed,
			Vol:     1,
			Pitch:   0,
		},
		AudioSetting: audioSetting{
			SampleRate: 44100,
			Format:     speechFormat(options.Format, options.OutputFile),
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
	return c.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       text,
		Voice:      voice,
		OutputFile: outputFile,
	})
}

func (c *TtsClient) Synthesize(ctx context.Context, options types.TTSSpeechOptions) error {
	if c.ApiKey == "" {
		return fmt.Errorf("minimax tts api key is empty")
	}

	body, err := c.buildSpeechRequest(options)
	if err != nil {
		return fmt.Errorf("minimax tts build request failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
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

	outputDir := filepath.Dir(options.OutputFile)
	if err = os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("minimax tts create output dir failed: %w", err)
	}
	if err = os.WriteFile(options.OutputFile, audio, 0644); err != nil {
		return fmt.Errorf("minimax tts write output file failed: %w", err)
	}

	return nil
}

func speechFormat(explicit, outputFile string) string {
	format := strings.ToLower(strings.TrimSpace(explicit))
	if format == "mp3" || format == "wav" {
		return format
	}
	if strings.EqualFold(filepath.Ext(outputFile), ".mp3") {
		return "mp3"
	}
	return "wav"
}

func (c *TtsClient) ListVoices(ctx context.Context) ([]types.TTSVoice, error) {
	if c.ApiKey == "" {
		return append([]types.TTSVoice(nil), minimaxFallbackVoices...), nil
	}
	body, err := json.Marshal(map[string]string{"voice_type": "all"})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseUrl+"/v1/get_voice", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.ApiKey)
	response, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("minimax get_voice returned HTTP %d", response.StatusCode)
	}
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return nil, err
	}
	voices := extractMiniMaxVoices(payload)
	if len(voices) == 0 {
		return append([]types.TTSVoice(nil), minimaxFallbackVoices...), nil
	}
	return voices, nil
}

func extractMiniMaxVoices(payload map[string]any) []types.TTSVoice {
	groups := []struct {
		key  string
		kind string
	}{
		{key: "system_voice", kind: "builtin"},
		{key: "voice_cloning", kind: "custom"},
		{key: "voice_generation", kind: "designed"},
	}
	var voices []types.TTSVoice
	for _, group := range groups {
		values, ok := payload[group.key].([]any)
		if !ok {
			continue
		}
		for _, value := range values {
			item, ok := value.(map[string]any)
			if !ok {
				continue
			}
			code := miniMaxString(item, "voice_id", "voiceId")
			if code == "" {
				continue
			}
			name := miniMaxString(item, "voice_name", "voiceName")
			if name == "" {
				name = code
			}
			voices = append(voices, types.TTSVoice{
				Code:     code,
				Name:     name,
				Provider: "minimax",
				Kind:     group.kind,
			})
		}
	}
	return voices
}

func miniMaxString(value map[string]any, keys ...string) string {
	for _, key := range keys {
		if candidate, ok := value[key].(string); ok && strings.TrimSpace(candidate) != "" {
			return strings.TrimSpace(candidate)
		}
	}
	return ""
}

var minimaxFallbackVoices = []types.TTSVoice{
	{Code: "English_Graceful_Lady", Name: "Graceful Lady", Language: "en", Gender: "female", Provider: "minimax", Scenario: "优雅女声", Kind: "builtin", Recommended: true},
	{Code: "English_radiant_girl", Name: "Radiant Girl", Language: "en", Gender: "female", Provider: "minimax", Scenario: "活泼女声", Kind: "builtin"},
	{Code: "English_Insightful_Speaker", Name: "Insightful Speaker", Language: "en", Gender: "male", Provider: "minimax", Scenario: "沉稳男声", Kind: "builtin"},
	{Code: "English_Persuasive_Man", Name: "Persuasive Man", Language: "en", Gender: "male", Provider: "minimax", Scenario: "说服力", Kind: "builtin"},
	{Code: "English_expressive_narrator", Name: "Expressive Narrator", Language: "en", Gender: "male", Provider: "minimax", Scenario: "旁白", Kind: "builtin"},
	{Code: "English_Lucky_Robot", Name: "Lucky Robot", Language: "en", Gender: "neutral", Provider: "minimax", Scenario: "机器人", Kind: "builtin"},
}
