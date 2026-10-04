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
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"

	"go.uber.org/zap"
)

func (s Service) linkToFile(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var (
		err    error
		output []byte
	)
	link := stepParam.Link
	source, _ := url.Parse(strings.TrimSpace(link))
	sourceHost := ""
	if source != nil {
		sourceHost = strings.ToLower(source.Hostname())
	}
	audioPath := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskAudioFileName)
	videoPath := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskVideoFileName)
	localVideoPath, isLocal := resolveLocalMediaInput(link)
	stepParam.TaskPtr.SetProgress(3)
	if isLocal {
		// 本地文件
		videoPath = localVideoPath
		if stepParam.SkipAudio {
			stepParam.InputVideoPath = videoPath
			return nil
		}
		cmd := exec.Command(storage.FfmpegPath, "-i", videoPath, "-vn", "-ar", "44100", "-ac", "2", "-ab", "192k", "-f", "mp3", audioPath)
		output, err = cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.linkToFile ffmpeg error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
			return fmt.Errorf("generateAudioSubtitles.linkToFile ffmpeg error: %w", err)
		}
	} else if sourceHost == "youtu.be" || sourceHost == "youtube.com" || strings.HasSuffix(sourceHost, ".youtube.com") {
		var videoId string
		videoId, err = util.GetYouTubeID(link)
		if err != nil {
			log.GetLogger().Error("linkToFile.GetYouTubeID error", zap.Any("step param", stepParam), zap.Error(err))
			return fmt.Errorf("linkToFile.GetYouTubeID error: %w", err)
		}
		stepParam.Link = "https://www.youtube.com/watch?v=" + videoId
		if !stepParam.VttSwitch && !stepParam.SkipAudio {
			// 使用更灵活的音频格式选择器，避免 HTTP 403 错误。
			cmdArgs := []string{
				"--no-playlist",
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
			cmd := storage.YtdlpCommand(cmdArgs...)
			output, err = cmd.CombinedOutput()
			if err != nil {
				log.GetLogger().Error("linkToFile download audio yt-dlp error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
				return fmt.Errorf("linkToFile download audio yt-dlp error: %w: %s", err, compactCommandOutput(output))
			}
		}
	} else if sourceHost == "bilibili.com" || strings.HasSuffix(sourceHost, ".bilibili.com") {
		normalizedLink, normalizeErr := util.NormalizeBilibiliVideoURL(link)
		if normalizeErr != nil {
			return fmt.Errorf("linkToFile error: %w", normalizeErr)
		}
		stepParam.Link = normalizedLink
		if !stepParam.SkipAudio {
			cmdArgs := []string{"--no-playlist", "-f", "bestaudio[ext=m4a]", "-x", "--audio-format", "mp3", "-o", audioPath, stepParam.Link}
			if config.Conf.App.Proxy != "" {
				cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
			}
			if storage.FfmpegPath != "ffmpeg" {
				cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
			}
			cmd := storage.YtdlpCommand(cmdArgs...)
			output, err = cmd.CombinedOutput()
			if err != nil {
				log.GetLogger().Error("linkToFile download audio yt-dlp error", zap.Any("step param", stepParam), zap.String("output", string(output)), zap.Error(err))
				return fmt.Errorf("linkToFile download audio yt-dlp error: %w: %s", err, compactCommandOutput(output))
			}
		}
	} else if isAdditionalVideoSource(link) {
		if !stepParam.SkipAudio {
			cmdArgs := []string{"--no-playlist", "-f", "bestaudio/best", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K", "-o", audioPath, stepParam.Link}
			if config.Conf.App.Proxy != "" {
				cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
			}
			cmdArgs = appendCookiesArgs(cmdArgs, youtubeCookiesPath)
			if storage.FfmpegPath != "ffmpeg" {
				cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
			}
			output, err = storage.YtdlpCommand(cmdArgs...).CombinedOutput()
			if err != nil {
				return fmt.Errorf("linkToFile download audio yt-dlp error: %w: %s", err, compactCommandOutput(output))
			}
		}
	} else {
		log.GetLogger().Info("linkToFile.unsupported link type", zap.Any("step param", stepParam))
		return errors.New("linkToFile error: unsupported public video source")
	}
	stepParam.TaskPtr.SetProgress(6)
	if !stepParam.SkipAudio {
		stepParam.AudioFilePath = audioPath
	}

	if !isLocal && stepParam.EmbedSubtitleVideoType != "none" {
		// 需要下载原视频
		cmdArgs := []string{"--no-playlist", "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]", "-o", videoPath, stepParam.Link}
		if isAdditionalVideoSource(stepParam.Link) {
			cmdArgs = []string{"--no-playlist", "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best", "--merge-output-format", "mp4", "--recode-video", "mp4", "-o", videoPath, stepParam.Link}
		}
		cmdArgs = appendCookiesArgs(cmdArgs, youtubeCookiesPath)
		if config.Conf.App.Proxy != "" {
			cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
		}
		if storage.FfmpegPath != "ffmpeg" {
			cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
		}
		cmd := storage.YtdlpCommand(cmdArgs...)
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

func isAdditionalVideoSource(value string) bool {
	source, err := url.Parse(strings.TrimSpace(value))
	if err != nil || source.Scheme != "https" {
		return false
	}
	host := strings.ToLower(source.Hostname())
	path := source.Path
	match := func(pattern string) bool { return regexp.MustCompile(pattern).MatchString(path) }
	switch {
	case host == "x.com" || strings.HasSuffix(host, ".x.com") || host == "twitter.com" || strings.HasSuffix(host, ".twitter.com"):
		return true
	case host == "vm.tiktok.com" || host == "vt.tiktok.com" || host == "v.douyin.com" || host == "fb.watch":
		return match(`^/[\w-]+/?$`)
	case host == "tiktok.com" || strings.HasSuffix(host, ".tiktok.com"):
		return match(`^/@[^/]+/video/\d+/?$`)
	case host == "instagram.com" || host == "www.instagram.com":
		return match(`^/(?:reel|p|tv)/[\w-]+/?$`)
	case host == "douyin.com" || host == "www.douyin.com":
		return match(`^/video/\d+/?$`)
	case host == "facebook.com" || host == "www.facebook.com" || host == "m.facebook.com":
		if match(`^/watch/?$`) {
			return regexp.MustCompile(`^\d+$`).MatchString(source.Query().Get("v"))
		}
		return match(`^/(?:reel/\d+|videos/\d+|[^/]+/videos/\d+)/?$`)
	case host == "xiaohongshu.com" || host == "www.xiaohongshu.com":
		return match(`(?i)^/explore/[0-9a-f]{24}/?$`)
	case host == "pinterest.com" || host == "www.pinterest.com":
		return match(`^/pin/\d+/?$`)
	case host == "b23.tv":
		return match(`^/[\w-]+/?$`)
	default:
		return false
	}
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
