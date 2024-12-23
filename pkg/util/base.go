package util

import (
	"archive/zip"
	"fmt"
	"go.uber.org/zap"
	"io"
	"krillin-ai/config"
	"krillin-ai/internal/storage"
	"krillin-ai/log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

var strWithUpperLowerNum = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789")

func GenerateRandStringWithUpperLowerNum(n int) string {
	b := make([]rune, n)
	for i := range b {
		b[i] = strWithUpperLowerNum[rand.Intn(len(strWithUpperLowerNum))]
	}
	return string(b)
}

func GetYouTubeID(youtubeURL string) (string, error) {
	parsedURL, err := url.Parse(youtubeURL)
	if err != nil {
		return "", err
	}

	if strings.Contains(parsedURL.Path, "watch") {
		queryParams := parsedURL.Query()
		if id, exists := queryParams["v"]; exists {
			return id[0], nil
		}
	} else {
		pathSegments := strings.Split(parsedURL.Path, "/")
		return pathSegments[len(pathSegments)-1], nil
	}

	return "", fmt.Errorf("no video ID found")
}

func GetBilibiliVideoId(url string) string {
	re := regexp.MustCompile(`https://(?:www\.)?bilibili\.com/(?:video/|video/av\d+/)(BV[a-zA-Z0-9]+)`)
	matches := re.FindStringSubmatch(url)
	if len(matches) > 1 {
		// 返回匹配到的BV号
		return matches[1]
	}
	return ""
}

// 将浮点数秒数转换为HH:MM:SS,SSS格式的字符串
func FormatTime(seconds float32) string {
	totalSeconds := int(math.Floor(float64(seconds)))             // 获取总秒数
	milliseconds := int((seconds - float32(totalSeconds)) * 1000) // 获取毫秒部分

	hours := totalSeconds / 3600
	minutes := (totalSeconds % 3600) / 60
	secs := totalSeconds % 60
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, secs, milliseconds)
}

// 判断字符串是否是纯数字（字幕编号）
func IsNumber(s string) bool {
	_, err := strconv.Atoi(s)
	return err == nil
}

// DownloadFile 下载文件并保存到指定路径，支持代理
func DownloadFile(urlStr, filepath, proxyAddr string) error {
	proxyURL, err := url.Parse(proxyAddr)
	if err != nil {
		return err
	}

	client := &http.Client{}

	if proxyURL != nil {
		client.Transport = &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
		}
	}

	resp, err := client.Get(urlStr)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func Unzip(zipFile, destDir string) error {
	zipReader, err := zip.OpenReader(zipFile)
	if err != nil {
		return fmt.Errorf("打开zip文件失败: %v", err)
	}
	defer zipReader.Close()

	err = os.MkdirAll(destDir, 0755)
	if err != nil {
		return fmt.Errorf("创建目标目录失败: %v", err)
	}

	for _, file := range zipReader.File {
		filePath := filepath.Join(destDir, file.Name)

		if file.FileInfo().IsDir() {
			err := os.MkdirAll(filePath, file.Mode())
			if err != nil {
				return fmt.Errorf("创建目录失败: %v", err)
			}
			continue
		}

		destFile, err := os.Create(filePath)
		if err != nil {
			return fmt.Errorf("创建文件失败: %v", err)
		}
		defer destFile.Close()

		zipFileReader, err := file.Open()
		if err != nil {
			return fmt.Errorf("打开zip文件内容失败: %v", err)
		}
		defer zipFileReader.Close()

		_, err = io.Copy(destFile, zipFileReader)
		if err != nil {
			return fmt.Errorf("复制文件内容失败: %v", err)
		}
	}

	return nil
}

