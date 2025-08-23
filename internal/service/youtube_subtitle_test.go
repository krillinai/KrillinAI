package service

import (
	"context"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"testing"
)

func Test_YoutubeSubtitle(t *testing.T) {
	// 固定的测试文件路径
	s := initService()

	// 创建一个测试用的 SubtitleTask
	testTask := &types.SubtitleTask{
		TaskId:         "kgysZPHh",
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
		Status:         1, // 处理中
		ProcessPct:     0,
	}
	config.Conf.App.MaxSentenceLength = 100
	vttFile := "D:/test_data/trans/vtt/test.vtt"
	_, err := s.YouTubeSubtitleSrv.convertVttToSrt(vttFile, "D:/test_data/trans/vtt/")
	if err != nil {
		t.Errorf("convertToSrtFormat() error = %v", err)
		return
	}

	taskBasePath := "D:/test_data/trans/vtt/"
	originSrt := taskBasePath + "origin.srt"
	translatedSrt := taskBasePath + "translated.srt"

	// 执行测试
	err = s.YouTubeSubtitleSrv.TranslateSrtFile(context.Background(), &types.SubtitleTaskStepParam{
		TaskId:         "kgysZPHh",
		TaskPtr:        testTask, // 提供有效的 TaskPtr
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
		TaskBasePath:   taskBasePath,
		VttFile:        vttFile,
	}, translatedSrt)
	if err != nil {
		t.Errorf("TranslateSrtFile() error = %v, want nil", err)
	}
}
