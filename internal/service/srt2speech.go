package service

import (
	"context"
	"fmt"
	"go.uber.org/zap"
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
)

// 输入中文字幕，生成配音
func (s Service) srtFileToSpeech(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if !stepParam.EnableTts {
		return nil
	}
	// Step 1: 解析字幕文件
	subtitles, err := parseSRT(stepParam.TtsSourceFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.parseSRT err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}

	var audioFiles []string
	var currentTime time.Time

	// 创建文件记录音频的开始和结束时间
	durationDetailFile, err := os.Create(filepath.Join(stepParam.TaskBasePath, types.TtsAudioDurationDetailsFileName))
	if err != nil {
		log.GetLogger().Error("generateAudioSubtitles.srtFileToSpeech.os.Create err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}
	defer durationDetailFile.Close()

	// Step 2: 使用 阿里云TTS
	// 判断是否使用音色克隆
	voiceCode := stepParam.TtsVoiceCode
	if stepParam.VoiceCloneAudioUrl != "" {
		var code string
		code, err = s.VoiceCloneClient.CosyVoiceClone("krillinai", stepParam.VoiceCloneAudioUrl)
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.srtFileToSpeech.VoiceCloneClient.CosyVoiceClone err", zap.Any("stepParam", stepParam), zap.Error(err))
			return err
		}
		voiceCode = code
	}

	for i, sub := range subtitles {
		outputFile := filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("subtitle_%d.wav", i+1))
		err = s.TtsClient.Text2Speech(sub.Text, voiceCode, outputFile)
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.srtFileToSpeech.Text2Speech err", zap.Any("taskId", stepParam.TaskId), zap.Any("num", i+1), zap.Error(err))
			return err
		}

		// Step 3: 调整音频时长
		startTime, err := time.Parse("15:04:05,000", sub.Start)
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.adjustAudioDuration.time.Parse err", zap.Any("taskId", stepParam.TaskId), zap.Any("num", i+1), zap.Error(err))
			return err
		}
		endTime, err := time.Parse("15:04:05,000", sub.End)
		if err != nil {
			log.GetLogger().Error("audioToSubtitle.time.Parse err", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return err
		}
		if i == 0 {
			// 如果第一条字幕不是从00:00开始，增加静音帧
			if startTime.Second() > 0 {
				silenceDurationMs := startTime.Sub(time.Date(0, 1, 1, 0, 0, 0, 0, time.UTC)).Milliseconds()
				silenceFilePath := filepath.Join(stepParam.TaskBasePath, "silence_0.wav")
				err := newGenerateSilence(silenceFilePath, float64(silenceDurationMs)/1000)
				if err != nil {
					log.GetLogger().Error("generateAudioSubtitles.newGenerateSilence.ChatCompletion err", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
					return err
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
				log.GetLogger().Error("audioToSubtitle.time.Parse err", zap.Any("stepParam", stepParam), zap.Any("num", i+2), zap.Error(err))
				return err
			}
			if endTime.Before(nextStartTime) {
				duration = nextStartTime.Sub(startTime).Seconds()
			}
		}

		adjustedFile := filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("adjusted_%d.wav", i+1))
		err = adjustAudioDuration(outputFile, adjustedFile, stepParam.TaskBasePath, duration)
		if err != nil {
			log.GetLogger().Error("audioToSubtitle.adjustAudioDuration err", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return err
		}

		audioFiles = append(audioFiles, adjustedFile)

		// 计算音频的实际时长
		audioDuration, err := util.GetAudioDuration(adjustedFile)
		if err != nil {
			log.GetLogger().Error("audioToSubtitle.GetAudioDuration err", zap.Any("stepParam", stepParam), zap.Any("num", i+1), zap.Error(err))
			return err
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
		log.GetLogger().Error("audioToSubtitle.concatenateAudioFiles err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}
	stepParam.TtsResultFilePath = finalOutput
	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 98
	log.GetLogger().Info("srtFileToSpeech success", zap.String("task id", stepParam.TaskId))
	return nil
}

func parseSRT(filePath string) ([]types.SrtSentenceWithStrTime, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败: %v", err)
	}

	var subtitles []types.SrtSentenceWithStrTime
	re := regexp.MustCompile(`(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\s+(.+?)\n`)
	matches := re.FindAllStringSubmatch(string(data), -1)

	for _, match := range matches {
		subtitles = append(subtitles, types.SrtSentenceWithStrTime{
			Start: match[1],
			End:   match[2],
			Text:  strings.Replace(match[3], "\n", " ", -1), // 去除换行
		})
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
		return fmt.Errorf("failed to generate PCM silence: %w", err)
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
		log.GetLogger().Debug("adjustAudioDuration", zap.Any("silenceDuration", silenceAudioDuration))

		// 拼接音频和静音
		concatFile := filepath.Join(taskBasePath, "concat.txt")
		f, err := os.Create(concatFile)
		if err != nil {
			return fmt.Errorf("error creating concat file: %v", err)
		}
		defer os.Remove(concatFile)

		_, err = f.WriteString(fmt.Sprintf("file '%s'\nfile '%s'\n", filepath.Base(inputFile), filepath.Base(silenceFile)))
		if err != nil {
			return fmt.Errorf("error writing to concat file: %v", err)
		}
		f.Close()

		cmd := exec.Command(storage.FfmpegPath, "-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputFile)
		log.GetLogger().Info("AiCapabilityGrpcServer adjustAudioDuration", zap.Any("inputFile", inputFile), zap.Any("outputFile", outputFile), zap.String("run command", cmd.String()))
		cmd.Stderr = os.Stderr
		err = cmd.Run()
		if err != nil {
			return fmt.Errorf("error concatenating audio and silence: %v", err)
		}

		concatFileDuration, _ := util.GetAudioDuration(outputFile)
		log.GetLogger().Debug("adjustAudioDuration", zap.Any("concatFileDuration", concatFileDuration))
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
