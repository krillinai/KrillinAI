package minimax

import (
	"bytes"
	"context"
	"encoding/json"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"krillin-ai/log"

	"go.uber.org/zap"
)

func TestMain(m *testing.M) {
	// The package logs through the global logger, which is only initialised by the binaries.
	log.Logger = zap.NewNop()
	os.Exit(m.Run())
}

func TestNewVoiceCloneClientDefaults(t *testing.T) {
	client := NewVoiceCloneClient("", "key", "")
	if client.BaseUrl != DefaultBaseUrl {
		t.Fatalf("BaseUrl = %q, want %q", client.BaseUrl, DefaultBaseUrl)
	}
	if client.Model != DefaultVoiceCloneModel {
		t.Fatalf("Model = %q, want %q", client.Model, DefaultVoiceCloneModel)
	}
}

func TestNewVoiceCloneClientTrimsTrailingSlash(t *testing.T) {
	client := NewVoiceCloneClient(" https://example.com/ ", "key", "speech-2.6-hd")
	if client.BaseUrl != "https://example.com" {
		t.Fatalf("BaseUrl = %q, want %q", client.BaseUrl, "https://example.com")
	}
	if client.Model != "speech-2.6-hd" {
		t.Fatalf("Model = %q, want %q", client.Model, "speech-2.6-hd")
	}
}

func TestResolveVoiceCloneModelKeepsSupportedModel(t *testing.T) {
	for _, model := range supportedVoiceCloneModels {
		if got := resolveVoiceCloneModel(model); got != model {
			t.Fatalf("resolveVoiceCloneModel(%q) = %q, want %q", model, got, model)
		}
	}
}

func TestResolveVoiceCloneModelFallsBackForUnsupportedModel(t *testing.T) {
	if got := resolveVoiceCloneModel("speech-2.8-turbo"); got != DefaultVoiceCloneModel {
		t.Fatalf("resolveVoiceCloneModel() = %q, want %q", got, DefaultVoiceCloneModel)
	}
}

func TestValidateCloneAudioFormat(t *testing.T) {
	for _, name := range []string{"sample.mp3", "sample.M4A", "sample.wav"} {
		if err := validateCloneAudioFormat(name); err != nil {
			t.Fatalf("validateCloneAudioFormat(%q) error = %v, want nil", name, err)
		}
	}
	if err := validateCloneAudioFormat("sample.flac"); err == nil {
		t.Fatal("validateCloneAudioFormat() error = nil, want error for unsupported format")
	}
}

func TestBuildVoiceIDMeetsApiRules(t *testing.T) {
	got := buildVoiceID("krillinai")
	if len(got) < 8 {
		t.Fatalf("buildVoiceID() = %q, want at least 8 characters", got)
	}
	if !strings.HasPrefix(got, "krillinai") {
		t.Fatalf("buildVoiceID() = %q, want the prefix to be kept", got)
	}
	first := rune(got[0])
	if !(first >= 'a' && first <= 'z') && !(first >= 'A' && first <= 'Z') {
		t.Fatalf("buildVoiceID() = %q, want it to start with a letter", got)
	}
	if got == buildVoiceID("krillinai") {
		t.Fatalf("buildVoiceID() = %q, want a unique id per call", got)
	}
}

func TestBuildVoiceIDSanitizesPrefix(t *testing.T) {
	got := buildVoiceID("9 krillin-ai!")
	if !strings.HasPrefix(got, "krillinai") {
		t.Fatalf("buildVoiceID() = %q, want sanitized prefix %q", got, "krillinai")
	}
}

func TestBuildVoiceIDFallsBackOnEmptyPrefix(t *testing.T) {
	if got := buildVoiceID("123"); !strings.HasPrefix(got, "Voice") {
		t.Fatalf("buildVoiceID() = %q, want the fallback prefix", got)
	}
}

func TestBuildFileUploadBodyCarriesFileAndPurpose(t *testing.T) {
	audioPath := filepath.Join(t.TempDir(), "sample.wav")
	if err := os.WriteFile(audioPath, []byte("audio-bytes"), 0644); err != nil {
		t.Fatalf("write sample audio failed: %v", err)
	}

	body, contentType, err := buildFileUploadBody(audioPath, PurposeVoiceClone)
	if err != nil {
		t.Fatalf("buildFileUploadBody() error = %v, want nil", err)
	}

	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatalf("ParseMediaType() error = %v, want nil", err)
	}
	if mediaType != "multipart/form-data" {
		t.Fatalf("mediaType = %q, want %q", mediaType, "multipart/form-data")
	}

	reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	form, err := reader.ReadForm(1 << 20)
	if err != nil {
		t.Fatalf("ReadForm() error = %v, want nil", err)
	}
	if got := form.Value["purpose"]; len(got) != 1 || got[0] != PurposeVoiceClone {
		t.Fatalf("purpose = %v, want %q", got, PurposeVoiceClone)
	}
	files := form.File["file"]
	if len(files) != 1 {
		t.Fatalf("file parts = %d, want 1", len(files))
	}
	if files[0].Filename != "sample.wav" {
		t.Fatalf("filename = %q, want %q", files[0].Filename, "sample.wav")
	}
}