// CheckAndDownloadFfmpeg 检测并安装ffmpeg
func CheckAndDownloadFfmpeg() error {
	// 检查ffmpeg是否已经安装
	_, err := exec.LookPath("ffmpeg")
	if err == nil {
		log.GetLogger().Info("已找到ffmpeg")
		storage.FfmpegPath = "ffmpeg"
		return nil
	}
	log.GetLogger().Info("没有找到ffmpeg，即将开始自动安装")
	// 确保./bin目录存在
	err = os.MkdirAll("./bin", 0755)
	if err != nil {
		log.GetLogger().Error("创建./bin目录失败", zap.Error(err))
		return err
	}

	var ffmpegURL string
	if runtime.GOOS == "linux" {
		ffmpegURL = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-linux-64.zip"
	} else if runtime.GOOS == "darwin" {
		ffmpegURL = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-macos-64.zip"
	} else if runtime.GOOS == "windows" {
		ffmpegURL = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffmpeg-6.1-win-64.zip"
	} else {
		log.GetLogger().Error("不支持你当前的操作系统", zap.String("当前系统", runtime.GOOS))
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	// 下载
	ffmpegDownloadPath := "./bin/ffmpeg.zip"
	err = DownloadFile(ffmpegURL, ffmpegDownloadPath, config.Conf.App.Proxy)
	if err != nil {
		log.GetLogger().Error("下载ffmpeg失败", zap.Error(err))
		return err
	}
	err = Unzip(ffmpegDownloadPath, "./bin")
	if err != nil {
		log.GetLogger().Error("解压ffmpeg失败", zap.Error(err))
		return err
	}
	log.GetLogger().Info("ffmpeg解压成功")

	ffmpegPathLocal := "./bin/ffmpeg"
	if runtime.GOOS != "windows" {
		err = os.Chmod(ffmpegPathLocal, 0755)
		if err != nil {
			log.GetLogger().Error("设置文件权限失败", zap.Error(err))
			return err
		}
	} else {
		ffmpegPathLocal += ".exe"
	}

	storage.FfmpegPath = ffmpegPathLocal
	log.GetLogger().Info("ffmpeg安装完成", zap.String("路径", ffmpegPathLocal))

	return nil
}

// CheckAndDownloadFfprobe 检测并安装ffprobe
func CheckAndDownloadFfprobe() error {
	// 检查检测并安装ffprobe是否已经安装
	_, err := exec.LookPath("ffmpeg")
	if err == nil {
		log.GetLogger().Info("已找到ffprobe")
		storage.FfprobePath = "ffprobe"
		return nil
	}
	log.GetLogger().Info("没有找到ffprobe，即将开始自动安装")
	// 确保./bin目录存在
	err = os.MkdirAll("./bin", 0755)
	if err != nil {
		log.GetLogger().Error("创建./bin目录失败", zap.Error(err))
		return err
	}

	var ffprobeURL string
	if runtime.GOOS == "linux" {
		ffprobeURL = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-linux-64.zip"
	} else if runtime.GOOS == "darwin" {
		ffprobeURL = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-macos-64.zip"
	} else if runtime.GOOS == "windows" {
		ffprobeURL = "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1/ffprobe-6.1-win-64.zip"
	} else {
		log.GetLogger().Error("不支持你当前的操作系统", zap.String("当前系统", runtime.GOOS))
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	// 下载
	ffprobeDownloadPath := "./bin/ffprobe.zip"
	err = DownloadFile(ffprobeURL, ffprobeDownloadPath, config.Conf.App.Proxy)
	if err != nil {
		log.GetLogger().Error("下载ffprobe失败", zap.Error(err))
		return err
	}
	err = Unzip(ffprobeDownloadPath, "./bin")
	if err != nil {
		log.GetLogger().Error("解压ffprobe失败", zap.Error(err))
		return err
	}
	log.GetLogger().Info("ffprobe解压成功")

	ffprobePathLocal := "./bin/ffprobe"
	if runtime.GOOS != "windows" {
		err = os.Chmod(ffprobePathLocal, 0755)
		if err != nil {
			log.GetLogger().Error("设置文件权限失败", zap.Error(err))
			return err
		}
	} else {
		ffprobePathLocal += ".exe"
	}

	storage.FfprobePath = ffprobePathLocal
	log.GetLogger().Info("ffprobe安装完成", zap.String("路径", ffprobePathLocal))

	return nil
}

// CheckAndDownloadYtDlp 检测并安装yt-dlp
func CheckAndDownloadYtDlp() error {
	_, err := exec.LookPath("yt-dlp")
	if err == nil {
		log.GetLogger().Info("已找到yt-dlp")
		storage.YtdlpPath = "yt-dlp"
		return nil
	}
	log.GetLogger().Info("没有找到yt-dlp，即将开始自动安装")
	err = os.MkdirAll("./bin", 0755)
	if err != nil {
		log.GetLogger().Error("创建./bin目录失败", zap.Error(err))
		return err
	}

	var ytDlpURL string
	if runtime.GOOS == "linux" {
		ytDlpURL = "https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp_linux"
	} else if runtime.GOOS == "darwin" {
		ytDlpURL = "https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp_macos"
	} else if runtime.GOOS == "windows" {
		ytDlpURL = "https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp.exe"
	} else {
		log.GetLogger().Error("不支持你当前的操作系统", zap.String("当前系统", runtime.GOOS))
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	ytDlpDownloadPath := "./bin/yt-dlp"
	if runtime.GOOS == "windows" {
		ytDlpDownloadPath += ".exe"
	}
	err = DownloadFile(ytDlpURL, ytDlpDownloadPath, config.Conf.App.Proxy)
	if err != nil {
		log.GetLogger().Error("下载yt-dlp失败", zap.Error(err))
		return err
	}

	if runtime.GOOS != "windows" {
		err = os.Chmod(ytDlpDownloadPath, 0755)
		if err != nil {
			log.GetLogger().Error("设置文件权限失败", zap.Error(err))
			return err
		}
	}

	storage.YtdlpPath = ytDlpDownloadPath
	log.GetLogger().Info("yt-dlp安装完成", zap.String("路径", ytDlpDownloadPath))

	return nil
}
