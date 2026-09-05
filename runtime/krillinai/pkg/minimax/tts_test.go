package minimax

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"krillin-ai/internal/types"
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

func TestListVoicesRequestsAndParsesAllVoiceGroups(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/get_voice" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer minimax-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		var request map[string]string
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if request["voice_type"] != "all" {
			t.Fatalf("voice_type = %q", request["voice_type"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"system_voice": []map[string]string{{
				"voice_id": "system-1", "voice_name": "System Voice",
			}},
			"voice_cloning": []map[string]string{{
				"voice_id": "clone-1", "voice_name": "Cloned Voice",
			}},
			"voice_generation": []map[string]string{{
				"voice_id": "design-1", "voice_name": "Designed Voice",
			}},
		})
	}))
	defer server.Close()

	client := NewTtsClient(server.URL, "minimax-key", "speech-2.8-hd")
	voices, err := client.ListVoices(context.Background())
	if err != nil {
		t.Fatalf("ListVoices() error = %v", err)
	}
	if len(voices) != 3 {
		t.Fatalf("voices = %#v", voices)
	}
	if voices[0].Code != "system-1" || voices[0].Kind != "builtin" {
		t.Fatalf("system voice = %#v", voices[0])
	}
	if voices[1].Code != "clone-1" || voices[1].Kind != "custom" {
		t.Fatalf("cloned voice = %#v", voices[1])
	}
	if voices[2].Code != "design-1" || voices[2].Kind != "designed" {
		t.Fatalf("designed voice = %#v", voices[2])
	}
}

func TestSynthesizeSendsMiniMaxFormatAndSpeed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/t2a_v2" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer minimax-key" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		var request t2aRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if request.Model != "speech-2.8-hd" {
			t.Fatalf("model = %q", request.Model)
		}
		if request.Text != "MiniMax test" {
			t.Fatalf("text = %q", request.Text)
		}
		if request.VoiceSetting.VoiceID != "English_Graceful_Lady" {
			t.Fatalf("voice_id = %q", request.VoiceSetting.VoiceID)
		}
		if request.VoiceSetting.Speed != 1.2 {
			t.Fatalf("speed = %v", request.VoiceSetting.Speed)
		}
		if request.AudioSetting.Format != "mp3" {
			t.Fatalf("format = %q", request.AudioSetting.Format)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"audio":  hex.EncodeToString([]byte("ID3-minimax-audio")),
				"status": 2,
			},
			"base_resp": map[string]any{
				"status_code": 0,
				"status_msg":  "success",
			},
		})
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "speech.mp3")
	client := NewTtsClient(server.URL, "minimax-key", "speech-2.8-hd")
	if err := client.Synthesize(context.Background(), types.TTSSpeechOptions{
		Text:       "MiniMax test",
		Voice:      "English_Graceful_Lady",
		OutputFile: output,
		Format:     "mp3",
		Speed:      1.2,
	}); err != nil {
		t.Fatalf("Synthesize() error = %v", err)
	}
	content, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "ID3-minimax-audio" {
		t.Fatalf("audio = %q", content)
	}
}
