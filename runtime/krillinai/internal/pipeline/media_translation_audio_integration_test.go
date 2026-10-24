package pipeline

import (
	"context"
	"encoding/json"
	"krillin-ai/config"
	"krillin-ai/internal/service"
	"krillin-ai/internal/storage"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Real audio preparation, HTTP ASR protocol, translation and SRT export. The
// controlled ASR response verifies plumbing, not speech recognition accuracy.
func TestMediaAudioPipelineWithWordTimesAndResume(t *testing.T) {
	ffmpeg, probe := os.Getenv("KRILLIN_TEST_FFMPEG"), os.Getenv("KRILLIN_TEST_FFPROBE")
	if ffmpeg == "" || probe == "" {
		t.Skip("set FFmpeg/FFprobe paths for audio integration")
	}
	log.InitLogger()
	previous, previousFFmpeg, previousProbe := config.Conf, storage.FfmpegPath, storage.FfprobePath
	t.Cleanup(func() {
		config.Conf = previous
		storage.FfmpegPath = previousFFmpeg
		storage.FfprobePath = previousProbe
	})
	storage.FfmpegPath, storage.FfprobePath = ffmpeg, probe
	var asrCalls, contentCalls atomic.Int32
	var revisionCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/audio/transcriptions") {
			asrCalls.Add(1)
			if err := r.ParseMultipartForm(8 << 20); err != nil {
				t.Error(err)
				http.Error(w, "bad multipart", 400)
				return
			}
			defer r.MultipartForm.RemoveAll()
			_, _ = w.Write([]byte(`{"text":"Hello world.","language":"en","duration":2,"words":[{"word":"Hello","start":0.1,"end":0.8},{"word":"world.","start":1,"end":1.8}]}`))
			return
		}
		var body struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Messages) < 2 {
			t.Error("invalid model request")
			http.Error(w, "bad model request", 400)
			return
		}
		prompt := body.Messages[len(body.Messages)-1].Content
		response := `{"summary":"问候","terms":[]}`
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			contentCalls.Add(1)
			response = `{"sentences":[{"sentence_id":"1","text":"你好，世界。"}]}`
		} else if strings.HasPrefix(prompt, "任务：translation_revision\n") {
			revisionCalls.Add(1)
			response = `{"corrections":[]}`
		} else if !strings.HasPrefix(prompt, "任务：translation_context\n") {
			t.Errorf("unexpected audio translation phase: %s", strings.Split(prompt, "\n")[0])
			http.Error(w, "unexpected phase", 400)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": response}}}})
	}))
	defer server.Close()
	config.Conf = config.Config{}
	config.Conf.App.SegmentDuration = 1
	config.Conf.App.MaxSentenceLength = 50
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.TranscribeParallelNum = 1
	config.Conf.Transcribe.Provider = "openai"
	config.Conf.Transcribe.Openai.BaseUrl, config.Conf.Transcribe.Openai.ApiKey = server.URL+"/v1", "fixture"
	config.Conf.Llm.BaseUrl, config.Conf.Llm.ApiKey, config.Conf.Llm.Model = server.URL+"/v1", "fixture", "audio-contract"
	directory := t.TempDir()
	audio := filepath.Join(directory, "audio.wav")
	if output, err := exec.Command(ffmpeg, "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", audio).CombinedOutput(); err != nil {
		t.Fatalf("audio fixture: %v %s", err, output)
	}
	request := SubtitleRequest{TaskID: "audio-contract", Workdir: filepath.Join(directory, "work"), Input: "local:" + audio, OriginLang: "en", TargetLang: "zh_cn", CaptionSource: CaptionSourceWhisper, BilingualTop: true}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for range 2 {
		response, err := GenerateSubtitles(ctx, NewServiceAdapter(service.NewService()), request)
		if err != nil || !response.OK {
			t.Fatalf("response=%+v err=%v", response, err)
		}
		blocks, err := util.ParseSrtFile(response.Outputs.TargetSRT)
		if err != nil || len(blocks) != 1 || blocks[0].OriginLanguageSentence != "你好，世界。" || len(response.TranslationFailures) > 0 {
			t.Fatalf("audio export=%+v response=%+v err=%v", blocks, response, err)
		}
	}
	if contentCalls.Load() != 1 || asrCalls.Load() != 1 {
		t.Fatalf("resume repeated successful work: asr=%d translation=%d", asrCalls.Load(), contentCalls.Load())
	}
	if revisionCalls.Load() != 1 {
		t.Fatalf("default content revision was skipped or repeated: %d", revisionCalls.Load())
	}
}
