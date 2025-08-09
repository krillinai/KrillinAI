package service

import (
	"context"
	"krillin-ai/internal/types"
	"testing"
)

func Test_YoutubeSubtitle(t *testing.T) {
	// 固定的测试文件路径
	subtitleFile := "/home/puji/KrillinAI/tasks/watch_vfLoHojLh_685Z/converted_subtitle.srt"
	s := initService()

	// 创建一个测试用的 SubtitleTask
	testTask := &types.SubtitleTask{
		TaskId:         "kgysZPHh",
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
		Status:         1, // 处理中
		ProcessPct:     0,
	}

	// 执行测试
	err := s.TranslateSrtFile(context.Background(), &types.SubtitleTaskStepParam{
		TaskId:         "kgysZPHh",
		TaskPtr:        testTask, // 提供有效的 TaskPtr
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
	}, subtitleFile)
	if err != nil {
		t.Errorf("TranslateSrtFile() error = %v, want nil", err)
	}
}