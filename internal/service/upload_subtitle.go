package service

import (
	"context"
	"fmt"
	"go.uber.org/zap"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
)

func (s Service) uploadSubtitles(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	subtitleInfos := make([]types.SubtitleInfo, 0)
	var err error
	for _, info := range stepParam.SubtitleInfos {
		resultPath := info.Path
		if len(stepParam.ReplaceWordsMap) > 0 { // 需要进行替换
			replacedSrcFile := util.AddSuffixToFileName(resultPath, "_replaced")
			err = util.ReplaceFileContent(resultPath, replacedSrcFile, stepParam.ReplaceWordsMap)
			if err != nil {
				log.GetLogger().Error("uploadSubtitles ReplaceFileContent err", zap.Any("stepParam", stepParam), zap.Error(err))
				return fmt.Errorf("uploadSubtitles ReplaceFileContent err: %w", err)
			}
			resultPath = replacedSrcFile
		}
		subtitleInfos = append(subtitleInfos, types.SubtitleInfo{
			TaskId:      stepParam.TaskId,
			Name:        info.Name,
			DownloadUrl: "/api/file/" + resultPath,
		})
	}
	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].SubtitleInfos = subtitleInfos
	storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusSuccess
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 100
	// 配音文件
	if stepParam.TtsResultFilePath != "" {
		storage.SubtitleTasks[stepParam.TaskId].SpeechDownloadUrl = "/api/file/" + stepParam.TtsResultFilePath
	}
	return nil
}
