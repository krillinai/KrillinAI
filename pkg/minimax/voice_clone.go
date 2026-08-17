package minimax

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
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
	// fileUploadPath registers a local audio sample and returns its file id.
	fileUploadPath = "/v1/files/upload"
	// voiceClonePath turns an uploaded sample into a reusable voice id.
	voiceClonePath = "/v1/voice_clone"

	// PurposeVoiceClone marks the audio sample the cloned voice is built from.
	PurposeVoiceClone = "voice_clone"
	// PurposePromptAudio marks the optional short reference clip that improves clone similarity.
	PurposePromptAudio = "prompt_audio"

	// DefaultVoiceCloneModel is used when the configured TTS model cannot render a cloned voice.
	DefaultVoiceCloneModel = "speech-2.8-hd"

	// voiceCloneIDSuffixLength keeps the generated voice id above the minimum length the API accepts.
	voiceCloneIDSuffixLength = 8

	// voiceCloneTimeout covers the upload plus the clone call, which are slower than plain synthesis.
	voiceCloneTimeout = 180 * time.Second
)

// supportedVoiceCloneModels lists the models that can render a cloned voice.
var supportedVoiceCloneModels = []string{
	"speech-2.8-hd",
	"speech-2.6-hd",
	"speech-02-hd",
	"speech-01-hd",
}

// supportedCloneAudioFormats lists the container formats the upload endpoint accepts.
var supportedCloneAudioFormats = []string{"mp3", "m4a", "wav"}

// voiceIDAlphabet holds the characters used to make a generated voice id unique.
var voiceIDAlphabet = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

// VoiceCloneClient calls the MiniMax voice cloning endpoints: it uploads a local
// audio sample and converts the returned file id into a voice id that TtsClient
// can synthesize with.
type VoiceCloneClient struct {
	BaseUrl    string
	ApiKey     string
	Model      string
	httpClient *http.Client
}

// NewVoiceCloneClient creates a voice cloning client, reusing the TTS base url so
// the configured region applies to cloning as well.
func NewVoiceCloneClient(baseUrl, apiKey, model string) *VoiceCloneClient {
	baseUrl = strings.TrimRight(strings.TrimSpace(baseUrl), "/")
	if baseUrl == "" {
		baseUrl = DefaultBaseUrl
	}

	transport := &http.Transport{}
	if config.Conf.App.Proxy != "" && config.Conf.App.ParsedProxy != nil {
		transport.Proxy = http.ProxyURL(config.Conf.App.ParsedProxy)
	}

	return &VoiceCloneClient{
		BaseUrl: baseUrl,
		ApiKey:  apiKey,
		Model:   resolveVoiceCloneModel(model),
		httpClient: &http.Client{
			Timeout:   voiceCloneTimeout,
			Transport: transport,
		},
	}
}

// resolveVoiceCloneModel keeps the configured model when it supports cloning and
// falls back to the default clone model otherwise.
func resolveVoiceCloneModel(model string) string {
	model = strings.TrimSpace(model)
	for _, supported := range supportedVoiceCloneModels {
		if model == supported {
			return model
		}
	}
	return DefaultVoiceCloneModel
}

// validateCloneAudioFormat rejects samples the upload endpoint cannot accept.
func validateCloneAudioFormat(filePath string) error {
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(filePath), "."))
	for _, supported := range supportedCloneAudioFormats {
		if ext == supported {
			return nil
		}
	}
	return fmt.Errorf("minimax voice clone unsupported audio format %q, supported formats: %s", ext, strings.Join(supportedCloneAudioFormats, ", "))
}

// buildVoiceID derives an acceptable voice id from prefix: it has to start with a
// letter, may only contain letters and digits here, and a random suffix keeps it
// unique because the API rejects a voice id that already exists.
func buildVoiceID(prefix string) string {
	var sanitized strings.Builder
	for _, r := range prefix {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			sanitized.WriteRune(r)
		}
	}

	id := sanitized.String()
	for id != "" && id[0] >= '0' && id[0] <= '9' {
		id = id[1:]
	}
	if id == "" {
		id = "Voice"
	}

	suffix := make([]rune, voiceCloneIDSuffixLength)
	for i := range suffix {
		suffix[i] = voiceIDAlphabet[rand.Intn(len(voiceIDAlphabet))]
	}
	return id + string(suffix)
}

type fileUploadResponse struct {
	File struct {
		FileID int64 `json:"file_id"`
	} `json:"file"`
	BaseResp struct {
		StatusCode int    `json:"status_code"`
		StatusMsg  string `json:"status_msg"`
	} `json:"base_resp"`
}

type voiceCloneRequest struct {
	FileID  int64  `json:"file_id"`
	VoiceID string `json:"voice_id"`
	Model   string `json:"model"`
}

type voiceCloneResponse struct {
	VoiceID  string `json:"voice_id"`
	BaseResp struct {
		StatusCode int    `json:"status_code"`
		StatusMsg  string `json:"status_msg"`
	} `json:"base_resp"`
}