func TestBuildFileUploadBodyMissingFile(t *testing.T) {
	_, _, err := buildFileUploadBody(filepath.Join(t.TempDir(), "missing.wav"), PurposeVoiceClone)
	if err == nil {
		t.Fatal("buildFileUploadBody() error = nil, want error for a missing file")
	}
}

func TestDecodeFileUploadResponseSuccess(t *testing.T) {
	got, err := decodeFileUploadResponse([]byte(`{"file":{"file_id":123456789012345680},"base_resp":{"status_code":0,"status_msg":"success"}}`))
	if err != nil {
		t.Fatalf("decodeFileUploadResponse() error = %v, want nil", err)
	}
	if got != 123456789012345680 {
		t.Fatalf("decodeFileUploadResponse() = %d, want %d", got, int64(123456789012345680))
	}
}

func TestDecodeFileUploadResponseApiError(t *testing.T) {
	_, err := decodeFileUploadResponse([]byte(`{"base_resp":{"status_code":1004,"status_msg":"auth failed"}}`))
	if err == nil {
		t.Fatal("decodeFileUploadResponse() error = nil, want api error")
	}
	if !strings.Contains(err.Error(), "1004") {
		t.Fatalf("decodeFileUploadResponse() error = %q, want it to carry the status code", err)
	}
}

func TestDecodeFileUploadResponseEmptyFileID(t *testing.T) {
	if _, err := decodeFileUploadResponse([]byte(`{"base_resp":{"status_code":0}}`)); err == nil {
		t.Fatal("decodeFileUploadResponse() error = nil, want error for an empty file id")
	}
}

func TestBuildVoiceCloneBodyCarriesRequiredFields(t *testing.T) {
	body, err := buildVoiceCloneBody(99, "krillinaiAbc12345", "speech-2.6-hd")
	if err != nil {
		t.Fatalf("buildVoiceCloneBody() error = %v, want nil", err)
	}

	var parsed map[string]any
	if err = json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("Unmarshal() error = %v, want nil", err)
	}
	for _, field := range []string{"file_id", "voice_id", "model"} {
		if _, ok := parsed[field]; !ok {
			t.Fatalf("request body is missing the required field %q", field)
		}
	}
	if parsed["voice_id"] != "krillinaiAbc12345" {
		t.Fatalf("voice_id = %v, want %q", parsed["voice_id"], "krillinaiAbc12345")
	}
	if parsed["model"] != "speech-2.6-hd" {
		t.Fatalf("model = %v, want %q", parsed["model"], "speech-2.6-hd")
	}
}

func TestDecodeVoiceCloneResponseFallsBackToRequestedVoiceID(t *testing.T) {
	got, err := decodeVoiceCloneResponse([]byte(`{"base_resp":{"status_code":0}}`), "krillinaiAbc12345")
	if err != nil {
		t.Fatalf("decodeVoiceCloneResponse() error = %v, want nil", err)
	}
	if got != "krillinaiAbc12345" {
		t.Fatalf("decodeVoiceCloneResponse() = %q, want %q", got, "krillinaiAbc12345")
	}
}

func TestDecodeVoiceCloneResponsePrefersResponseVoiceID(t *testing.T) {
	got, err := decodeVoiceCloneResponse([]byte(`{"voice_id":"returned-id","base_resp":{"status_code":0}}`), "krillinaiAbc12345")
	if err != nil {
		t.Fatalf("decodeVoiceCloneResponse() error = %v, want nil", err)
	}
	if got != "returned-id" {
		t.Fatalf("decodeVoiceCloneResponse() = %q, want %q", got, "returned-id")
	}
}

func TestDecodeVoiceCloneResponseApiError(t *testing.T) {
	_, err := decodeVoiceCloneResponse([]byte(`{"base_resp":{"status_code":2038,"status_msg":"no cloning permission"}}`), "krillinaiAbc12345")
	if err == nil {
		t.Fatal("decodeVoiceCloneResponse() error = nil, want api error")
	}
	if !strings.Contains(err.Error(), "2038") {
		t.Fatalf("decodeVoiceCloneResponse() error = %q, want it to carry the status code", err)
	}
}

