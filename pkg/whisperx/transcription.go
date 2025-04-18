package whisperx

import (
	"encoding/json"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"go.uber.org/zap"
)

func (c *WhisperXProcessor) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	var (
		cmdArgs []string
		envPath string
	)
	if runtime.GOOS == "windows" {
		envPath = ".\\bin\\whisperx\\.venv\\Scripts\\activate"
	} else {
		envPath = "bash"
	}
	if runtime.GOOS == "windows" {
		cmdArgs = []string{
			"&&",
			storage.WhisperXPath,
			audioFile,
			"--model_dir", "./models/whisperx",
			"--model", c.Model,
			"--language", language,
			"--output_dir", workDir,
			"--compute_type", "float16",
			"--batch_size", "2",
			"--model_cache_only", "True",
		}
	} else {
		cmdArgs = []string{
			"./bin/whisperx/activate.sh",
			"&&",
			storage.WhisperXPath,
			audioFile,
			"--model_dir", "./models/whisperx",
			"--model", c.Model,
			"--language", language,
			"--output_dir", workDir,
			"--compute_type", "float16",
			"--batch_size", "2",
			"--model_cache_only", "True",
		}
	}
	cmd := exec.Command(envPath, cmdArgs...)
	log.GetLogger().Info("WhisperXProcessor转录开始", zap.String("cmd", cmd.String()))
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.GetLogger().Error("WhisperXProcessor  cmd 执行失败", zap.String("output", string(output)), zap.Error(err))
		return nil, err
	}
	log.GetLogger().Info("WhisperXProcessor转录json生成完毕", zap.String("audio file", audioFile))

	var result types.WhisperXOutput
	fileData, err := os.Open(util.ChangeFileExtension(audioFile, ".json"))
	if err != nil {
		log.GetLogger().Error("WhisperXProcessor 打开json文件失败", zap.Error(err))
		return nil, err
	}
	defer fileData.Close()
	decoder := json.NewDecoder(fileData)
	if err = decoder.Decode(&result); err != nil {
		log.GetLogger().Error("WhisperXProcessor 解析json文件失败", zap.Error(err))
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
	log.GetLogger().Info("WhisperXProcessor转录成功")
	return &transcriptionData, nil
}