// buildFileUploadBody assembles the multipart payload carrying the required file
// and purpose fields, and returns the matching content type.
func buildFileUploadBody(filePath, purpose string) ([]byte, string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, "", fmt.Errorf("minimax voice clone open audio file failed: %w", err)
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err = writer.WriteField("purpose", purpose); err != nil {
		return nil, "", fmt.Errorf("minimax voice clone write purpose field failed: %w", err)
	}
	part, err := writer.CreateFormFile("file", filepath.Base(filePath))
	if err != nil {
		return nil, "", fmt.Errorf("minimax voice clone create file field failed: %w", err)
	}
	if _, err = io.Copy(part, file); err != nil {
		return nil, "", fmt.Errorf("minimax voice clone copy audio file failed: %w", err)
	}
	if err = writer.Close(); err != nil {
		return nil, "", fmt.Errorf("minimax voice clone close multipart writer failed: %w", err)
	}
	return body.Bytes(), writer.FormDataContentType(), nil
}

// decodeFileUploadResponse validates the business status code and returns the uploaded file id.
func decodeFileUploadResponse(respBody []byte) (int64, error) {
	var parsed fileUploadResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return 0, fmt.Errorf("minimax voice clone decode upload response failed: %w", err)
	}
	if parsed.BaseResp.StatusCode != 0 {
		return 0, fmt.Errorf("minimax voice clone upload api error: status_code=%d, status_msg=%s", parsed.BaseResp.StatusCode, parsed.BaseResp.StatusMsg)
	}
	if parsed.File.FileID == 0 {
		return 0, fmt.Errorf("minimax voice clone upload api returned empty file id")
	}
	return parsed.File.FileID, nil
}

// buildVoiceCloneBody assembles the clone request with the required file id, voice id and model.
func buildVoiceCloneBody(fileID int64, voiceID, model string) ([]byte, error) {
	return json.Marshal(voiceCloneRequest{
		FileID:  fileID,
		VoiceID: voiceID,
		Model:   model,
	})
}

// decodeVoiceCloneResponse validates the clone result and returns the usable voice
// id, falling back to requestedVoiceID because the API may only echo the status.
func decodeVoiceCloneResponse(respBody []byte, requestedVoiceID string) (string, error) {
	var parsed voiceCloneResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("minimax voice clone decode response failed: %w", err)
	}
	if parsed.BaseResp.StatusCode != 0 {
		return "", fmt.Errorf("minimax voice clone api error: status_code=%d, status_msg=%s", parsed.BaseResp.StatusCode, parsed.BaseResp.StatusMsg)
	}
	if parsed.VoiceID != "" {
		return parsed.VoiceID, nil
	}
	if requestedVoiceID == "" {
		return "", fmt.Errorf("minimax voice clone api returned empty voice id")
	}
	return requestedVoiceID, nil
}

// post sends an authenticated request and returns the response body.
func (c *VoiceCloneClient) post(ctx context.Context, url, contentType string, body []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Authorization", "Bearer "+c.ApiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.GetLogger().Error("minimax voice clone request failed", zap.String("url", url), zap.Error(err))
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		log.GetLogger().Error("minimax voice clone non-200 status", zap.String("url", url), zap.Int("status_code", resp.StatusCode), zap.String("body", string(respBody)))
		return nil, fmt.Errorf("minimax voice clone none-200 status code: %d", resp.StatusCode)
	}
	return respBody, nil
}

// UploadAudioFile uploads a local audio sample and returns its file id. purpose
// selects how the sample is stored: PurposeVoiceClone for the cloning sample,
// PurposePromptAudio for the optional reference clip.
func (c *VoiceCloneClient) UploadAudioFile(ctx context.Context, filePath, purpose string) (int64, error) {
	if c.ApiKey == "" {
		return 0, fmt.Errorf("minimax voice clone api key is empty")
	}
	if err := validateCloneAudioFormat(filePath); err != nil {
		return 0, err
	}

	body, contentType, err := buildFileUploadBody(filePath, purpose)
	if err != nil {
		return 0, err
	}

	respBody, err := c.post(ctx, c.BaseUrl+fileUploadPath, contentType, body)
	if err != nil {
		return 0, err
	}
	return decodeFileUploadResponse(respBody)
}

// VoiceClone converts an uploaded sample into a voice id that can be synthesized.
func (c *VoiceCloneClient) VoiceClone(ctx context.Context, fileID int64, voiceID string) (string, error) {
	if c.ApiKey == "" {
		return "", fmt.Errorf("minimax voice clone api key is empty")
	}

	body, err := buildVoiceCloneBody(fileID, voiceID, c.Model)
	if err != nil {
		return "", fmt.Errorf("minimax voice clone build request failed: %w", err)
	}

	respBody, err := c.post(ctx, c.BaseUrl+voiceClonePath, "application/json", body)
	if err != nil {
		return "", err
	}
	return decodeVoiceCloneResponse(respBody, voiceID)
}

// CloneVoice uploads the local sample at audioPath and returns the cloned voice
// code, matching the signature the dubbing flow expects from a clone provider.
func (c *VoiceCloneClient) CloneVoice(voicePrefix, audioPath string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), voiceCloneTimeout)
	defer cancel()

	fileID, err := c.UploadAudioFile(ctx, audioPath, PurposeVoiceClone)
	if err != nil {
		return "", err
	}
	return c.VoiceClone(ctx, fileID, buildVoiceID(voicePrefix))
}
