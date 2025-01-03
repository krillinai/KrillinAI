package fasterwhisper

import (
	"encoding/json"
	"go.uber.org/zap"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"strings"
)

func (c *FastwhisperProcessor) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	cmdArgs := []string{
		"--model_dir", "./models/",
		"--model", c.Model,
		"--one_word", "2",
		"--output_format", "json",
		"--language", language,
		"--output_dir", workDir,
		audioFile,
	}
	cmd := exec.Command(storage.FasterwhisperPath, cmdArgs...)
	log.GetLogger().Info("FastwhisperProcessor转录开始", zap.String("cmd", cmd.String()))
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.GetLogger().Error("FastwhisperProcessor  cmd 执行失败", zap.String("output", string(output)), zap.Error(err))
		return nil, err
	}
	log.GetLogger().Info("FastwhisperProcessor转录json生成完毕", zap.String("audio file", audioFile))

	var result types.FasterWhisperOutput
	fileData, err := os.Open(util.ChangeFileExtension(audioFile, ".json"))
	if err != nil {
		log.GetLogger().Error("FastwhisperProcessor 打开json文件失败", zap.Error(err))
		return nil, err
	}
	defer fileData.Close()
	decoder := json.NewDecoder(fileData)
	if err = decoder.Decode(&result); err != nil {
		log.GetLogger().Error("FastwhisperProcessor 解析json文件失败", zap.Error(err))
		return nil, err
	}

	var (
		transcripotionData types.TranscriptionData
		num                int
	)
	for _, segment := range result.Segments {
		transcripotionData.Text += segment.Text
		for _, word := range segment.Words {
			transcripotionData.Words = append(transcripotionData.Words, types.Word{
				Num:   num,
				Text:  util.CleanPunction(strings.TrimSpace(word.Word)),
				Start: word.Start,
				End:   word.End,
			})
			num++
		}
	}
	log.GetLogger().Info("FastwhisperProcessor转录成功")
	return &transcripotionData, nil
}
