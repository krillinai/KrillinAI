package fasterwhisper

import (
	"encoding/json"
	"krillin-ai/config"
	"krillin-ai/internal/resourcepath"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"krillin-ai/pkg/whisper"
	"os"
	"os/exec"
	"strings"

	"go.uber.org/zap"
)

func (c *FastwhisperProcessor) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	if err := c.ValidateLanguage(language); err != nil {
		return nil, err
	}
	language = types.WhisperLanguageCode(language)

	modelDir := "./models/"
	if root, configured, err := resourcepath.Root(); err != nil {
		return nil, err
	} else if configured {
		modelDir = root + string(os.PathSeparator) + "models" + string(os.PathSeparator) + "fasterwhisper"
	}
	cmdArgs := []string{
		"--model_dir", modelDir,
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
		transcriptionData = types.TranscriptionData{Language: string(types.NormalizeLanguage(language))}
		num               int
	)
	for _, segment := range result.Segments {
		transcriptionData.Text += segment.Text
		for _, word := range segment.Words {
			if strings.TrimSpace(word.Word) == "" {
				continue
			}
			transcriptionData.Words = append(transcriptionData.Words, types.Word{Num: num, Text: word.Word, Start: word.Start, End: word.End})
			num++
		}
	}
	log.GetLogger().Info("FastwhisperProcessor转录成功")
	return &transcriptionData, nil
}

func (c *FastwhisperProcessor) ValidateLanguage(language string) error {
	if err := types.ValidateWhisperLanguage(language, c.Model); err != nil {
		return &whisper.TranscriptionError{Code: "creator_transcription_language_unsupported", Message: err.Error()}
	}
	return nil
}
