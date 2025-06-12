package util

import (
	"go.uber.org/zap"
	"krillin-ai/internal/storage"
	"krillin-ai/log"
	"os/exec"
	"path/filepath"
	"strings"
)

// 把音频处理成单声道、16k采样率
func ProcessAudio(filePath string) (string, error) {
	dest := strings.ReplaceAll(filePath, filepath.Ext(filePath), "_mono_16K.mp3")
	cmdArgs := []string{"-i", filePath, "-ac", "1", "-ar", "16000", "-b:a", "192k", dest}
	cmd := exec.Command(storage.FfmpegPath, cmdArgs...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.GetLogger().Error("处理音频失败", zap.Error(err), zap.String("audio file", filePath), zap.String("output", string(output)))
		return "", err
	}
	return dest, nil
}
