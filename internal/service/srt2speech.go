package service

import (
	"context"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"go.uber.org/zap"
)

const (
	TTSFileNamePattern           = "tts_%d.wav"
	TTSGroupMergeFileNamePattern = "tts_group_%d_%d.wav"
	TTSAdjustFileNameSuffix      = "adjusted"
	TTSFirtSilenceFileName       = "tts_silence_0.wav"
	TTSGroupSize                 = 4

	TtsResultAudioFileName          = "tts_final_audio.wav"
	TtsResultBackgroupAudioFileName = "tts_final_backgroup_audio.wav"
)

func MakeTTSFileName(index int) string {
	return fmt.Sprintf(TTSFileNamePattern, index)
}

func MakeTTSGroupMergeFileName(startIndex int, endIndex int) string {
	return fmt.Sprintf(TTSGroupMergeFileNamePattern, startIndex, endIndex)
}

// 输入中文字幕，生成配音
func (s Service) srtFileToSpeech(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if !stepParam.EnableTts {
		return nil
	}
	// Step 1: 解析字幕文件
	subtitles, err := parseSRT(stepParam.TtsSourceFilePath)
	if err != nil {
		log.GetLogger().Error("srtFileToSpeech parseSRT error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("srtFileToSpeech parseSRT error: %w", err)
	}

	var audioFiles []string
	var currentTime time.Time

	// 创建文件记录音频的开始和结束时间
	durationDetailFile, err := os.Create(filepath.Join(stepParam.TaskBasePath, types.TtsAudioDurationDetailsFileName))
	if err != nil {
		log.GetLogger().Error("srtFileToSpeech create durationDetailFile error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("srtFileToSpeech create durationDetailFile error: %w", err)
	}
	defer durationDetailFile.Close()

	// Step 2: 使用 阿里云TTS
	// 判断是否使用音色克隆
	voiceCode := stepParam.TtsVoiceCode
	if stepParam.VoiceCloneAudioUrl != "" {
		var code string
		code, err = s.VoiceCloneClient.CosyVoiceClone("krillinai", stepParam.VoiceCloneAudioUrl)
		if err != nil {
			log.GetLogger().Error("srtFileToSpeech CosyVoiceClone error", zap.Any("stepParam", stepParam), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech CosyVoiceClone error: %w", err)
		}
		voiceCode = code
	}

	for i, sub := range subtitles {
		outputFile := filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("subtitle_%d.wav", i+1))
		err = s.TtsClient.TextToSpeech(sub.Text, voiceCode, outputFile)
		if err != nil {
			log.GetLogger().Error("srtFileToSpeech Text2Speech error", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech Text2Speech error: %w", err)
		}

		// Step 3: 调整音频时长
		startTime, err := time.Parse("15:04:05,000", sub.Start)
		if err != nil {
			log.GetLogger().Error("srtFileToSpeech parse time error", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.String("time str", sub.Start), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech parse time error: %w", err)
		}
		endTime, err := time.Parse("15:04:05,000", sub.End)
		if err != nil {
			log.GetLogger().Error("audioToSubtitle.time.Parse error", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.String("time str", sub.Start), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech audioToSubtitle.time.Parse error: %w", err)
		}
		if i == 0 {
			// 如果第一条字幕不是从00:00开始，增加静音帧
			if startTime.Second() > 0 {
				silenceDurationMs := startTime.Sub(time.Date(0, 1, 1, 0, 0, 0, 0, time.UTC)).Milliseconds()
				silenceFilePath := filepath.Join(stepParam.TaskBasePath, "silence_0.wav")
				err := newGenerateSilence(silenceFilePath, float64(silenceDurationMs)/1000)
				if err != nil {
					log.GetLogger().Error("srtFileToSpeech newGenerateSilence error", zap.Any("stepParam", stepParam), zap.Error(err))
					return fmt.Errorf("srtFileToSpeech newGenerateSilence error: %w", err)
				}
				audioFiles = append(audioFiles, silenceFilePath)

				// 计算静音帧的结束时间
				silenceEndTime := currentTime.Add(time.Duration(silenceDurationMs) * time.Millisecond)
				durationDetailFile.WriteString(fmt.Sprintf("Silence: start=%s, end=%s\n", currentTime.Format("15:04:05,000"), silenceEndTime.Format("15:04:05,000")))
				currentTime = silenceEndTime
			}
		}

		duration := endTime.Sub(startTime).Seconds()
		if i < len(subtitles)-1 {
			// 如果不是最后一条字幕，增加静音帧时长
			nextStartTime, err := time.Parse("15:04:05,000", subtitles[i+1].Start)
			if err != nil {
				log.GetLogger().Error("srtFileToSpeech parse time error", zap.Any("stepParam", stepParam), zap.Any("num", i+2), zap.String("time str", subtitles[i+1].Start), zap.Error(err))
				return fmt.Errorf("srtFileToSpeech parse time error: %w", err)
			}
			if endTime.Before(nextStartTime) {
				duration = nextStartTime.Sub(startTime).Seconds()
			}
		}

		adjustedFile := filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("adjusted_%d.wav", i+1))
		err = adjustAudioDuration(outputFile, adjustedFile, stepParam.TaskBasePath, duration)
		if err != nil {
			log.GetLogger().Error("srtFileToSpeech adjustAudioDuration error", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech adjustAudioDuration error: %w", err)
		}

		audioFiles = append(audioFiles, adjustedFile)

		// 计算音频的实际时长
		audioDuration, err := util.GetAudioDuration(adjustedFile)
		if err != nil {
			log.GetLogger().Error("srtFileToSpeech GetAudioDuration error", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech GetAudioDuration error: %w", err)
		}

		// 计算音频的结束时间
		audioEndTime := currentTime.Add(time.Duration(audioDuration*1000) * time.Millisecond)
		// 写入文件
		durationDetailFile.WriteString(fmt.Sprintf("Audio %d: start=%s, end=%s\n", i+1, currentTime.Format("15:04:05,000"), audioEndTime.Format("15:04:05,000")))
		currentTime = audioEndTime
	}

	// Step 6: 拼接所有音频文件
	finalOutput := filepath.Join(stepParam.TaskBasePath, types.TtsResultAudioFileName)
	err = concatenateAudioFiles(audioFiles, finalOutput, stepParam.TaskBasePath)
	if err != nil {
		log.GetLogger().Error("srtFileToSpeech concatenateAudioFiles error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("srtFileToSpeech concatenateAudioFiles error: %w", err)
	}
	stepParam.TtsResultFilePath = finalOutput
	ttsFile := "output_tts" + filepath.Ext(stepParam.InputVideoPath)

	stepParam.TtsResultFilePath = filepath.Join(stepParam.TaskBasePath, ttsFile)
	// 合成配音文件
	util.ReplaceAudioInVideo(stepParam.InputVideoPath, finalOutput, stepParam.TtsResultFilePath)
	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 98
	log.GetLogger().Info("srtFileToSpeech success", zap.String("task id", stepParam.TaskId))
	return nil
}

func (s Service) newSrtFileToSpeech(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if !stepParam.EnableTts {
		return nil
	}
	// Step 1: 解析字幕文件
	subtitles, err := parseSRT(stepParam.TtsSourceFilePath)
	if err != nil {
		log.GetLogger().Error("srtFileToSpeech parseSRT error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("srtFileToSpeech parseSRT error: %w", err)
	}

	voiceOutputFiles := make([]string, 0)
	for i, sub := range subtitles {
		outputFile := filepath.Join(stepParam.TaskBasePath, MakeTTSFileName(i))
		err = s.TtsClient.TextToSpeech(sub.Text, stepParam.TtsVoiceCode, outputFile)
		if err != nil {
			log.GetLogger().Error("srtFileToSpeech Text2Speech error", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return fmt.Errorf("srtFileToSpeech Text2Speech error: %w", err)
		}
		voiceOutputFiles = append(voiceOutputFiles, outputFile)
	}

	// 按组处理音频文件
	processedFiles, adjustedSubtitles, err := processAudioFilesInGroups(voiceOutputFiles, subtitles, TTSGroupSize, stepParam.TaskBasePath)
	if err != nil {
		log.GetLogger().Error("srtFileToSpeech processAudioFilesInGroups error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("srtFileToSpeech processAudioFilesInGroups error: %w", err)
	}

	// 生成新的字幕文件
	newSrtPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskBilingualTargetTopTTSSrtFileName)
	if err := util.NewSrtFile(adjustedSubtitles, newSrtPath); err != nil {
		log.GetLogger().Error("srtFileToSpeech generateNewSrtFile error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("srtFileToSpeech generateNewSrtFile error: %w", err)
	}

	stepParam.BilingualTargetTopTTSSrtFilePath = newSrtPath
	// 拼接所有音频文件
	finalOutput := filepath.Join(stepParam.TaskBasePath, TtsResultAudioFileName)
	err = util.ConcatenateAudioFiles(&util.ConcatenateAudioFilesReq{
		AudioFiles: processedFiles,
		OutputFile: finalOutput,
		BasePath:   stepParam.TaskBasePath,
	})
	if err != nil {
		log.GetLogger().Error("srtFileToSpeech concatenateAudioFiles error", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}

	stepParam.TtsResultFilePath = finalOutput
	ttsFile := "output_tts" + filepath.Ext(stepParam.InputVideoPath)

	stepParam.TtsResultFilePath = filepath.Join(stepParam.TaskBasePath, ttsFile)
	// 合成配音文件
	util.ReplaceAudioInVideo(stepParam.InputVideoPath, finalOutput, stepParam.TtsResultFilePath)
	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 98
	log.GetLogger().Info("srtFileToSpeech success", zap.String("task id", stepParam.TaskId))
	return nil
}

func processAudioFilesInGroups(audioFiles []string, subtitles []types.SrtSentenceWithStrTime, groupSize int, taskBasePath string) ([]string, []types.SrtSentenceWithStrTime, error) {
	// 记录需要提前分组的位置
	needSplitAtIndex := make(map[int]bool)
	// 预处理：检测间隔超过5秒的字幕对
	for i := 0; i < len(subtitles)-1; i++ {
		endTime, err := time.Parse("15:04:05,000", subtitles[i].End)
		if err != nil {
			return nil, nil, fmt.Errorf("解析字幕结束时间失败: %w", err)
		}

		nextStartTime, err := time.Parse("15:04:05,000", subtitles[i+1].Start)
		if err != nil {
			return nil, nil, fmt.Errorf("解析下一个字幕开始时间失败: %w", err)
		}

		// 检查间隔是否超过5秒
		if nextStartTime.Sub(endTime).Seconds() > 5.0 {
			// 标记需要在i位置分组
			needSplitAtIndex[i+1] = true
			// 调整当前字幕的结束时间为下一个字幕的开始时间
			subtitles[i].End = subtitles[i+1].Start
		}
	}
	var processedFiles []string
	adjustedSubtitles := make([]types.SrtSentenceWithStrTime, len(subtitles))
	copy(adjustedSubtitles, subtitles) // 复制原始字幕

	// 处理第一个字幕的起始时间
	if len(subtitles) > 0 {
		startTime, err := time.Parse("15:04:05,000", subtitles[0].Start)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to parse first subtitle time: %w", err)
		}
		// 如果第一条字幕不是从00:00开始，增加静音帧
		if startTime.Second() > 0 {
			silenceDurationMs := startTime.Sub(time.Date(0, 1, 1, 0, 0, 0, 0, time.UTC)).Milliseconds()
			silenceFilePath := filepath.Join(taskBasePath, TTSFirtSilenceFileName)
			if err := util.NewGenerateSilence(&util.NewGenerateSilenceReq{OutputAudio: silenceFilePath, Duration: float64(silenceDurationMs) / 1000}); err != nil {
				return nil, nil, fmt.Errorf("failed to generate initial silence: %w", err)
			}
			processedFiles = append(processedFiles, silenceFilePath)
		}
	}

	// 按组遍历文件，考虑需要提前分组的情况
	i := 0
	for i < len(audioFiles) {
		// 确定当前组的结束索引
		end := i + groupSize
		if end > len(audioFiles) {
			end = len(audioFiles)
		}

		// 检查当前组内是否有需要提前分组的位置
		for j := i + 1; j < end; j++ {
			if needSplitAtIndex[j] {
				end = j
				break
			}
		}

		// 处理当前组
		groupFiles := audioFiles[i:end]
		groupSubtitles := subtitles[i:end]
		needsAdjustment, err := checkGroupNeedsAdjustment(groupFiles, groupSubtitles)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to check group adjustment: %w", err)
		}
		if needsAdjustment {
			// 处理需要合并的组
			mergedFile := filepath.Join(taskBasePath, MakeTTSGroupMergeFileName(i, i+len(groupFiles)))
			if err := util.ConcatenateAudioFiles(&util.ConcatenateAudioFilesReq{
				AudioFiles: groupFiles,
				OutputFile: mergedFile,
				BasePath:   taskBasePath,
			}); err != nil {
				return nil, nil, fmt.Errorf("failed to merge group files: %w", err)
			}

			// 获取每个音频文件的实际时长
			audioDurations := make([]float64, len(groupFiles))
			var totalAudioDuration float64
			for j, file := range groupFiles {
				duration, err := util.GetAudioDuration(file)
				if err != nil {
					return nil, nil, fmt.Errorf("failed to get audio duration: %w", err)
				}
				audioDurations[j] = duration
				totalAudioDuration += duration
			}

			// 调整组内字幕时间戳
			groupStartTime, err := time.Parse("15:04:05,000", groupSubtitles[0].Start)
			if err != nil {
				return nil, nil, fmt.Errorf("failed to parse group start time: %w", err)
			}

			// 根据音频实际时长调整字幕时间
			currentTime := groupStartTime
			for j := range groupFiles {
				adjustedSubtitles[i+j].Start = currentTime.Format("15:04:05,000")
				currentTime = currentTime.Add(time.Duration(audioDurations[j] * float64(time.Second)))
				adjustedSubtitles[i+j].End = currentTime.Format("15:04:05,000")
			}

			// 计算目标时长
			targetDuration, err := getTTSTargetDuration(&getTTSTargetDurationReq{
				StartIdx:  i,
				EndIdx:    i + len(groupFiles),
				Subtitles: subtitles,
			})
			if err != nil {
				return nil, nil, err
			}
			// 如果合并后的音频需要加速，调整时间戳
			if totalAudioDuration > targetDuration {
				speedFactor := totalAudioDuration / targetDuration
				currentTime = groupStartTime
				for j := range groupFiles {
					adjustedDuration := audioDurations[j] / speedFactor
					adjustedSubtitles[i+j].Start = currentTime.Format("15:04:05,000")
					currentTime = currentTime.Add(time.Duration(adjustedDuration * float64(time.Second)))
					adjustedSubtitles[i+j].End = currentTime.Format("15:04:05,000")
				}
			}

			// 调整合并后的文件时长
			adjustedFile := util.AddFileNameSuffix(mergedFile, TTSAdjustFileNameSuffix)
			silenceDuration, err := util.AdjustAudioDuration(&util.AdjustAudioDurationReq{
				InputFile:  mergedFile,
				OutputFile: adjustedFile,
				BasePath:   taskBasePath,
				Duration:   targetDuration,
			})
			if err != nil {
				return nil, nil, fmt.Errorf("failed to adjust merged file: %w", err)
			}
			// 分组最后一条记录的end时间需要减去silenceDuration
			if silenceDuration > 2 && needSplitAtIndex[i+len(groupFiles)] {
				lastIndex := i + len(groupFiles) - 1
				lastEndTime, err := time.Parse("15:04:05,000", adjustedSubtitles[lastIndex].End)
				if err != nil {
					return nil, nil, fmt.Errorf("解析最后一条字幕结束时间失败: %w", err)
				}
				newEndTime := lastEndTime.Add(-time.Duration(silenceDuration * float64(time.Second)))
				adjustedSubtitles[lastIndex].End = newEndTime.Format("15:04:05,000")
			}
			processedFiles = append(processedFiles, adjustedFile)
		} else {
			// 处理不需要合并的组内文件
			for j := range groupFiles {
				targetDuration, err := getTTSTargetDuration(&getTTSTargetDurationReq{
					StartIdx:  i + j,
					EndIdx:    i + j + 1,
					Subtitles: subtitles,
				})
				if err != nil {
					return nil, nil, err
				}

				adjustedFile := util.AddFileNameSuffix(groupFiles[j], TTSAdjustFileNameSuffix)
				silenceDuration, err := util.AdjustAudioDuration(&util.AdjustAudioDurationReq{
					InputFile:  groupFiles[j],
					OutputFile: adjustedFile,
					BasePath:   taskBasePath,
					Duration:   targetDuration,
				})
				if err != nil {
					return nil, nil, fmt.Errorf("failed to adjust audio duration: %w", err)
				}
				// 如果发生了静音补偿，调整当前字幕的结束时间
				if silenceDuration > 2 && needSplitAtIndex[i+len(groupFiles)] {
					endTime, err := time.Parse("15:04:05,000", adjustedSubtitles[i+j].End)
					if err != nil {
						return nil, nil, fmt.Errorf("解析字幕结束时间失败: %w", err)
					}
					newEndTime := endTime.Add(-time.Duration(silenceDuration * float64(time.Second)))
					adjustedSubtitles[i+j].End = newEndTime.Format("15:04:05,000")
				}
				processedFiles = append(processedFiles, adjustedFile)
			}
		}

		// 移动到下一组
		i = end
	}

	return processedFiles, adjustedSubtitles, nil
}

// 检查组是否需要调整
func checkGroupNeedsAdjustment(groupFiles []string, groupSubtitles []types.SrtSentenceWithStrTime) (bool, error) {
	for j, file := range groupFiles {
		audioDuration, err := util.GetAudioDuration(file)
		if err != nil {
			return false, fmt.Errorf("failed to get audio duration: %w", err)
		}

		subtitleStart, err := time.Parse("15:04:05,000", groupSubtitles[j].Start)
		if err != nil {
			return false, fmt.Errorf("failed to parse subtitle start time: %w", err)
		}
		subtitleEnd, err := time.Parse("15:04:05,000", groupSubtitles[j].End)
		if err != nil {
			return false, fmt.Errorf("failed to parse subtitle end time: %w", err)
		}
		subtitleDuration := subtitleEnd.Sub(subtitleStart).Seconds()

		if audioDuration > subtitleDuration*1.2 {
			return true, nil
		}
	}
	return false, nil
}

// 根据字幕信息，计算tts翻译后的目标时长
type getTTSTargetDurationReq struct {
	StartIdx  int
	EndIdx    int
	Subtitles []types.SrtSentenceWithStrTime
}

func getTTSTargetDuration(req *getTTSTargetDurationReq) (float64, error) {
	startTime, err := time.Parse("15:04:05,000", req.Subtitles[req.StartIdx].Start)
	if err != nil {
		return 0, fmt.Errorf("failed to parse start time: %w", err)
	}

	var endTime time.Time
	if req.EndIdx < len(req.Subtitles) {
		// 使用下一段的开始时间
		endTime, err = time.Parse("15:04:05,000", req.Subtitles[req.EndIdx].Start)
	} else {
		// 最后一段使用结束时间
		endTime, err = time.Parse("15:04:05,000", req.Subtitles[req.EndIdx-1].End)
	}
	if err != nil {
		return 0, fmt.Errorf("failed to parse end time: %w", err)
	}

	return endTime.Sub(startTime).Seconds(), nil
}

func parseSRT(filePath string) ([]types.SrtSentenceWithStrTime, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("parseSRT read file error: %w", err)
	}

	var subtitles []types.SrtSentenceWithStrTime
	re := regexp.MustCompile(`(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s*\n((?:.+\n?)*)`)
	matches := re.FindAllStringSubmatch(string(data), -1)

	for _, match := range matches {
		texts := strings.Split(strings.TrimSpace(match[3]), "\n")
		subtitle := types.SrtSentenceWithStrTime{
			Start: match[1],
			End:   match[2],
			Text:  strings.TrimSpace(texts[0]),
		}

		// 如果有第二行文本，则作为翻译
		if len(texts) > 1 {
			subtitle.Text2 = strings.TrimSpace(texts[1])
		}

		subtitles = append(subtitles, subtitle)
	}

	return subtitles, nil
}

func newGenerateSilence(outputAudio string, duration float64) error {
	// 生成 PCM 格式的静音文件
	cmd := exec.Command(storage.FfmpegPath, "-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100", "-t",
		fmt.Sprintf("%.3f", duration), "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outputAudio)
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("newGenerateSilence failed to generate PCM silence: %w", err)
	}

	return nil
}

// 调整音频时长，确保音频与字幕时长一致
func adjustAudioDuration(inputFile, outputFile, taskBasePath string, subtitleDuration float64) error {
	// 获取音频时长
	audioDuration, err := util.GetAudioDuration(inputFile)
	if err != nil {
		return err
	}

	// 如果音频时长短于字幕时长，插入静音延长音频
	if audioDuration < subtitleDuration {
		// 计算需要插入的静音时长
		silenceDuration := subtitleDuration - audioDuration

		// 生成静音音频
		silenceFile := filepath.Join(taskBasePath, "silence.wav")
		err := newGenerateSilence(silenceFile, silenceDuration)
		if err != nil {
			return fmt.Errorf("error generating silence: %v", err)
		}

		silenceAudioDuration, _ := util.GetAudioDuration(silenceFile)
		log.GetLogger().Info("adjustAudioDuration", zap.Any("silenceDuration", silenceAudioDuration))

		// 拼接音频和静音
		concatFile := filepath.Join(taskBasePath, "concat.txt")
		f, err := os.Create(concatFile)
		if err != nil {
			return fmt.Errorf("adjustAudioDuration create concat file error: %w", err)
		}
		defer os.Remove(concatFile)

		_, err = f.WriteString(fmt.Sprintf("file '%s'\nfile '%s'\n", filepath.Base(inputFile), filepath.Base(silenceFile)))
		if err != nil {
			return fmt.Errorf("adjustAudioDuration write to concat file error: %v", err)
		}
		f.Close()

		cmd := exec.Command(storage.FfmpegPath, "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputFile)
		log.GetLogger().Info("adjustAudioDuration", zap.Any("inputFile", inputFile), zap.Any("outputFile", outputFile), zap.String("run command", cmd.String()))
		cmd.Stderr = os.Stderr
		err = cmd.Run()
		if err != nil {
			return fmt.Errorf("adjustAudioDuration concat audio and silence  error: %v", err)
		}

		concatFileDuration, _ := util.GetAudioDuration(outputFile)
		log.GetLogger().Info("adjustAudioDuration", zap.Any("concatFileDuration", concatFileDuration))
		return nil
	}

	// 如果音频时长长于字幕时长，缩放音频的播放速率
	if audioDuration > subtitleDuration {
		// 计算播放速率
		speed := audioDuration / subtitleDuration
		//if speed < 0.5 || speed > 2.0 {
		//	// 速率在 FFmpeg 支持的范围内一般是 [0.5, 2.0]
		//	return fmt.Errorf("speed factor %.2f is out of range (0.5 to 2.0)", speed)
		//}

		// 使用 atempo 滤镜调整音频播放速率
		cmd := exec.Command(storage.FfmpegPath, "-y", "-i", inputFile, "-filter:a", fmt.Sprintf("atempo=%.2f", speed), outputFile)
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	// 如果音频时长和字幕时长相同，则直接复制文件
	return util.CopyFile(inputFile, outputFile)
}

// 拼接音频文件
func concatenateAudioFiles(audioFiles []string, outputFile, taskBasePath string) error {
	// 创建一个临时文件保存音频文件列表
	listFile := filepath.Join(taskBasePath, "audio_list.txt")
	f, err := os.Create(listFile)
	if err != nil {
		return err
	}
	defer os.Remove(listFile)

	for _, file := range audioFiles {
		_, err := f.WriteString(fmt.Sprintf("file '%s'\n", filepath.Base(file)))
		if err != nil {
			return err
		}
	}
	f.Close()

	cmd := exec.Command(storage.FfmpegPath, "-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outputFile)
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
