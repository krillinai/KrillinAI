package funasr

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestTranscriptionNormalizesOpenAIResponse(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/transcriptions" {
			t.Errorf("path=%s", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatal(err)
		}
		if r.FormValue("model") != "sensevoice" {
			t.Errorf("model=%s", r.FormValue("model"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"text":"你好","language":"zh","segments":[{"start":0,"end":1.2,"text":"你好"}]}`))
	}))
	defer s.Close()
	f, err := os.CreateTemp("", "a.wav")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(f.Name())
	_, _ = f.WriteString("audio")
	_ = f.Close()
	c := NewClient(s.URL+"/v1", "key", "sensevoice", 1000, "")
	out, err := c.Transcription(f.Name(), "zh", "")
	if err != nil {
		t.Fatal(err)
	}
	if out.Text != "你好" || len(out.Words) != 1 || !strings.Contains(out.Words[0].Text, "你好") {
		t.Fatalf("%+v", out)
	}
}
