// Package twelvelabs provides an opt-in client for TwelveLabs Pegasus video
// understanding. It is used to generate a scene/context summary of the source
// video that can be injected into subtitle translation prompts, yielding more
// context-aware ("scene-aware") translations. TwelveLabs has no official Go
// SDK, so this talks to the public REST API directly.
package twelvelabs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
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
	// DefaultBaseUrl is the TwelveLabs public API base URL.
	DefaultBaseUrl = "https://api.twelvelabs.io/v1.3"
	// DefaultModel is the Pegasus model used for content understanding.
	DefaultModel = "pegasus1.5"
	// DefaultPrompt asks Pegasus for a compact, translation-oriented summary
	// of the video's setting, characters, tone and domain.
	DefaultPrompt = "You are assisting a subtitle translator. In 3-4 concise sentences, describe " +
		"this video's setting, the main characters/speakers and their relationships, the overall " +
		"tone (e.g. formal, comedic, technical), and the subject domain or jargon. This summary " +
		"will be used as context to translate the subtitles accurately; do not transcribe speech."
	// maxTokens for the Pegasus 1.5 general-analysis mode (min 512).
	defaultMaxTokens = 1024
	// analysisTimeout bounds a single analyze call. Pegasus downloads and
	// processes the whole video, so this is generous.
	analysisTimeout = 5 * time.Minute
	// maxDirectUploadBytes is the documented cap for direct asset uploads
	// (200MB). Larger files must be hosted and analyzed via a public URL.
	maxDirectUploadBytes = 200 * 1024 * 1024
)

// Client calls the TwelveLabs Pegasus analyze endpoint. It reads its own API
// key from configuration and never logs or hardcodes credentials.
type Client struct {
	BaseUrl    string
	ApiKey     string
	Model      string
	Prompt     string
	httpClient *http.Client
}

// NewClient creates a Pegasus client. Empty parameters fall back to defaults.
func NewClient(baseUrl, apiKey, model, prompt string) *Client {
	baseUrl = strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if baseUrl == "" {
		baseUrl = DefaultBaseUrl
	}
	if strings.TrimSpace(model) == "" {
		model = DefaultModel
	}
	if strings.TrimSpace(prompt) == "" {
		prompt = DefaultPrompt
	}

	transport := &http.Transport{}
	if config.Conf.App.Proxy != "" && config.Conf.App.ParsedProxy != nil {
		transport.Proxy = http.ProxyURL(config.Conf.App.ParsedProxy)
	}

	return &Client{
		BaseUrl: baseUrl,
		ApiKey:  apiKey,
		Model:   model,
		Prompt:  prompt,
		httpClient: &http.Client{
			Timeout:   analysisTimeout,
			Transport: transport,
		},
	}
}

// videoSource is the "video" object accepted by /analyze. A public URL is the
// most portable input; uploaded asset IDs are also supported.
type videoSource struct {
	Type    string `json:"type"`
	Url     string `json:"url,omitempty"`
	AssetID string `json:"asset_id,omitempty"`
}

type analyzeRequest struct {
	Video     videoSource `json:"video"`
	ModelName string      `json:"model_name"`
	Prompt    string      `json:"prompt"`
	MaxTokens int         `json:"max_tokens"`
	// Stream must be false so the API returns a single JSON object with a
	// "data" field instead of an NDJSON event stream.
	Stream bool `json:"stream"`
}

type analyzeResponse struct {
	Data string `json:"data"`
	// Error fields returned by the API on failure.
	Code    string `json:"code"`
	Message string `json:"message"`
}

// AnalyzeURL runs Pegasus content understanding on a publicly reachable video
// URL and returns the generated summary text.
//
// Notes / API limits (verified against the v1.3 REST API):
//   - The URL must be a direct http(s) link to raw media (no YouTube/Drive
//     share links). Public URLs are supported up to ~4GB.
//   - The analyzed window must be at least 4 seconds.
func (c *Client) AnalyzeURL(videoUrl string) (string, error) {
	return c.analyze(videoSource{Type: "url", Url: videoUrl})
}

// AnalyzeAssetID runs Pegasus on a previously uploaded asset (asset status
// must be "ready"). Local-file uploads via the assets API are capped at 200MB;
// for larger local files, host the file and use AnalyzeURL instead.
func (c *Client) AnalyzeAssetID(assetID string) (string, error) {
	return c.analyze(videoSource{Type: "asset_id", AssetID: assetID})
}

