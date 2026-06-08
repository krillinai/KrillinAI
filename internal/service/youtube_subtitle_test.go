package service

import (
	"context"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/log"
	"os"
	"path/filepath"
	"testing"
)

func Test_YoutubeSubtitle(t *testing.T) {
	skipYouTubeSubtitleIntegrationTest(t)

	s := initService()
	deps.CheckDependency()
	config.Conf.App.MaxSentenceLength = 50

	req := &YoutubeSubtitleReq{
		TaskBasePath:   t.TempDir(),
		TaskId:         "CuxmTJqpc0U",
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
		URL:            "https://www.youtube.com/watch?v=CuxmTJqpc0U",
	}

	_, err := s.YouTubeSubtitleSrv.Process(context.Background(), req)
	if err != nil {
		t.Errorf("HandleYouTubeSubtitle() error = %v, want nil", err)
	}

}

func Test_ExtractWordsFromVtt(t *testing.T) {
	log.InitLogger()
	s := NewYouTubeSubtitleService()
	config.Conf.App.MaxSentenceLength = 100

	workdir := t.TempDir()
	vttFile := copyTestVtt(t, workdir, "GjickmuG0vU.en.vtt")
	words, err := s.ExtractWordsFromVtt(vttFile)
	if err != nil {
		t.Errorf("ExtractWordsFromVtt() error = %v, want nil", err)
	}
	if len(words) == 0 {
		t.Fatal("ExtractWordsFromVtt() returned no words")
	}

	//将words输出到文件
	outputFile := filepath.Join(workdir, "extracted_words.txt")
	file, err := os.Create(outputFile)
	if err != nil {
		t.Errorf("Failed to create output file: %v", err)
		return
	}
	defer file.Close()
	for _, word := range words {
		file.WriteString(word.Start + "-->" + word.End + "\n")
		file.WriteString(word.Text + "\n\n")
	}
}

func Test_processYouTubeSubtitle(t *testing.T) {
	skipYouTubeSubtitleIntegrationTest(t)

	s := initService()
	deps.CheckDependency()
	config.Conf.App.MaxSentenceLength = 50
	workdir := t.TempDir()
	vttFile := copyTestVtt(t, workdir, "1srQ7Mq_ToI.en.vtt")

	req := &YoutubeSubtitleReq{
		TaskBasePath:        workdir,
		TaskId:              "1srQ7Mq__UcQG",
		OriginLanguage:      "en",
		TargetLanguage:      "zh_cn",
		URL:                 "https://www.youtube.com/watch?v=1srQ7Mq_ToI",
		VttFile:             vttFile,
		TargetLanguageFirst: config.Conf.App.TargetLanguageFirst,
	}

	_, err := s.YouTubeSubtitleSrv.processYouTubeSubtitle(context.Background(), req)
	if err != nil {
		t.Errorf("HandleYouTubeSubtitle() error = %v, want nil", err)
	}
}

func skipYouTubeSubtitleIntegrationTest(t *testing.T) {
	t.Helper()
	if os.Getenv("KRILLIN_RUN_YOUTUBE_SUBTITLE_INTEGRATION") != "1" {
		t.Skip("set KRILLIN_RUN_YOUTUBE_SUBTITLE_INTEGRATION=1 to run YouTube subtitle integration tests")
	}
}

func copyTestVtt(t *testing.T, dir, name string) string {
	t.Helper()

	data, err := os.ReadFile("test.vtt")
	if err != nil {
		t.Fatalf("read test fixture: %v", err)
	}

	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("write test fixture: %v", err)
	}
	return path
}
