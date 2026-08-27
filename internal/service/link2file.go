package service

import (
	"context"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"strings"

	"go.uber.org/zap"
)

func (s Service) linkToFile(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var (
		err    error
		output []byte
	)
	link := stepParam.Link
	audioPath := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskAudioFileName)
	videoPath := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskVideoFileName)
	localVideoPath, isLocal := resolveLocalMediaInput(link)
	stepParam.TaskPtr.SetProgress(3)
	if isLocal {
		// 本地文件
		videoPath = localVideoPath
		cmd := exec.Command(storage.FfmpegPath, "-i", videoPath, "-vn", "-ar", "44100", "-ac", "2", "-ab", "192k", "-f", "mp3", audioPath)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.linkToFile ffmpeg error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return fmt.Errorf("generateAudioSubtitles.linkToFile ffmpeg error: %w", err)
		}
	} else if strings.Contains(link, "youtube.com") {
		var videoId string
		videoId, err = util.GetYouTubeID(link)
		if err != nil {
			log.GetLogger().Error("linkToFile.GetYouTubeID error", zap.Any("step param", stepParam), zap.Error(err))
			return fmt.Errorf("linkToFile.GetYouTubeID error: %w", err)
		}
		stepParam.Link = "https://www.youtube.com/watch?v=" + videoId
		if !stepParam.VttSwitch {
			// 使用更灵活的音频格式选择器，避免 HTTP 403 错误。
			cmdArgs := []string{
				"-f", "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/worst",
				"--extract-audio",
				"--audio-format", "mp3",
				"--audio-quality", "192K",
				"-o", audioPath,
				stepParam.Link,
			}
			if config.Conf.App.Proxy != "" {
				cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
			}
			cmdArgs = appendCookiesArgs(cmdArgs, youtubeCookiesPath)
			if storage.FfmpegPath != "ffmpeg" {
				cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
			}
			cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
			output, err = cmd.CombinedOutput()
			if err != nil {
				log.GetLogger().Error("linkToFile download audio yt-dlp error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
				return fmt.Errorf("linkToFile download audio yt-dlp error: %w: %s", err, compactCommandOutput(output))
			}
		}
	} else if strings.Contains(link, "bilibili.com") {
		videoId := util.GetBilibiliVideoId(link)
		if videoId == "" {
			return errors.New("linkToFile error: invalid link")
		}
		stepParam.Link = "https://www.bilibili.com/video/" + videoId
		cmdArgs := []string{"-f", "bestaudio[ext=m4a]", "-x", "--audio-format", "mp3", "-o", audioPath, stepParam.Link}
		if config.Conf.App.Proxy != "" {
			cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
		}
		if storage.FfmpegPath != "ffmpeg" {
			cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
		}
		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("linkToFile download audio yt-dlp error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return fmt.Errorf("linkToFile download audio yt-dlp error: %w: %s", err, compactCommandOutput(output))
		}
	} else {
		log.GetLogger().Info("linkToFile.unsupported link type", zap.Any("step param", stepParam))
		return errors.New("linkToFile error: unsupported link, only support youtube, bilibili and local file")
	}
	stepParam.TaskPtr.SetProgress(6)
	stepParam.AudioFilePath = audioPath

	if !isLocal && stepParam.EmbedSubtitleVideoType != "none" {
		// 需要下载原视频
		cmdArgs := []string{"-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]", "-o", videoPath, stepParam.Link}
		if config.Conf.App.Proxy != "" {
			cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
		}
		if storage.FfmpegPath != "ffmpeg" {
			cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
		}
		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("linkToFile download video yt-dlp error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return fmt.Errorf("linkToFile download video yt-dlp error: %w: %s", err, compactCommandOutput(output))
		}
	}
	stepParam.InputVideoPath = videoPath

	// 更新字幕任务信息
	stepParam.TaskPtr.SetProgress(10)
	return nil
}

func resolveLocalMediaInput(input string) (string, bool) {
	value := strings.TrimSpace(input)
	if strings.HasPrefix(value, "local:") {
		return strings.TrimPrefix(value, "local:"), true
	}
	info, err := os.Stat(value)
	if err != nil || !info.Mode().IsRegular() {
		return "", false
	}
	return value, true
}

func compactCommandOutput(output []byte) string {
	const maximum = 1200
	value := strings.TrimSpace(string(output))
	if len(value) <= maximum {
		return value
	}
	return value[len(value)-maximum:]
}
