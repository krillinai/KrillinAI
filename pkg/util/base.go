package util

import (
	"fmt"
	"github.com/gen2brain/go-unarr"
	"go.uber.org/zap"
	"io"
	"krillin-ai/internal/storage"
	"krillin-ai/log"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"os/exec"
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

// DownloadFile 下载文件并保存到指定路径
func DownloadFile(url, filepath string) error {
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// 解压zip文件
func ExtractZip(archivePath, destDir string) error {
	a, err := unarr.NewArchive(archivePath)
	if err != nil {
		log.GetLogger().Error("打开文件失败", zap.Error(err))
		return err
	}
	defer a.Close()
	_, err = a.Extract(destDir)
	if err != nil {
		log.GetLogger().Error("解压文件失败", zap.Error(err))
	}
	return err
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
		// todo
	} else if runtime.GOOS == "darwin" {
		ffmpegURL = "https://evermeet.cx/ffmpeg/ffmpeg-7.1.7z"
	} else if runtime.GOOS == "windows" {
		ffmpegURL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.7z"
	} else {
		log.GetLogger().Error("不支持你当前的操作系统", zap.String("当前系统", runtime.GOOS))
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	// 下载
	ffmpegDownloadPath := "./bin/ffmpeg.7z"
	err = DownloadFile(ffmpegURL, ffmpegDownloadPath)
	if err != nil {
		log.GetLogger().Error("下载ffmpeg失败", zap.Error(err))
		return err
	}
	err = ExtractZip(ffmpegDownloadPath, "./bin")
	if err != nil {
		log.GetLogger().Error("解压ffmpeg失败", zap.Error(err))
		return err
	}
	log.GetLogger().Info("ffmpeg解压成功")

	ffmpegPathLocal := "./bin/ffmpeg/ffmpeg-2024-12-16-git-d2096679d5-essentials_build/bin/ffmpeg.exe"
	if runtime.GOOS != "windows" {
		err = os.Chmod(ffmpegPathLocal, 0755)
		if err != nil {
			log.GetLogger().Error("设置文件权限失败", zap.Error(err))
			return err
		}
	}

	storage.FfmpegPath = ffmpegPathLocal
	log.GetLogger().Info("ffmpeg安装完成", zap.String("路径", ffmpegPathLocal))

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
		// todo
	} else if runtime.GOOS == "darwin" {
		ytDlpURL = "https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp_macos"
	} else if runtime.GOOS == "windows" {
		ytDlpURL = "https://github.com/yt-dlp/yt-dlp/releases/download/2024.12.13/yt-dlp.exe"
	} else {
		log.GetLogger().Error("不支持你当前的操作系统", zap.String("当前系统", runtime.GOOS))
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}

	ytDlpPathLocal := "./bin/yt-dlp"
	if runtime.GOOS == "windows" {
		ytDlpPathLocal += ".exe"
	}
	err = DownloadFile(ytDlpURL, ytDlpPathLocal)
	if err != nil {
		log.GetLogger().Error("下载yt-dlp失败", zap.Error(err))
		return err
	}

	if runtime.GOOS != "windows" {
		err = os.Chmod(ytDlpPathLocal, 0755)
		if err != nil {
			log.GetLogger().Error("设置文件权限失败", zap.Error(err))
			return err
		}
	}

	storage.YtdlpPath = ytDlpPathLocal
	log.GetLogger().Info("yt-dlp安装完成", zap.String("路径", ytDlpPathLocal))

	return nil
}
