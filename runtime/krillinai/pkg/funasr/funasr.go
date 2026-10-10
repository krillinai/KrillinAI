package funasr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Client struct {
	baseURL, apiKey, model string
	timeout                time.Duration
	httpClient             *http.Client
}
type response struct {
	Text     string `json:"text"`
	Language string `json:"language"`
	Segments []struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Text  string  `json:"text"`
	} `json:"segments"`
}

func NewClient(baseURL, apiKey, model string, timeoutMs int, proxy string) *Client {
	timeout := time.Duration(timeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	if proxy != "" && config.Conf.App.ParsedProxy != nil {
		tr.Proxy = http.ProxyURL(config.Conf.App.ParsedProxy)
	}
	return &Client{strings.TrimRight(baseURL, "/"), apiKey, model, timeout, &http.Client{Transport: tr, Timeout: timeout}}
}
func (c *Client) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.timeout)
	defer cancel()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	f, err := os.Open(audioFile)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	part, err := mw.CreateFormFile("file", filepath.Base(audioFile))
	if err != nil {
		return nil, err
	}
	if _, err = io.Copy(part, f); err != nil {
		return nil, err
	}
	_ = mw.WriteField("model", c.model)
	_ = mw.WriteField("response_format", "verbose_json")
	if language != "" {
		_ = mw.WriteField("language", language)
	}
	mw.Close()
	endpoint := c.baseURL + "/audio/transcriptions"
	if u, e := url.Parse(endpoint); e != nil || u.Scheme == "" {
		return nil, fmt.Errorf("invalid FunASR base URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return nil, fmt.Errorf("FunASR returned HTTP %d", resp.StatusCode)
	}
	var out response
	if err = json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("invalid FunASR response: %w", err)
	}
	if strings.TrimSpace(out.Text) == "" && len(out.Segments) == 0 {
		return nil, fmt.Errorf("FunASR response contains no transcript")
	}
	result := &types.TranscriptionData{Text: out.Text, Language: out.Language}
	for i, s := range out.Segments {
		result.Words = append(result.Words, types.Word{Num: i, Text: s.Text, Start: s.Start, End: s.End})
	}
	return result, nil
}
