package service

import (
	"context"
	"errors"
	"fmt"
	"go.uber.org/zap"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os/exec"
	"strings"
)

func (s Service) linkToAudioFile(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var (
		err    error
		output []byte
	)
	link := stepParam.Link
	audioPath := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskAudioFileName)
	if strings.Contains(link, "local:") {
		// 本地文件
		videoPath := strings.ReplaceAll(link, "local:", "")
		stepParam.InputVideoPath = videoPath
		cmd := exec.Command(storage.FfmpegPath, "-i", videoPath, "-vn", "-ar", "44100", "-ac", "2", "-ab", "192k", "-f", "mp3", audioPath)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.Step1LinkToAudio ffmpeg err", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return err
		}
	} else if strings.Contains(link, "youtube.com") {
		var videoId string
		videoId, err = util.GetYouTubeID(link)
		if err != nil {
			log.GetLogger().Error("linkToAudioFile.GetYouTubeID err", zap.Any("step param", stepParam), zap.Error(err))
			return err
		}
		stepParam.Link = "https://www.youtube.com/watch?v=" + videoId
		cmdArgs := []string{"-f", "bestaudio", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K", "-o", audioPath, stepParam.Link}

		cmdArgs = append(cmdArgs, "--cookies", "./cookies.txt")
		if storage.FfmpegPath != "ffmpeg" {
			cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
		}
		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.Step2DownloadAudio yt-dlp err", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return err
		}
	} else if strings.Contains(link, "bilibili.com") {
		videoId := util.GetBilibiliVideoId(link)
		if videoId == "" {
			return errors.New("invalid link")
		}
		stepParam.Link = "https://www.bilibili.com/video/" + videoId
		cmdArgs := []string{"-f", "bestaudio[ext=m4a]", "-x", "--audio-format", "mp3", "-o", audioPath, stepParam.Link}
		if storage.FfmpegPath != "ffmpeg" {
			cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
		}
		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.Step2DownloadAudio yt-dlp err", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return err
		}
	} else {
		log.GetLogger().Info("linkToAudioFile.unsupported link type", zap.Any("step param", stepParam))
		return errors.New("invalid link")
	}
	stepParam.AudioFilePath = audioPath
	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 6
	return nil
}
