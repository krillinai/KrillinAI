package whisperkit

import (
	"bytes"
	"encoding/json"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"go.uber.org/zap"
)

func (c *WhisperKitProcessor) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	return c.TranscriptionWithProgress(audioFile, language, workDir, nil)
}

func (c *WhisperKitProcessor) TranscriptionWithProgress(
	audioFile, language, workDir string,
	reportProgress func(percent int),
) (*types.TranscriptionData, error) {
	cmdArgs := []string{
		"transcribe",
		"--model-path", "./models/whisperkit/openai_whisper-large-v2",
		"--audio-encoder-compute-units", "all",
		"--text-decoder-compute-units", "all",
		"--language", language,
		"--report",
		"--report-path", workDir,
		"--word-timestamps",
		"--skip-special-tokens",
		"--audio-path", audioFile,
	}
	if reportProgress != nil {
		cmdArgs = append(cmdArgs, "--verbose")
	}
	cmd := exec.Command(storage.WhisperKitPath, cmdArgs...)
	log.GetLogger().Info("WhisperKitProcessor转录开始", zap.String("cmd", cmd.String()))
	output := newProgressOutput(reportProgress)
	cmd.Stdout = output
	cmd.Stderr = output
	err := cmd.Run()
	if err != nil {
		log.GetLogger().Error("WhisperKitProcessor  cmd 执行失败", zap.String("output", output.String()), zap.Error(err))
		return nil, err
	}
	log.GetLogger().Info("WhisperKitProcessor转录json生成完毕", zap.String("audio file", audioFile))

	var result types.WhisperKitOutput
	fileData, err := os.Open(util.ChangeFileExtension(audioFile, ".json"))
	if err != nil {
		log.GetLogger().Error("WhisperKitProcessor 打开json文件失败", zap.Error(err))
		return nil, err
	}
	defer fileData.Close()
	decoder := json.NewDecoder(fileData)
	if err = decoder.Decode(&result); err != nil {
		log.GetLogger().Error("WhisperKitProcessor 解析json文件失败", zap.Error(err))
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
	log.GetLogger().Info("WhisperKitProcessor转录成功")
	return &transcriptionData, nil
}

var whisperKitProgressPattern = regexp.MustCompile(`\]\s*([0-9]{1,3})%\s*\|`)

type progressOutput struct {
	mu             sync.Mutex
	output         bytes.Buffer
	pending        string
	lastProgress   int
	reportProgress func(percent int)
}

func newProgressOutput(reportProgress func(percent int)) *progressOutput {
	return &progressOutput{
		lastProgress:   -1,
		reportProgress: reportProgress,
	}
}

func (w *progressOutput) Write(data []byte) (int, error) {
	w.mu.Lock()
	_, _ = w.output.Write(data)
	value := w.pending + string(data)
	progressValues := make([]int, 0)
	for _, match := range whisperKitProgressPattern.FindAllStringSubmatch(value, -1) {
		percent, err := strconv.Atoi(match[1])
		if err != nil || percent < 0 || percent > 100 || percent <= w.lastProgress {
			continue
		}
		w.lastProgress = percent
		progressValues = append(progressValues, percent)
	}
	const pendingLimit = 128
	if len(value) > pendingLimit {
		w.pending = value[len(value)-pendingLimit:]
	} else {
		w.pending = value
	}
	w.mu.Unlock()

	if w.reportProgress != nil {
		for _, percent := range progressValues {
			w.reportProgress(percent)
		}
	}
	return len(data), nil
}

func (w *progressOutput) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.output.String()
}
