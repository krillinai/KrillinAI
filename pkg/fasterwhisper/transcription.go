package fasterwhisper

import (
	"encoding/json"
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

	if config.Conf.Transcribe.EnableGpuAcceleration {
		cmdArgs = append(cmdArgs[:len(cmdArgs)-1], "--compute_type", "float16", cmdArgs[len(cmdArgs)-1])
		log.GetLogger().Info("FastwhisperProcessor启用GPU加速", zap.String("model", c.Model))
	}

	cmd := exec.Command(storage.FasterwhisperPath, cmdArgs...)
	log.GetLogger().Info("FastwhisperProcessor转录开始", zap.String("cmd", cmd.String()))
	output, err := cmd.CombinedOutput()
	if err != nil && !strings.Contains(string(output), "Subtitles are written to") {
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
		transcriptionData types.TranscriptionData
		num               int
	)
	for _, segment := range result.Segments {
		transcriptionData.Text += strings.ReplaceAll(segment.Text, "—", " ") // 连字符处理，因为模型存在很多错误添加到连字符
		for _, word := range segment.Words {
			if strings.Contains(word.Word, "—") {
				// 对称切分
				mid := (word.Start + word.End) / 2
				seperatedWords := strings.Split(word.Word, "—")
				transcriptionData.Words = append(transcriptionData.Words, []types.Word{
					{
						Num:   num,
						Text:  util.CleanPunction(strings.TrimSpace(seperatedWords[0])),
						Start: word.Start,
						End:   mid,
					},
					{
						Num:   num + 1,
						Text:  util.CleanPunction(strings.TrimSpace(seperatedWords[1])),
						Start: mid,
						End:   word.End,
					},
				}...)
				num += 2
			} else {
				transcriptionData.Words = append(transcriptionData.Words, types.Word{
					Num:   num,
					Text:  util.CleanPunction(strings.TrimSpace(word.Word)),
					Start: word.Start,
					End:   word.End,
				})
				num++
			}
		}
	}
	log.GetLogger().Info("FastwhisperProcessor转录成功")
	return &transcriptionData, nil
}
