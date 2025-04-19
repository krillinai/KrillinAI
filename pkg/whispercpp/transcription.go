package whispercpp

import (
	"encoding/json"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	"go.uber.org/zap"
)

func (c *WhispercppProcessor) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	name := util.ChangeFileExtension(audioFile, "")
	cmdArgs := []string{
		"-m", fmt.Sprintf("./models/whispercpp/ggml-%s.bin", c.Model),
		"--output-json-full",
		"--flash-attn",
		"--split-on-word",
		"--language", language,
		"--output-file", name,
		"--file", audioFile,
	}
	cmd := exec.Command(storage.WhispercppPath, cmdArgs...)
	log.GetLogger().Info("WhispercppProcessor转录开始", zap.String("cmd", cmd.String()))
	output, err := cmd.CombinedOutput()
	if err != nil && !strings.Contains(string(output), "output_json: saving output to") {
		log.GetLogger().Error("WhispercppProcessor  cmd 执行失败", zap.String("output", string(output)), zap.Error(err))
		return nil, err
	}
	log.GetLogger().Info("WhispercppProcessor转录json生成完毕", zap.String("audio file", audioFile))

	var result types.WhispercppOutput
	fileData, err := os.Open(util.ChangeFileExtension(audioFile, ".json"))
	if err != nil {
		log.GetLogger().Error("WhispercppProcessor 打开json文件失败", zap.Error(err))
		return nil, err
	}
	defer fileData.Close()
	decoder := json.NewDecoder(fileData)
	if err = decoder.Decode(&result); err != nil {
		log.GetLogger().Error("WhispercppProcessor 解析json文件失败", zap.Error(err))
		return nil, err
	}

	var (
		transcriptionData types.TranscriptionData
		num               int
	)
	for _, segment := range result.Transcription {
		transcriptionData.Text += strings.ReplaceAll(segment.Text, "—", " ") // 连字符处理，因为模型存在很多错误添加到连字符
		for _, word := range segment.Tokens {
			fromSec, err := parseTimestampToSeconds(word.Timestamps.From)
			if err != nil {
				log.GetLogger().Error("解析开始时间失败", zap.Error(err))
				return nil, err
			}

			toSec, err := parseTimestampToSeconds(word.Timestamps.To)
			if err != nil {
				log.GetLogger().Error("解析结束时间失败", zap.Error(err))
				return nil, err
			}
			regex := regexp.MustCompile(`^\[.*\]$`)
			if regex.MatchString(word.Text) {
				continue
			} else if strings.Contains(word.Text, "—") {
				// 对称切分
				mid := (fromSec + toSec) / 2
				seperatedWords := strings.Split(word.Text, "—")
				transcriptionData.Words = append(transcriptionData.Words, []types.Word{
					{
						Num:   num,
						Text:  util.CleanPunction(strings.TrimSpace(seperatedWords[0])),
						Start: fromSec,
						End:   mid,
					},
					{
						Num:   num + 1,
						Text:  util.CleanPunction(strings.TrimSpace(seperatedWords[1])),
						Start: mid,
						End:   toSec,
					},
				}...)
				num += 2
			} else {
				transcriptionData.Words = append(transcriptionData.Words, types.Word{
					Num:   num,
					Text:  util.CleanPunction(strings.TrimSpace(word.Text)),
					Start: fromSec,
					End:   toSec,
				})
				num++
			}
		}
	}
	log.GetLogger().Info("WhispercppProcessor转录成功")
	return &transcriptionData, nil
}

// 新增时间戳转换函数
func parseTimestampToSeconds(timeStr string) (float64, error) {
	parts := strings.Split(timeStr, ",")
	if len(parts) != 2 {
		return 0, fmt.Errorf("invalid timestamp format: %s", timeStr)
	}

	timePart := strings.Split(parts[0], ":")
	if len(timePart) != 3 {
		return 0, fmt.Errorf("invalid time format: %s", parts[0])
	}

	hours, _ := strconv.Atoi(timePart[0])
	minutes, _ := strconv.Atoi(timePart[1])
	seconds, _ := strconv.Atoi(timePart[2])
	milliseconds, _ := strconv.Atoi(parts[1])

	return float64(hours*3600+minutes*60+seconds) + float64(milliseconds)/1000, nil
}
