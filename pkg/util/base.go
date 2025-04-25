package util

import (
	"archive/zip"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/google/uuid"
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

func GenerateID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}

// ChangeFileExtension 修改文件后缀
func ChangeFileExtension(path string, newExt string) string {
	ext := filepath.Ext(path)
	return path[:len(path)-len(ext)] + newExt
}

func CleanPunction(word string) string {
	return strings.TrimFunc(word, func(r rune) bool {
		return unicode.IsPunct(r)
	})
}

func IsAlphabetic(r rune) bool {
	if unicode.IsLetter(r) { // 中文在IsLetter中会返回true
		switch {
		// 英语及其他拉丁字母的范围
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z':
			return true
		// 扩展拉丁字母（法语、西班牙语等使用的附加字符）
		case r >= '\u00C0' && r <= '\u024F':
			return true
		// 希腊字母
		case r >= '\u0370' && r <= '\u03FF':
			return true
		// 西里尔字母（俄语等）
		case r >= '\u0400' && r <= '\u04FF':
			return true
		default:
			return false
		}
	}
	return false
}

func AddFileNameSuffix(file, suffix string) string {
	// 获取最后一个点号的位置，用于分离文件扩展名
	lastDotIndex := strings.LastIndex(file, ".")
	if lastDotIndex == -1 {
		// 如果没有扩展名，直接在末尾添加后缀
		return file + "_" + suffix
	}

	// 分离文件名和扩展名，在中间插入后缀
	fileName := file[:lastDotIndex]
	fileExt := file[lastDotIndex:]
	return fileName + "_" + suffix + fileExt
}

func ContainsAlphabetic(text string) bool {
	for _, r := range text {
		if IsAlphabetic(r) {
			return true
		}
	}
	return false
}

// CopyFile 复制文件
func CopyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destinationFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	if err != nil {
		return err
	}

	return destinationFile.Sync()
}