// AnalyzeVideoFile uploads a local video file as a TwelveLabs asset and then
// runs Pegasus content understanding on it. This is the path used for locally
// downloaded/uploaded videos (the common case in KrillinAI).
//
// Direct uploads are capped at 200MB; larger files return an error so the
// caller can fall back to a hosted URL via AnalyzeURL.
func (c *Client) AnalyzeVideoFile(videoPath string) (string, error) {
	assetID, err := c.UploadAsset(videoPath)
	if err != nil {
		return "", err
	}
	return c.AnalyzeAssetID(assetID)
}

type assetResponse struct {
	ID      string `json:"_id"`
	Status  string `json:"status"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// UploadAsset uploads a local video file via the direct method and returns the
// asset ID once it is ready.
func (c *Client) UploadAsset(videoPath string) (string, error) {
	if strings.TrimSpace(c.ApiKey) == "" {
		return "", fmt.Errorf("twelvelabs api key is empty")
	}

	info, err := os.Stat(videoPath)
	if err != nil {
		return "", fmt.Errorf("twelvelabs stat video file failed: %w", err)
	}
	if info.Size() > maxDirectUploadBytes {
		return "", fmt.Errorf("twelvelabs direct upload is capped at 200MB (file is %d bytes); host the file and use AnalyzeURL instead", info.Size())
	}

	file, err := os.Open(videoPath)
	if err != nil {
		return "", fmt.Errorf("twelvelabs open video file failed: %w", err)
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err = writer.WriteField("method", "direct"); err != nil {
		return "", err
	}
	part, err := writer.CreateFormFile("file", filepath.Base(videoPath))
	if err != nil {
		return "", err
	}
	if _, err = io.Copy(part, file); err != nil {
		return "", err
	}
	if err = writer.Close(); err != nil {
		return "", err
	}

	ctx, cancel := context.WithTimeout(context.Background(), analysisTimeout)
	defer cancel()

	url := c.BaseUrl + "/assets"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("x-api-key", c.ApiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.GetLogger().Error("twelvelabs asset upload request failed", zap.Error(err))
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var parsed assetResponse
	if err = json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("twelvelabs asset upload decode response failed: %w", err)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		log.GetLogger().Error("twelvelabs asset upload non-2xx status", zap.Int("status_code", resp.StatusCode), zap.String("code", parsed.Code), zap.String("message", parsed.Message))
		return "", fmt.Errorf("twelvelabs asset upload none-2xx status code: %d (%s: %s)", resp.StatusCode, parsed.Code, parsed.Message)
	}
	if parsed.ID == "" {
		return "", fmt.Errorf("twelvelabs asset upload returned empty asset id")
	}
	return parsed.ID, nil
}

func (c *Client) analyze(video videoSource) (string, error) {
	if strings.TrimSpace(c.ApiKey) == "" {
		return "", fmt.Errorf("twelvelabs api key is empty")
	}

	reqBody := analyzeRequest{
		Video:     video,
		ModelName: c.Model,
		Prompt:    c.Prompt,
		MaxTokens: defaultMaxTokens,
		Stream:    false,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("twelvelabs marshal request failed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), analysisTimeout)
	defer cancel()

	url := c.BaseUrl + "/analyze"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", c.ApiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.GetLogger().Error("twelvelabs analyze request failed", zap.Error(err))
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var parsed analyzeResponse
	if err = json.Unmarshal(respBody, &parsed); err != nil {
		log.GetLogger().Error("twelvelabs analyze decode response failed", zap.Error(err), zap.Int("status_code", resp.StatusCode))
		return "", fmt.Errorf("twelvelabs analyze decode response failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		// Do not log the response body verbatim at error level beyond the API's
		// own message to avoid leaking request context.
		log.GetLogger().Error("twelvelabs analyze non-200 status", zap.Int("status_code", resp.StatusCode), zap.String("code", parsed.Code), zap.String("message", parsed.Message))
		return "", fmt.Errorf("twelvelabs analyze none-200 status code: %d (%s: %s)", resp.StatusCode, parsed.Code, parsed.Message)
	}

	summary := strings.TrimSpace(parsed.Data)
	if summary == "" {
		return "", fmt.Errorf("twelvelabs analyze returned empty summary")
	}
	return summary, nil
}