func TestUploadAudioFileRequiresApiKey(t *testing.T) {
	if _, err := NewVoiceCloneClient("", "", "").UploadAudioFile(context.Background(), "sample.wav", PurposeVoiceClone); err == nil {
		t.Fatal("UploadAudioFile() error = nil, want error for an empty api key")
	}
}

func TestVoiceCloneRequiresApiKey(t *testing.T) {
	if _, err := NewVoiceCloneClient("", "", "").VoiceClone(context.Background(), 1, "krillinaiAbc12345"); err == nil {
		t.Fatal("VoiceClone() error = nil, want error for an empty api key")
	}
}

func TestCloneVoiceUploadsSampleThenClones(t *testing.T) {
	audioPath := filepath.Join(t.TempDir(), "sample.wav")
	if err := os.WriteFile(audioPath, []byte("audio-bytes"), 0644); err != nil {
		t.Fatalf("write sample audio failed: %v", err)
	}

	var gotPaths []string
	var gotAuth []string
	var gotPurpose string
	var gotCloneBody map[string]any

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPaths = append(gotPaths, r.URL.Path)
		gotAuth = append(gotAuth, r.Header.Get("Authorization"))

		switch r.URL.Path {
		case fileUploadPath:
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Errorf("ParseMultipartForm() error = %v, want nil", err)
			}
			gotPurpose = r.FormValue("purpose")
			if _, _, err := r.FormFile("file"); err != nil {
				t.Errorf("FormFile() error = %v, want nil", err)
			}
			w.Write([]byte(`{"file":{"file_id":4242},"base_resp":{"status_code":0}}`))
		case voiceClonePath:
			if err := json.NewDecoder(r.Body).Decode(&gotCloneBody); err != nil {
				t.Errorf("Decode() error = %v, want nil", err)
			}
			w.Write([]byte(`{"base_resp":{"status_code":0}}`))
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
		}
	}))
	defer server.Close()

	client := NewVoiceCloneClient(server.URL, "test-key", "speech-02-hd")
	got, err := client.CloneVoice("krillinai", audioPath)
	if err != nil {
		t.Fatalf("CloneVoice() error = %v, want nil", err)
	}
	if !strings.HasPrefix(got, "krillinai") {
		t.Fatalf("CloneVoice() = %q, want a voice id built from the prefix", got)
	}

	if len(gotPaths) != 2 || gotPaths[0] != fileUploadPath || gotPaths[1] != voiceClonePath {
		t.Fatalf("request paths = %v, want upload then clone", gotPaths)
	}
	for _, auth := range gotAuth {
		if auth != "Bearer test-key" {
			t.Fatalf("Authorization = %q, want %q", auth, "Bearer test-key")
		}
	}
	if gotPurpose != PurposeVoiceClone {
		t.Fatalf("purpose = %q, want %q", gotPurpose, PurposeVoiceClone)
	}
	if gotCloneBody["file_id"] != float64(4242) {
		t.Fatalf("file_id = %v, want 4242", gotCloneBody["file_id"])
	}
	if gotCloneBody["model"] != "speech-02-hd" {
		t.Fatalf("model = %v, want %q", gotCloneBody["model"], "speech-02-hd")
	}
	if gotCloneBody["voice_id"] != got {
		t.Fatalf("voice_id = %v, want %q", gotCloneBody["voice_id"], got)
	}
}

func TestCloneVoiceRejectsUnsupportedFormat(t *testing.T) {
	audioPath := filepath.Join(t.TempDir(), "sample.flac")
	if err := os.WriteFile(audioPath, []byte("audio-bytes"), 0644); err != nil {
		t.Fatalf("write sample audio failed: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unexpected request to %q for an unsupported format", r.URL.Path)
	}))
	defer server.Close()

	if _, err := NewVoiceCloneClient(server.URL, "test-key", "").CloneVoice("krillinai", audioPath); err == nil {
		t.Fatal("CloneVoice() error = nil, want error for an unsupported format")
	}
}

func TestCloneVoiceSurfacesApiError(t *testing.T) {
	audioPath := filepath.Join(t.TempDir(), "sample.mp3")
	if err := os.WriteFile(audioPath, []byte("audio-bytes"), 0644); err != nil {
		t.Fatalf("write sample audio failed: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"base_resp":{"status_code":1004,"status_msg":"auth failed"}}`))
	}))
	defer server.Close()

	_, err := NewVoiceCloneClient(server.URL, "test-key", "").CloneVoice("krillinai", audioPath)
	if err == nil {
		t.Fatal("CloneVoice() error = nil, want api error")
	}
	if !strings.Contains(err.Error(), "1004") {
		t.Fatalf("CloneVoice() error = %q, want it to carry the status code", err)
	}
}
