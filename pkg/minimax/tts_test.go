package minimax

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestNewTtsClientDefaults(t *testing.T) {
	c := NewTtsClient("", "key", "")
	if c.BaseUrl != DefaultBaseUrl {
		t.Fatalf("BaseUrl = %q, want %q", c.BaseUrl, DefaultBaseUrl)
	}
	if c.Model != DefaultModel {
		t.Fatalf("Model = %q, want %q", c.Model, DefaultModel)
	}
}

func TestNewTtsClientTrimsTrailingSlash(t *testing.T) {
	c := NewTtsClient("https://api.minimaxi.com/", "key", "speech-2.6-hd")
	if c.BaseUrl != "https://api.minimaxi.com" {
		t.Fatalf("BaseUrl = %q, want trailing slash trimmed", c.BaseUrl)
	}
	if c.Model != "speech-2.6-hd" {
		t.Fatalf("Model = %q, want speech-2.6-hd", c.Model)
	}
}

func TestBuildRequestBody(t *testing.T) {
	c := NewTtsClient("", "key", "")
	body, err := c.buildRequestBody("hello world", "")
	if err != nil {
		t.Fatalf("buildRequestBody() error = %v", err)
	}

	var req t2aRequest
	if err := json.Unmarshal(body, &req); err != nil {
		t.Fatalf("unmarshal request body failed: %v", err)
	}
	if req.Model != DefaultModel {
		t.Fatalf("model = %q, want %q", req.Model, DefaultModel)
	}
	if req.Text != "hello world" {
		t.Fatalf("text = %q, want hello world", req.Text)
	}
	if req.Stream {
		t.Fatal("stream = true, want false for file output")
	}
	if req.VoiceSetting.VoiceID != DefaultVoice {
		t.Fatalf("voice_id = %q, want default %q", req.VoiceSetting.VoiceID, DefaultVoice)
	}
	if req.AudioSetting.Format != "wav" {
		t.Fatalf("audio format = %q, want wav", req.AudioSetting.Format)
	}
}

func TestBuildRequestBodyCustomVoice(t *testing.T) {
	c := NewTtsClient("", "key", "")
	body, err := c.buildRequestBody("hi", "  English_radiant_girl  ")
	if err != nil {
		t.Fatalf("buildRequestBody() error = %v", err)
	}
	var req t2aRequest
	if err := json.Unmarshal(body, &req); err != nil {
		t.Fatalf("unmarshal request body failed: %v", err)
	}
	if req.VoiceSetting.VoiceID != "English_radiant_girl" {
		t.Fatalf("voice_id = %q, want trimmed English_radiant_girl", req.VoiceSetting.VoiceID)
	}
}

func TestDecodeAudioSuccess(t *testing.T) {
	// "ID3" 头的 hex 表示
	want := []byte("ID3test")
	hexAudio := hex.EncodeToString(want)
	resp := []byte(`{"data":{"audio":"` + hexAudio + `","status":2},"base_resp":{"status_code":0,"status_msg":"success"}}`)

	got, err := decodeAudio(resp)
	if err != nil {
		t.Fatalf("decodeAudio() error = %v", err)
	}
	if string(got) != string(want) {
		t.Fatalf("decoded audio = %q, want %q", got, want)
	}
}

func TestDecodeAudioApiError(t *testing.T) {
	resp := []byte(`{"data":{"audio":"","status":0},"base_resp":{"status_code":2013,"status_msg":"invalid params"}}`)
	if _, err := decodeAudio(resp); err == nil {
		t.Fatal("decodeAudio() error = nil, want api error")
	}
}

func TestDecodeAudioEmpty(t *testing.T) {
	resp := []byte(`{"data":{"audio":"","status":2},"base_resp":{"status_code":0,"status_msg":"success"}}`)
	if _, err := decodeAudio(resp); err == nil {
		t.Fatal("decodeAudio() error = nil, want empty audio error")
	}
}

func TestText2SpeechRequiresApiKey(t *testing.T) {
	c := NewTtsClient("", "", "")
	out := filepath.Join(t.TempDir(), "out.wav")
	if err := c.Text2Speech("hello", "", out); err == nil {
		t.Fatal("Text2Speech() error = nil, want missing api key error")
	}
	if _, err := os.Stat(out); err == nil {
		t.Fatal("output file written despite missing api key")
	}
}
