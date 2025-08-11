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

	_, err := s.YouTubeSubtitleSrv.convertToSrtFormat("/home/puji/KrillinAI/tasks/watch_vmdgIpmoF_dkxs/test.vtt", "/home/puji/KrillinAI/tasks/watch_vmdgIpmoF_dkxs/")
	if err != nil {
		t.Errorf("convertToSrtFormat() error = %v", err)
		return
	}
	subtitleFile := "/home/puji/KrillinAI/tasks/watch_vmdgIpmoF_dkxs//converted_subtitle.srt"


	// 执行测试
	err = s.YouTubeSubtitleSrv.TranslateSrtFile(context.Background(), &types.SubtitleTaskStepParam{
		TaskId:                   "kgysZPHh",
		TaskPtr:                  testTask, // 提供有效的 TaskPtr
		OriginLanguage:           "en",
		TargetLanguage:           "zh_cn",
		TaskBasePath:             "/home/puji/KrillinAI/tasks/watch_vmdgIpmoF_dkxs/",
		OriginalSubtitleFilePath: "/home/puji/KrillinAI/tasks/watch_vmdgIpmoF_dkxs/test.vtt",
	}, subtitleFile)
	if err != nil {
		t.Errorf("TranslateSrtFile() error = %v, want nil", err)
	}
}
