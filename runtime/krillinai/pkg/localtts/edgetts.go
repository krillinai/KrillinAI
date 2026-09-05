package localtts

import (
	"context"
	"fmt"
	"io/ioutil"
	"krillin-ai/internal/storage"
	"krillin-ai/log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"
)

type EdgeTtsClient struct {
}

func NewEdgeTtsClient() *EdgeTtsClient {
	return &EdgeTtsClient{}
}

func (c *EdgeTtsClient) Text2Speech(text, voice, outputFile string) error {
	// 清理语音名称中的额外空格
	voice = strings.TrimSpace(voice)

	// 确保输出目录存在
	outputDir := filepath.Dir(outputFile)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.GetLogger().Error("创建输出目录失败", zap.String("dir", outputDir), zap.Error(err))
		return fmt.Errorf("创建输出目录失败: %w", err)
	}

	// 获取绝对路径
	absOutputFile, err := filepath.Abs(outputFile)
	if err != nil {
		log.GetLogger().Error("获取输出文件绝对路径失败", zap.Error(err))
		return fmt.Errorf("获取输出文件绝对路径失败: %w", err)
	}
	absOutputDir := filepath.Dir(absOutputFile)

	// 创建临时文件来存储文本内容，避免命令行参数转义问题
	tempFile, err := ioutil.TempFile(absOutputDir, "edge_tts_text_*.txt")
	if err != nil {
		log.GetLogger().Error("创建临时文件失败", zap.Error(err))
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	tempFileName := tempFile.Name()

	// 确保在函数结束时清理临时文件
	defer func() {
		tempFile.Close()
		if err := os.Remove(tempFileName); err != nil {
			log.GetLogger().Warn("清理临时文件失败", zap.String("file", tempFileName), zap.Error(err))
		}
	}()

	// 将文本写入临时文件
	if _, err := tempFile.WriteString(text); err != nil {
		log.GetLogger().Error("写入临时文件失败", zap.Error(err))
		return fmt.Errorf("写入临时文件失败: %w", err)
	}
	tempFile.Close() // 确保文件被写入

	// 重试机制
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		log.GetLogger().Info("edge-tts转录尝试",
			zap.Int("attempt", attempt),
			zap.Int("maxRetries", maxRetries),
			zap.String("text_length", fmt.Sprintf("%d", len(text))))

		err := c.attemptTTS(tempFileName, voice, absOutputFile, attempt)
		if err == nil {
			// 成功生成
			log.GetLogger().Info("edge-tts转录完成", zap.String("output file", absOutputFile))
			if _, err := os.Stat(absOutputFile); os.IsNotExist(err) {
				log.GetLogger().Error("edge-tts 输出文件不存在", zap.String("output file", absOutputFile))
				return fmt.Errorf("edge-tts 输出文件不存在: %s", absOutputFile)
			}
			return nil
		}

		log.GetLogger().Warn("edge-tts转录失败，准备重试",
			zap.Int("attempt", attempt),
			zap.Error(err))

		// 如果不是最后一次尝试，等待一段时间再重试
		if attempt < maxRetries {
			waitTime := time.Duration(attempt) * 2 * time.Second
			log.GetLogger().Info("等待重试", zap.Duration("waitTime", waitTime))
			time.Sleep(waitTime)
		}
	}

	return fmt.Errorf("edge-tts转录失败，已重试%d次", maxRetries)
}

func (c *EdgeTtsClient) attemptTTS(tempFileName, voice, absOutputFile string, attempt int) error {
	// 使用新的edge-tts命令参数（文件输入方式）
	cmdArgs := []string{
		"--text-file", tempFileName,
		"--voice", voice,
		"--output", absOutputFile,
		"--format", "wav",
		"--sample_rate", "44100",
	}

	// 创建带超时的上下文
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second) // 60秒超时
	defer cancel()

	cmd := exec.CommandContext(ctx, storage.EdgeTtsPath, cmdArgs...)
	log.GetLogger().Info("edge-tts转录开始",
		zap.String("cmd", cmd.String()),
		zap.String("temp_file", tempFileName),
		zap.String("output_file", absOutputFile),
		zap.Int("attempt", attempt))

	output, err := cmd.CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.GetLogger().Error("edge-tts cmd 超时", zap.String("output", string(output)), zap.Error(err))
			return fmt.Errorf("edge-tts 执行超时")
		}
		log.GetLogger().Error("edge-tts cmd 执行失败", zap.String("output", string(output)), zap.Error(err))
		return err
	}

	return nil
}
