package util

import (
	"fmt"
	"io"
	"krillin-ai/config"
	"krillin-ai/log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"go.uber.org/zap"
)

// 用于显示下载进度，实现io.Writer
type progressWriter struct {
	Total      uint64
	Downloaded uint64
	StartTime  time.Time
}

func (pw *progressWriter) Write(p []byte) (int, error) {
	n := len(p)
	pw.Downloaded += uint64(n)

	// 初始化开始时间
	if pw.StartTime.IsZero() {
		pw.StartTime = time.Now()
	}

	percent := float64(pw.Downloaded) / float64(pw.Total) * 100
	elapsed := time.Since(pw.StartTime).Seconds()
	speed := float64(pw.Downloaded) / 1024 / 1024 / elapsed

	fmt.Printf("\r下载进度: %.2f%% (%.2f MB / %.2f MB) | 速度: %.2f MB/s",
		percent,
		float64(pw.Downloaded)/1024/1024,
		float64(pw.Total)/1024/1024,
		speed)

	return n, nil
}

// DownloadFile 下载文件并保存到指定路径，支持代理
func DownloadFile(urlStr, filepath, proxyAddr string) error {
	log.GetLogger().Info("开始下载文件", zap.String("url", urlStr))
	client := &http.Client{}
	if proxyAddr != "" {
		client.Transport = &http.Transport{
			Proxy: http.ProxyURL(config.Conf.App.ParsedProxy),
		}
	}

	resp, err := client.Get(urlStr)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	size := resp.ContentLength
	fmt.Printf("文件大小: %.2f MB\n", float64(size)/1024/1024)

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	// 带有进度的 Reader
	progress := &progressWriter{
		Total: uint64(size),
	}
	reader := io.TeeReader(resp.Body, progress)

	_, err = io.Copy(out, reader)
	if err != nil {
		return err
	}
	fmt.Printf("\n") // 进度信息结束，换新行

	log.GetLogger().Info("文件下载完成", zap.String("路径", filepath))
	return nil
}

// DownloadVideo 使用yt-dlp下载指定清晰度的视频
func DownloadVideo(videoURL, quality, outputPath string) error {
	log.GetLogger().Info("开始下载视频", zap.String("url", videoURL), zap.String("quality", quality))

	// 提取视频ID
	videoID := strings.Split(videoURL, "v=")[1]

	// 调用 GetBestFormat 获取最佳格式
	format, err := GetBestFormat(videoID, "1280", "720")
	if err != nil {
		log.GetLogger().Error("获取最佳格式失败", zap.Error(err))
		return err
	}

	log.GetLogger().Info("获取到的格式", zap.String("format", format))

	// 构建yt-dlp下载命令
	downloadCmd := exec.Command("yt-dlp", "-f", format, "-o", outputPath, videoURL, "--proxy", "http://127.0.0.1:7897")
	downloadCmd.Stdout = os.Stdout
	downloadCmd.Stderr = os.Stderr

	// 执行下载命令
	if err := downloadCmd.Run(); err != nil {
		log.GetLogger().Error("视频下载失败", zap.Error(err))
		return err
	}

	log.GetLogger().Info("视频下载完成", zap.String("路径", outputPath))
	return nil
}

// GetBestFormat 获取最佳格式的组合（视频+音频）
func GetBestFormat(videoID, length, height string) (string, error) {
	log.GetLogger().Info("获取最佳格式", zap.String("videoID", videoID))

	// 构建 yt-dlp 命令
	cmdArgs := []string{"-F", fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)}
	// if config.Conf.App.Proxy != "" {
	// 	cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
	// }
	cmdArgs = append(cmdArgs, "--proxy", "http://127.0.0.1:7897")
	cmd := exec.Command("yt-dlp", cmdArgs...)

	// 执行命令并获取输出
	output, err := cmd.Output()
	if err != nil {
		log.GetLogger().Error("无法获取视频格式信息", zap.Error(err))
		return "", err
	}

	formats := string(output)
	log.GetLogger().Info("视频格式信息", zap.String("formats", formats))

	var videoFormat, audioFormat, enAudioFormat string
	lines := strings.Split(formats, "\n")
	for _, line := range lines {
		if strings.Contains(line, length) || strings.Contains(line, height) {
			if strings.Contains(line, "mp4") && strings.Contains(line, "avc1") {
				fields := strings.Fields(line)
				if len(fields) > 0 {
					videoFormat = fields[0]
				}
			}
		}
		if strings.Contains(line, "audio only") && strings.Contains(line, "m4a") {
			fields := strings.Fields(line)
			if len(fields) > 0 {
				audioFormat = fields[0]
				if strings.Contains(line, "en") {
					enAudioFormat = fields[0]
				}
			}
		}
	}

	if enAudioFormat != "" {
		audioFormat = enAudioFormat
	}

	if videoFormat != "" && audioFormat != "" {
		return fmt.Sprintf("%s+%s", videoFormat, audioFormat), nil
	}

	return "best[height<=720]+bestaudio[ext=m4a]", nil
}
