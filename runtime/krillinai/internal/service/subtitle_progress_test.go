package service

import (
	"context"
	"krillin-ai/internal/dto"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"testing"
)

func TestLegacySubtitleProgressDoesNotFinishAfterMediaPreparation(t *testing.T) {
	task := &types.SubtitleTask{TaskId: t.Name(), Status: types.SubtitleTaskStatusProcessing}
	storage.SubtitleTasks.Store(task.TaskId, task)
	t.Cleanup(func() { storage.SubtitleTasks.Delete(task.TaskId) })
	step := &types.SubtitleTaskStepParam{
		TaskPtr: task, TaskBasePath: t.TempDir(), Link: "https://www.youtube.com/watch?v=eS7qQ3WJSrw",
		VttSwitch: true, EmbedSubtitleVideoType: "none",
	}
	svc := Service{}
	if err := svc.linkToFile(context.Background(), step); err != nil {
		t.Fatal(err)
	}
	result, err := svc.GetTaskStatus(dto.GetVideoSubtitleTaskReq{TaskId: task.TaskId})
	if err != nil || result.ProcessPercent != 10 || len(result.SubtitleInfo) != 0 {
		t.Fatalf("媒体准备完成时应继续等待字幕: result=%+v, err=%v", result, err)
	}
}
