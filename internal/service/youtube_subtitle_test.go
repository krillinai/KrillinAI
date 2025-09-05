package service

import (
	"context"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"os"
	"testing"
)

func Test_YoutubeSubtitle(t *testing.T) {
	// 固定的测试文件路径
	s := initService()
	deps.CheckDependency()
	config.Conf.App.MaxSentenceLength = 50

	req := &YoutubeSubtitleReq{
		TaskBasePath:   "D:/test_data/trans/vtt/",
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
	s := initService()
	deps.CheckDependency()
	config.Conf.App.MaxSentenceLength = 100

	vttFile := "D:/test_data/trans/vtt/GjickmuG0vU.en.vtt"
	words, err := s.YouTubeSubtitleSrv.ExtractWordsFromVtt(vttFile)
	if err != nil {
		t.Errorf("ExtractWordsFromVtt() error = %v, want nil", err)
	}

	//将words输出到文件
	outputFile := "D:/test_data/trans/vtt/extracted_words.txt"
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
	s := initService()
	deps.CheckDependency()
	config.Conf.App.MaxSentenceLength = 50

	req := &YoutubeSubtitleReq{
		TaskBasePath:   "D:/test_data/trans/vtt/",
		TaskId:         "HP7JOkeZ0Yg",
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
		URL:            "https://www.youtube.com/watch?v=HP7JOkeZ0Yg",
		VttFile:        "D:/test_data/trans/vtt/HP7JOkeZ0Yg.en.vtt",
	}

	_, err := s.YouTubeSubtitleSrv.processYouTubeSubtitle(context.Background(), req)
	if err != nil {
		t.Errorf("HandleYouTubeSubtitle() error = %v, want nil", err)
	}
}
