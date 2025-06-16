package service

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"

	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

// 翻译结果数据结构
type TranslatedItem struct {
	OriginText     string
	TranslatedText string
}

func (s Service) audioToSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var err error
	err = s.audioToSrt(ctx, stepParam) // 这里进度更新到90%了
	if err != nil {
		return fmt.Errorf("audioToSubtitle audioToSrt error: %w", err)
	}
	err = splitSrt(stepParam)
	if err != nil {
		return fmt.Errorf("audioToSubtitle splitSrt error: %w", err)
	}
	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 95
	return nil
}

//func splitAudio(stepParam *types.SubtitleTaskStepParam) error {
//	log.GetLogger().Info("audioToSubtitle.splitAudio start", zap.String("task id", stepParam.TaskId))
//	var err error
//	// 使用ffmpeg分割音频
//	outputPattern := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskSplitAudioFileNamePattern) // 输出文件格式
//	segmentDuration := config.Conf.App.SegmentDuration * 60
//
//	cmd := exec.Command(
//		storage.FfmpegPath,
//		"-i", stepParam.AudioFilePath, // 输入
//		"-f", "segment", // 输出文件格式为分段
//		"-segment_time", fmt.Sprintf("%d", segmentDuration), // 每段时长（以秒为单位）
//		"-reset_timestamps", "1", // 重置每段时间戳
//		"-y", // 覆盖输出文件
//		outputPattern,
//	)
//	err = cmd.Run()
//	if err != nil {
//		log.GetLogger().Error("audioToSubtitle splitAudio ffmpeg err", zap.Any("stepParam", stepParam), zap.Error(err))
//		return fmt.Errorf("audioToSubtitle splitAudio ffmpeg err: %w", err)
//	}
//
//	// 获取分割后的文件列表
//	audioFiles, err := filepath.Glob(filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("%s_*.mp3", types.SubtitleTaskSplitAudioFileNamePrefix)))
//	if err != nil {
//		log.GetLogger().Error("audioToSubtitle splitAudio filepath.Glob err", zap.Any("stepParam", stepParam), zap.Error(err))
//		return fmt.Errorf("audioToSubtitle splitAudio filepath.Glob err: %w", err)
//	}
//	if len(audioFiles) == 0 {
//		log.GetLogger().Error("audioToSubtitle splitAudio no audio files found", zap.Any("stepParam", stepParam))
//		return errors.New("audioToSubtitle splitAudio no audio files found")
//	}
//
//	for _, audioFile := range audioFiles {
//		stepParam.SmallAudios = append(stepParam.SmallAudios, &types.SmallAudio{
//			AudioFile: audioFile,
//		})
//	}
//
//	// 更新字幕任务信息
//	stepParam.TaskPtr.ProcessPct = 20
//
//	log.GetLogger().Info("audioToSubtitle.splitAudio end", zap.String("task id", stepParam.TaskId))
//	return nil
//}

func (s Service) transcribeAudio(id int, audioFilePath string, language string, taskBasePath string) (transcriptionData *types.TranscriptionData, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("audioToSubtitle transcribeAudio panic recovered: %v", r)
		}
	}()

	if language == "zh_cn" {
		language = "zh" // 切换一下
	}
	transcriptionData, err = s.Transcriber.Transcription(audioFilePath, language, taskBasePath)

	if err != nil {
		return nil, fmt.Errorf("audioToSubtitle transcribeAudio Transcription err: %w", err)
	}

	_ = util.SaveToDisk(transcriptionData, filepath.Join(taskBasePath, fmt.Sprintf(types.SubtitleTaskAudioTranscriptionDataPersistenceFileNamePattern, id)))

	if transcriptionData.Text == "" {
		log.GetLogger().Info("audioToSubtitle transcribeAudio TranscriptionData.Text is empty", zap.Any("audioFilePath", audioFilePath), zap.Any("taskBasePath", taskBasePath))
	}
	return transcriptionData, nil
}

func (s Service) splitTextAndTranslate(inputText string, targetLanguage string, enableModalFilter bool) ([]TranslatedItem, error) {
	var prompt string
	var promptPrefix string

	promptPrefix = ""

	//// 对于qwen3模型，开启非思考模式
	//if config.Conf.Openai.NoThinkTag {
	//	promptPrefix = "\\no_think\n"
	//}

	// 选择提示词
	if enableModalFilter {
		if config.Conf.Llm.Json {
			prompt = promptPrefix + fmt.Sprintf(types.SplitTextPromptWithModalFilterJson, targetLanguage)
		} else {
			prompt = promptPrefix + fmt.Sprintf(types.SplitTextPromptWithModalFilter, targetLanguage)
		}
	} else {
		if config.Conf.Llm.Json {
			prompt = promptPrefix + fmt.Sprintf(types.SplitTextPromptJson, targetLanguage)
		} else {
			prompt = promptPrefix + fmt.Sprintf(types.SplitTextPrompt, targetLanguage)
		}
	}

	// 如果输入文本为空，则返回空结果
	if inputText == "" {
		return []TranslatedItem{}, nil
	}

	textResult, err := s.ChatCompleter.ChatCompletion(prompt + inputText)
	if err != nil {
		return nil, fmt.Errorf("audioToSubtitle splitTextAndTranslate ChatCompletion error: %w", err)
	}

	re := regexp.MustCompile(`^\s*<think>.*?</think>`)
	textResult = strings.TrimSpace(re.ReplaceAllString(textResult, ""))

	results, err := parseAndCheckContent(textResult, inputText)
	if err != nil {
		return nil, fmt.Errorf("audioToSubtitle splitTextAndTranslate error: %w", err)
	}
	return results, nil
}

func (s Service) audioToSrt(ctx context.Context, stepParam *types.SubtitleTaskStepParam) (err error) {
	defer func() {
		if r := recover(); r != nil {
			log.GetLogger().Error("audioToSubtitle audioToSrt panic recovered", zap.Any("panic", r), zap.String("stack", string(debug.Stack())))
			err = fmt.Errorf("audioToSubtitle audioToSrt panic recovered: %v", r)
		}
	}()

	log.GetLogger().Info("audioToSubtitle.audioToSrt start", zap.Any("taskId", stepParam.TaskId))
	timePoints, err := GetSplitPoints(stepParam.AudioFilePath, float64(config.Conf.App.SegmentDuration)*60)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt GetSplitPoints err", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt GetSplitPoints err: %w", err)
	}
	log.GetLogger().Info("audioToSubtitle audioToSrt GetSplitPoints completed", zap.Any("taskId", stepParam.TaskId), zap.Any("timePoints", timePoints))

	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 15
	segmentNum := len(timePoints) - 1

	type DataWithId[T any] struct {
		Data T
		Id   int
	}

	var (
		// 待剪辑的音频片段队列
		pendingSplitQueue = make(chan DataWithId[[2]float64], segmentNum)
		// 剪辑结果队列
		splitResultQueue = make(chan DataWithId[string], segmentNum)
		// 待转录的音频文件队列
		pendingTranscriptionQueue = make(chan DataWithId[string], segmentNum)
		// 转录结果队列
		transcribedQueue = make(chan DataWithId[*types.TranscriptionData], segmentNum)
		// 待翻译的文本队列
		pendingTranslationQueue = make(chan DataWithId[string], segmentNum)
		// 翻译结果队列
		translatedQueue = make(chan DataWithId[[]TranslatedItem], segmentNum)
	)
	eg, ctx := errgroup.WithContext(ctx)

	log.GetLogger().Info("audioToSubtitle.audioToSrt start", zap.Any("taskId", stepParam.TaskId))

	// 构造长度为segmentNum的音频片段切片
	type AudioSegment struct {
		AudioFile         string
		TranscriptionData *types.TranscriptionData
		SrtNoTsFile       string
	}
	audioSegments := make([]AudioSegment, segmentNum)

	// 输入音频文件到分割队列
	for i := range segmentNum {
		pendingSplitQueue <- DataWithId[[2]float64]{
			Data: [2]float64{timePoints[i], timePoints[i+1]},
			Id:   i,
		}
	}

	// 分割音频
	for range runtime.NumCPU() {
		eg.Go(func() error {
			for {
				select {
				case <-ctx.Done():
					return nil
				case splitItem, ok := <-pendingSplitQueue:
					if !ok {
						return nil
					}
					log.GetLogger().Info("Begin split audio", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", splitItem.Id))
					// 分割音频
					outputFileName := filepath.Join(stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitAudioFileNamePattern, splitItem.Id))
					err := ClipAudio(stepParam.AudioFilePath, outputFileName, splitItem.Data[0], splitItem.Data[1])
					if err != nil {
						return fmt.Errorf("audioToSubtitle audioToSrt ClipAudio err: %w", err)
					}
					log.GetLogger().Info("Split audio completed", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", splitItem.Id))

					// 发送分割结果
					splitResultQueue <- DataWithId[string]{
						Data: outputFileName,
						Id:   splitItem.Id,
					}
				}
			}
		})
	}

	// 音频转录
	for range config.Conf.App.TranscribeParallelNum {
		eg.Go(func() error {
			for {
				select {
				case <-ctx.Done():
					return nil
				case audioFileItem, ok := <-pendingTranscriptionQueue:
					if !ok {
						return nil
					}
					var (
						err               error
						transcriptionData *types.TranscriptionData
					)
					log.GetLogger().Info("Begin transcribe", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", audioFileItem.Id))
					// 语音转文字
					for range config.Conf.App.TranscribeMaxAttempts {
						transcriptionData, err = s.transcribeAudio(audioFileItem.Id, audioFileItem.Data, string(stepParam.OriginLanguage), stepParam.TaskBasePath)
						if err == nil {
							break
						}
					}
					if err != nil {
						return fmt.Errorf("audioToSubtitle audioToSrt Transcription err: %w", err)
					}
					log.GetLogger().Info("Transcribe completed", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", audioFileItem.Id))

					// 发送转录结果
					transcribedQueue <- DataWithId[*types.TranscriptionData]{
						Data: transcriptionData,
						Id:   audioFileItem.Id,
					}
				}
			}
		})
	}

	// 分句翻译
	for range config.Conf.App.TranslateParallelNum {
		eg.Go(func() error {
			for {
				select {
				case <-ctx.Done():
					return nil
				case translateItem, ok := <-pendingTranslationQueue:
					if !ok {
						return nil
					}
					var translatedResults []TranslatedItem
					var err error
					// 翻译文本
					log.GetLogger().Info("Begin to translate", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", translateItem.Id))
					for range config.Conf.App.TranslateMaxAttempts {
						translatedResults, err = s.splitTextAndTranslate(translateItem.Data, types.GetStandardLanguageName(stepParam.TargetLanguage), stepParam.EnableModalFilter)
						if err == nil {
							break
						}
					}
					if err != nil {
						return fmt.Errorf("audioToSubtitle audioToSrt splitTextAndTranslate err: %w", err)
					}
					_ = util.SaveToDisk(translatedResults, filepath.Join(stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskTranslationDataPersistenceFileNamePattern, translateItem.Id)))
					log.GetLogger().Info("Translate completed", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", translateItem.Id))
					// 分割长句
					splitResults, err := s.splitTranslateItem(translatedResults)
					if err != nil {
						// 不中断
						log.GetLogger().Error("audioToSubtitle audioToSrt splitTranslateItem err", zap.Any("taskId", stepParam.TaskId), zap.Any("splitId", translateItem.Id), zap.Error(err))
						translatedQueue <- DataWithId[[]TranslatedItem]{
							Data: translatedResults,
							Id:   translateItem.Id,
						}
					} else {
						translatedQueue <- DataWithId[[]TranslatedItem]{
							Data: splitResults,
							Id:   translateItem.Id,
						}
					}
				}
			}
		})
	}

	// 处理结果，更新字幕任务信息
	eg.Go(func() error {
		// SPLIT_WEIGHT + TRANSCRIBE_WEIGHT + TRANSLATE_WEIGHT == 1
		const (
			SPLIT_WEIGHT      = 0.1
			TRANSCRIBE_WEIGHT = 0.4
			TRANSLATE_WEIGHT  = 0.5
		)
		// 总体任务在进度条中的占比
		taskWeight := (90 - 15) / float64(segmentNum)
		processPct := 15.0
		// 完成的任务数量
		completedTasks := 0
		for {
			select {
			case <-ctx.Done():
				return nil
			case splitResultItem := <-splitResultQueue:
				// 更新字幕任务信息
				processPct += taskWeight * SPLIT_WEIGHT
				stepParam.TaskPtr.ProcessPct = uint8(processPct)
				// 处理分割结果
				audioSegments[splitResultItem.Id].AudioFile = splitResultItem.Data
				// 发送转录任务
				pendingTranscriptionQueue <- DataWithId[string]{
					Data: splitResultItem.Data,
					Id:   splitResultItem.Id,
				}
			case transcribedItem := <-transcribedQueue:
				// 更新字幕任务信息
				processPct += taskWeight * TRANSCRIBE_WEIGHT
				stepParam.TaskPtr.ProcessPct = uint8(processPct)
				// 处理转录结果
				audioSegments[transcribedItem.Id].TranscriptionData = transcribedItem.Data
				// 发送翻译任务
				pendingTranslationQueue <- DataWithId[string]{
					Data: transcribedItem.Data.Text,
					Id:   transcribedItem.Id,
				}
			case translatedItems := <-translatedQueue:
				// 更新字幕任务信息
				processPct += taskWeight * TRANSLATE_WEIGHT
				stepParam.TaskPtr.ProcessPct = uint8(processPct)
				// 处理翻译结果，保存不带时间戳的原始字幕
				originNoTsSrtFileName := filepath.Join(stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, translatedItems.Id))
				originNoTsSrtFile, err := os.Create(originNoTsSrtFileName)
				if err != nil {
					return fmt.Errorf("audioToSubtitle audioToSrt create srt file err: %w", err)
				}
				// 保存不带时间戳的原始字幕
				for i, translatedItem := range translatedItems.Data {
					originNoTsSrtFile.WriteString(fmt.Sprintf("%d\n", i+1))
					originNoTsSrtFile.WriteString(fmt.Sprintf("[%s]\n", translatedItem.TranslatedText))
					originNoTsSrtFile.WriteString(fmt.Sprintf("[%s]\n\n", translatedItem.OriginText))
				}

				// 此处是为了修复一个未知原因的文件不创建的问题
				originNoTsSrtFile.Sync()
				originNoTsSrtFile.Close()
				audioSegments[translatedItems.Id].SrtNoTsFile = originNoTsSrtFileName
				// 生成时间戳
				srtBlocks := []*util.SrtBlock{}
				for i, translatedItem := range translatedItems.Data {
					srtBlocks = append(srtBlocks, &util.SrtBlock{
						Index:                  i + 1,
						Timestamp:              "",
						OriginLanguageSentence: translatedItem.OriginText,
						TargetLanguageSentence: translatedItem.TranslatedText,
					})
				}

				segmentIdx := translatedItems.Id

				err = generateSrtWithTimestamps(srtBlocks, timePoints[segmentIdx], audioSegments[segmentIdx].TranscriptionData.Words, segmentIdx, stepParam)
				if err != nil {
					return fmt.Errorf("audioToSubtitle audioToSrt generateTimestamps err: %w", err)
				}
				completedTasks++
				// 拆分、转录、翻译任务全部完成
				if completedTasks >= segmentNum {
					close(pendingSplitQueue)
					close(splitResultQueue)
					close(pendingTranscriptionQueue)
					close(transcribedQueue)
					close(pendingTranslationQueue)
					close(translatedQueue)
					return nil
				}
			}
		}
	})

	if err := eg.Wait(); err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt errgroup wait err", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt errgroup wait err: %w", err)
	}

	// 合并文件
	originNoTsFiles := make([]string, 0)
	bilingualFiles := make([]string, 0)
	shortOriginMixedFiles := make([]string, 0)
	shortOriginFiles := make([]string, 0)
	for i := range segmentNum {
		splitOriginNoTsFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, i))
		originNoTsFiles = append(originNoTsFiles, splitOriginNoTsFile)
		splitBilingualFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitBilingualSrtFileNamePattern, i))
		bilingualFiles = append(bilingualFiles, splitBilingualFile)
		shortOriginMixedFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginMixedSrtFileNamePattern, i))
		shortOriginMixedFiles = append(shortOriginMixedFiles, shortOriginMixedFile)
		shortOriginFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginSrtFileNamePattern, i))
		shortOriginFiles = append(shortOriginFiles, shortOriginFile)
	}

	// 合并原始无时间戳字幕
	originNoTsFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskSrtNoTimestampFileName)
	err = util.MergeFile(originNoTsFile, originNoTsFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt merge originNoTsFile err",
			zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt merge originNoTsFile err: %w", err)
	}

	// 合并最终双语字幕
	bilingualFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskBilingualSrtFileName)
	err = util.MergeSrtFiles(bilingualFile, bilingualFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt merge BilingualFile err",
			zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle audioToSrt merge BilingualFile err: %w", err)
	}

	//合并最终双语字幕 长中文+短英文
	shortOriginMixedFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskShortOriginMixedSrtFileName)
	err = util.MergeSrtFiles(shortOriginMixedFile, shortOriginMixedFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt merge shortOriginMixedFile err",
			zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSrt merge shortOriginMixedFile err: %w", err)
	}
	stepParam.ShortOriginMixedSrtFilePath = shortOriginMixedFile

	// 合并最终原始字幕 短英文
	shortOriginFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskShortOriginSrtFileName)
	err = util.MergeSrtFiles(shortOriginFile, shortOriginFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle audioToSrt mergeShortOriginFile err",
			zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSrt mergeShortOriginFile err: %w", err)
	}

	// 供后续分割单语使用
	stepParam.BilingualSrtFilePath = bilingualFile

	// 更新字幕任务信息
	stepParam.TaskPtr.ProcessPct = 90

	log.GetLogger().Info("audioToSubtitle.audioToSrt end", zap.Any("taskId", stepParam.TaskId))

	return nil
}

func splitSrt(stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.splitSrt start", zap.Any("task id", stepParam.TaskId))

	originLanguageSrtFilePath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskOriginLanguageSrtFileName)
	originLanguageTextFilePath := filepath.Join(stepParam.TaskBasePath, "output", types.SubtitleTaskOriginLanguageTextFileName)
	targetLanguageSrtFilePath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
	targetLanguageTextFilePath := filepath.Join(stepParam.TaskBasePath, "output", types.SubtitleTaskTargetLanguageTextFileName)
	// 打开双语字幕文件
	file, err := os.Open(stepParam.BilingualSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt open bilingual srt file error", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt open bilingual srt file error: %w", err)
	}
	defer file.Close()

	// 打开输出字幕和文稿文件
	originLanguageSrtFile, err := os.Create(originLanguageSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt create originLanguageSrtFile error", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt create originLanguageSrtFile error: %w", err)
	}
	defer originLanguageSrtFile.Close()

	originLanguageTextFile, err := os.Create(originLanguageTextFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt create originLanguageTextFile error", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt create originLanguageTextFile error: %w", err)
	}
	defer originLanguageTextFile.Close()

	targetLanguageSrtFile, err := os.Create(targetLanguageSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt create targetLanguageSrtFile error", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle.splitSrt create targetLanguageSrtFile error: %w", err)
	}
	defer targetLanguageSrtFile.Close()

	targetLanguageTextFile, err := os.Create(targetLanguageTextFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt create targetLanguageTextFile error", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle.splitSrt create targetLanguageTextFile error: %w", err)
	}
	defer targetLanguageTextFile.Close()

	isTargetOnTop := stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop

	scanner := bufio.NewScanner(file)
	var block []string

	for scanner.Scan() {
		line := scanner.Text()
		// 空行代表一个字幕块的结束
		if line == "" {
			if len(block) > 0 {
				util.ProcessBlock(block, targetLanguageSrtFile, targetLanguageTextFile, originLanguageSrtFile, originLanguageTextFile, isTargetOnTop)
				block = nil
			}
		} else {
			block = append(block, line)
		}
	}
	// 处理文件末尾的字幕块
	if len(block) > 0 {
		util.ProcessBlock(block, targetLanguageSrtFile, targetLanguageTextFile, originLanguageSrtFile, originLanguageTextFile, isTargetOnTop)
	}

	if err = scanner.Err(); err != nil {
		log.GetLogger().Error("audioToSubtitle splitSrt scan bilingual srt file error", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return fmt.Errorf("audioToSubtitle splitSrt scan bilingual srt file error: %w", err)
	}
	// 添加原语言单语字幕
	subtitleInfo := types.SubtitleFileInfo{
		Path:               originLanguageSrtFilePath,
		LanguageIdentifier: string(stepParam.OriginLanguage),
	}
	if stepParam.UserUILanguage == types.LanguageNameEnglish {
		subtitleInfo.Name = types.GetStandardLanguageName(stepParam.OriginLanguage) + " Subtitle"
	} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
		subtitleInfo.Name = types.GetStandardLanguageName(stepParam.OriginLanguage) + " 单语字幕"
	}
	stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
	// 添加目标语言单语字幕
	if stepParam.SubtitleResultType == types.SubtitleResultTypeTargetOnly || stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom || stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop {
		subtitleInfo = types.SubtitleFileInfo{
			Path:               targetLanguageSrtFilePath,
			LanguageIdentifier: string(stepParam.TargetLanguage),
		}
		if stepParam.UserUILanguage == types.LanguageNameEnglish {
			subtitleInfo.Name = types.GetStandardLanguageName(stepParam.TargetLanguage) + " Subtitle"
		} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
			subtitleInfo.Name = types.GetStandardLanguageName(stepParam.TargetLanguage) + " 单语字幕"
		}
		stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
	}
	// 添加双语字幕
	if stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop || stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom {
		subtitleInfo = types.SubtitleFileInfo{
			Path:               stepParam.BilingualSrtFilePath,
			LanguageIdentifier: "bilingual",
		}
		if stepParam.UserUILanguage == types.LanguageNameEnglish {
			subtitleInfo.Name = "Bilingual Subtitle"
		} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
			subtitleInfo.Name = "双语字幕"
		}
		stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
	}

	// 供生成配音使用
	stepParam.TtsSourceFilePath = stepParam.BilingualSrtFilePath

	log.GetLogger().Info("audioToSubtitle.splitSrt end", zap.Any("task id", stepParam.TaskId))
	return nil
}

func getSentenceTimestamps(words []types.Word, sentence string, lastTs float64, language types.StandardLanguageCode) (types.SrtSentence, []types.Word, float64, error) {
	var srtSt types.SrtSentence
	var sentenceWordList []string
	sentenceWords := make([]types.Word, 0)
	if language == types.LanguageNameEnglish || language == types.LanguageNameGerman || language == types.LanguageNameTurkish || language == types.LanguageNameRussian { // 处理方式不同
		sentenceWordList = util.SplitSentence(sentence)
		if len(sentenceWordList) == 0 {
			return srtSt, sentenceWords, 0, fmt.Errorf("getSentenceTimestamps sentence is empty")
		}

		thisLastTs := lastTs
		sentenceWordIndex := 0
		wordNow := words[sentenceWordIndex]
		for _, sentenceWord := range sentenceWordList {
			for sentenceWordIndex < len(words) {
				for sentenceWordIndex < len(words) && !strings.EqualFold(words[sentenceWordIndex].Text, sentenceWord) {
					sentenceWordIndex++
				}

				if sentenceWordIndex >= len(words) {
					break
				}

				wordNow = words[sentenceWordIndex]
				if wordNow.Start < thisLastTs {
					sentenceWordIndex++
					continue
				} else {
					break
				}
			}

			if sentenceWordIndex >= len(words) {
				sentenceWords = append(sentenceWords, types.Word{
					Text: sentenceWord,
				})
				sentenceWordIndex = 0
				continue
			}

			sentenceWords = append(sentenceWords, wordNow)
			sentenceWordIndex = 0
		}
		beginWordIndex, endWordIndex := findMaxIncreasingSubArray(sentenceWords)
		if (endWordIndex - beginWordIndex) == 0 {
			return srtSt, sentenceWords, 0, errors.New("getSentenceTimestamps no valid sentence")
		}

		// 找到最大连续子数组后，再去找整个句子开始和结束的时间戳
		beginWord := sentenceWords[beginWordIndex]
		endWord := sentenceWords[endWordIndex-1]
		if endWordIndex-beginWordIndex == len(sentenceWords) {
			srtSt.Start = beginWord.Start
			srtSt.End = endWord.End
			thisLastTs = endWord.End
			return srtSt, sentenceWords, thisLastTs, nil
		}

		if beginWordIndex > 0 {
			for i, j := beginWordIndex-1, beginWord.Num-1; i >= 0 && j >= 0; {
				if words[j].Text == "" {
					j--
					continue
				}
				if strings.EqualFold(words[j].Text, sentenceWords[i].Text) {
					beginWord = words[j]
					sentenceWords[i] = beginWord
				} else {
					break
				}

				i--
				j--
			}
		}

		if endWordIndex < len(sentenceWords) {
			for i, j := endWordIndex, endWord.Num+1; i < len(sentenceWords) && j < len(words); {
				if words[j].Text == "" {
					j++
					continue
				}
				if strings.EqualFold(words[j].Text, sentenceWords[i].Text) {
					endWord = words[j]
					sentenceWords[i] = endWord
				} else {
					break
				}

				i++
				j++
			}
		}

		if beginWord.Num > sentenceWords[0].Num && beginWord.Num-sentenceWords[0].Num < 10 {
			beginWord = sentenceWords[0]
		}

		if sentenceWords[len(sentenceWords)-1].Num > endWord.Num && sentenceWords[len(sentenceWords)-1].Num-endWord.Num < 10 {
			endWord = sentenceWords[len(sentenceWords)-1]
		}

		srtSt.Start = beginWord.Start
		if srtSt.Start < thisLastTs {
			srtSt.Start = thisLastTs
		}
		srtSt.End = endWord.End
		if beginWord.Num != endWord.Num && endWord.End > thisLastTs {
			thisLastTs = endWord.End
		}

		return srtSt, sentenceWords, thisLastTs, nil
	} else {
		sentenceWordList = strings.Split(util.GetRecognizableString(sentence), "")
		if len(sentenceWordList) == 0 {
			return srtSt, sentenceWords, 0, errors.New("getSentenceTimestamps sentence is empty")
		}

		// 这里的sentence words不是字面上连续的，而是可能有重复，可读连续的用下面的readable
		var readableSentenceWords []types.Word
		thisLastTs := lastTs
		sentenceWordIndex := 0
		wordNow := words[sentenceWordIndex]
		for _, sentenceWord := range sentenceWordList {
			for sentenceWordIndex < len(words) {
				if !strings.EqualFold(words[sentenceWordIndex].Text, sentenceWord) && !strings.HasPrefix(words[sentenceWordIndex].Text, sentenceWord) {
					sentenceWordIndex++
				} else {
					wordNow = words[sentenceWordIndex]
					if wordNow.Start >= thisLastTs {
						// 记录下来，但还要继续往后找
						sentenceWords = append(sentenceWords, wordNow)
					}
					sentenceWordIndex++
				}
			}
			// 当前sentenceWord已经找完了
			sentenceWordIndex = 0

		}
		// 对于sentence每个词，已经尝试找到了它的[]Word
		var beginWordIndex, endWordIndex int
		beginWordIndex, endWordIndex, readableSentenceWords = jumpFindMaxIncreasingSubArray(sentenceWords)
		if (endWordIndex - beginWordIndex) == 0 {
			return srtSt, readableSentenceWords, 0, errors.New("getSentenceTimestamps no valid sentence")
		}

		beginWord := sentenceWords[beginWordIndex]
		endWord := sentenceWords[endWordIndex]
		//sequence := util.FindClosestConsecutiveWords(words, sentence)
		//beginWord := sequence[0]
		//endWord := sequence[len(sequence)-1]

		srtSt.Start = beginWord.Start
		if srtSt.Start < thisLastTs {
			srtSt.Start = thisLastTs
		}
		srtSt.End = endWord.End
		if beginWord.Num != endWord.Num && endWord.End > thisLastTs {
			thisLastTs = endWord.End
		}

		return srtSt, readableSentenceWords, thisLastTs, nil
	}
}

// 找到 Num 值递增的最大连续子数组
func findMaxIncreasingSubArray(words []types.Word) (int, int) {
	if len(words) == 0 {
		return 0, 0
	}

	// 用于记录当前最大递增子数组的起始索引和长度
	maxStart, maxLen := 0, 1
	// 用于记录当前递增子数组的起始索引和长度
	currStart, currLen := 0, 1

	for i := 1; i < len(words); i++ {
		if words[i].Num == words[i-1].Num+1 {
			// 当前元素比前一个元素大，递增序列继续
			currLen++
		} else {
			// 递增序列结束，检查是否是最长的递增序列
			if currLen > maxLen {
				maxStart = currStart
				maxLen = currLen
			}
			// 重新开始新的递增序列
			currStart = i
			currLen = 1
		}
	}

	// 最后需要再检查一次，因为最大递增子数组可能在数组的末尾
	if currLen > maxLen {
		maxStart = currStart
		maxLen = currLen
	}

	// 返回最大递增子数组
	return maxStart, maxStart + maxLen
}

// 跳跃（非连续）找到 Num 值递增的最大子数组
func jumpFindMaxIncreasingSubArray(words []types.Word) (int, int, []types.Word) {
	if len(words) == 0 {
		return -1, -1, nil
	}

	if len(words) == 1 {
		return 0, 0, words
	}

	// dp[i] 表示以 words[i] 结束的递增子数组的长度
	dp := make([]int, len(words))
	// prev[i] 用来记录与当前递增子数组相连的前一个元素的索引
	prev := make([]int, len(words))

	// 初始化，所有的 dp[i] 都是 1，因为每个元素本身就是一个长度为 1 的子数组
	for i := range len(words) {
		dp[i] = 1
		prev[i] = -1
	}

	maxLen := 0
	startIdx := -1
	endIdx := -1

	// 遍历每一个元素
	for i := 1; i < len(words); i++ {
		// 对比每个元素与之前的元素，检查是否可以构成递增子数组
		for j := 0; j < i; j++ {
			if words[i].Num == words[j].Num+1 {
				if dp[i] < dp[j]+1 {
					dp[i] = dp[j] + 1
					prev[i] = j
				}
			}
		}

		// 更新最大子数组长度和索引
		if dp[i] > maxLen {
			maxLen = dp[i]
			endIdx = i
		}
	}

	// 如果未找到递增子数组，直接返回
	if endIdx == -1 {
		return -1, -1, nil
	}

	// 回溯找到子数组的起始索引
	startIdx = endIdx
	for prev[startIdx] != -1 {
		startIdx = prev[startIdx]
	}

	// 构造结果子数组
	result := make([]types.Word, 0, maxLen)
	current := endIdx
	for current != -1 {
		result = append(result, words[current])
		current = prev[current]
	}

	// 由于是从后往前构造的子数组，需要反转
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return startIdx, endIdx, result
}

func generateSrtWithTimestamps(srtBlocks []*util.SrtBlock, tsOffset float64, words []types.Word, segmentIdx int, stepParam *types.SubtitleTaskStepParam) error {
	if len(srtBlocks) == 0 || len(words) == 0 {
		return nil
	}

	// 获取每个字幕块的时间戳
	var lastTs float64
	shortOriginSrtMap := make(map[int][]util.SrtBlock, 0)
	for _, srtBlock := range srtBlocks {
		if srtBlock.OriginLanguageSentence == "" {
			continue
		}
		sentenceTs, sentenceWords, ts, err := getSentenceTimestamps(words, srtBlock.OriginLanguageSentence, lastTs, stepParam.OriginLanguage)
		if err != nil || ts < lastTs {
			continue
		}
		srtBlock.Timestamp = fmt.Sprintf("%s --> %s", util.FormatTime(float32(sentenceTs.Start+tsOffset)), util.FormatTime(float32(sentenceTs.End+tsOffset)))

		// 生成短句子的英文字幕
		var (
			originSentence string
			startWord      types.Word
			endWord        types.Word
		)

		if len(sentenceWords) <= stepParam.MaxWordOneLine {
			shortOriginSrtMap[srtBlock.Index] = append(shortOriginSrtMap[srtBlock.Index], util.SrtBlock{
				Index:                  srtBlock.Index,
				Timestamp:              fmt.Sprintf("%s --> %s", util.FormatTime(float32(sentenceTs.Start+tsOffset)), util.FormatTime(float32(sentenceTs.End+tsOffset))),
				OriginLanguageSentence: srtBlock.OriginLanguageSentence,
			})
			lastTs = ts
			continue
		}

		thisLineWord := stepParam.MaxWordOneLine
		if len(sentenceWords) > stepParam.MaxWordOneLine && len(sentenceWords) <= 2*stepParam.MaxWordOneLine {
			thisLineWord = len(sentenceWords)/2 + 1
		} else if len(sentenceWords) > 2*stepParam.MaxWordOneLine && len(sentenceWords) <= 3*stepParam.MaxWordOneLine {
			thisLineWord = len(sentenceWords)/3 + 1
		} else if len(sentenceWords) > 3*stepParam.MaxWordOneLine && len(sentenceWords) <= 4*stepParam.MaxWordOneLine {
			thisLineWord = len(sentenceWords)/4 + 1
		} else if len(sentenceWords) > 4*stepParam.MaxWordOneLine && len(sentenceWords) <= 5*stepParam.MaxWordOneLine {
			thisLineWord = len(sentenceWords)/5 + 1
		}

		i := 1
		nextStart := true
		for _, word := range sentenceWords {
			if nextStart {
				startWord = word
				if startWord.Start < lastTs {
					startWord.Start = lastTs
				}
				if startWord.Start < endWord.End {
					startWord.Start = endWord.End
				}

				if startWord.Start < sentenceTs.Start {
					startWord.Start = sentenceTs.Start
				}
				// 首个单词的开始时间戳大于句子的结束时间戳，说明这个单词找错了，放弃掉
				if startWord.End > sentenceTs.End {
					originSentence += word.Text + " "
					continue
				}
				originSentence += word.Text + " "
				endWord = startWord
				i++
				nextStart = false
				continue
			}

			originSentence += word.Text + " "
			if endWord.End < word.End {
				endWord = word
			}

			if endWord.End > sentenceTs.End {
				endWord.End = sentenceTs.End
			}

			if i%thisLineWord == 0 && i > 1 {
				shortOriginSrtMap[srtBlock.Index] = append(shortOriginSrtMap[srtBlock.Index], util.SrtBlock{
					Index:                  srtBlock.Index,
					Timestamp:              fmt.Sprintf("%s --> %s", util.FormatTime(float32(startWord.Start+tsOffset)), util.FormatTime(float32(endWord.End+tsOffset))),
					OriginLanguageSentence: originSentence,
				})
				originSentence = ""
				nextStart = true
			}
			i++
		}

		if originSentence != "" {
			shortOriginSrtMap[srtBlock.Index] = append(shortOriginSrtMap[srtBlock.Index], util.SrtBlock{
				Index:                  srtBlock.Index,
				Timestamp:              fmt.Sprintf("%s --> %s", util.FormatTime(float32(startWord.Start+tsOffset)), util.FormatTime(float32(endWord.End+tsOffset))),
				OriginLanguageSentence: originSentence,
			})
		}
		lastTs = ts
	}

	// 保存带时间戳的原始字幕
	finalBilingualSrtFileName := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitBilingualSrtFileNamePattern, segmentIdx))
	finalBilingualSrtFile, err := os.Create(finalBilingualSrtFileName)
	if err != nil {
		return fmt.Errorf("audioToSubtitle generateTimestamps create bilingual srt file error: %w", err)
	}
	defer finalBilingualSrtFile.Close()

	// 写入字幕文件
	for _, srtBlock := range srtBlocks {
		_, _ = finalBilingualSrtFile.WriteString(fmt.Sprintf("%d\n", srtBlock.Index))
		_, _ = finalBilingualSrtFile.WriteString(srtBlock.Timestamp + "\n")
		if stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop {
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.TargetLanguageSentence + "\n")
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.OriginLanguageSentence + "\n\n")
		} else {
			// on bottom 或者单语类型，都用on bottom
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.OriginLanguageSentence + "\n")
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.TargetLanguageSentence + "\n\n")
		}
	}

	// 保存带时间戳的字幕,长中文+短英文（示意，也支持其他语言）
	srtShortOriginMixedFileName := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginMixedSrtFileNamePattern, segmentIdx))
	srtShortOriginMixedFile, err := os.Create(srtShortOriginMixedFileName)
	if err != nil {
		return fmt.Errorf("audioToSubtitle generateTimestamps create srtShortOriginMixedFile err: %w", err)
	}
	defer srtShortOriginMixedFile.Close()

	// 保存带时间戳的短英文字幕
	srtShortOriginFileName := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitShortOriginSrtFileNamePattern, segmentIdx))
	srtShortOriginFile, err := os.Create(srtShortOriginFileName)
	if err != nil {
		return fmt.Errorf("audioToSubtitle generateTimestamps create srtShortOriginFile err: %w", err)
	}
	defer srtShortOriginMixedFile.Close()

	mixedSrtNum := 1
	shortSrtNum := 1
	// 写入短英文混合字幕文件
	for _, srtBlock := range srtBlocks {
		srtShortOriginMixedFile.WriteString(fmt.Sprintf("%d\n", mixedSrtNum))
		srtShortOriginMixedFile.WriteString(srtBlock.Timestamp + "\n")
		srtShortOriginMixedFile.WriteString(srtBlock.TargetLanguageSentence + "\n\n")
		mixedSrtNum++
		shortOriginSentence := shortOriginSrtMap[srtBlock.Index]
		for _, shortOriginBlock := range shortOriginSentence {
			srtShortOriginMixedFile.WriteString(fmt.Sprintf("%d\n", mixedSrtNum))
			srtShortOriginMixedFile.WriteString(shortOriginBlock.Timestamp + "\n")
			srtShortOriginMixedFile.WriteString(shortOriginBlock.OriginLanguageSentence + "\n\n")
			mixedSrtNum++

			srtShortOriginFile.WriteString(fmt.Sprintf("%d\n", shortSrtNum))
			srtShortOriginFile.WriteString(shortOriginBlock.Timestamp + "\n")
			srtShortOriginFile.WriteString(shortOriginBlock.OriginLanguageSentence + "\n\n")
			shortSrtNum++
		}
	}

	return nil
}

func parseAndCheckContent(splitContent, originalText string) ([]TranslatedItem, error) {
	result := []TranslatedItem{}

	// 处理空内容情况
	if splitContent == "" || originalText == "" {
		if splitContent == originalText {
			return result, nil
		} else if splitContent == "" {
			return nil, fmt.Errorf("splitContent is empty but originalText is not, originalText: " + originalText)
		} else {
			return nil, errors.New("originalText is empty but splitContent is not, splitContent: " + splitContent)
		}
	}

	// 处理无文本标记
	if strings.Contains(splitContent, "[无文本]") {
		// 检查原始文本是否是音乐标记或类似内容
		lowerOriginal := strings.ToLower(strings.TrimSpace(originalText))
		if len(lowerOriginal) < 30 && (strings.Contains(lowerOriginal, "music") ||
			strings.Contains(lowerOriginal, "playing") ||
			strings.Contains(lowerOriginal, "♪") ||
			strings.Contains(lowerOriginal, "♫") ||
			len(lowerOriginal) < 10) {
			// 如果原始文本是音乐标记或很短，则返回空结果
			return result, nil
		} else {
			// 记录警告但不返回错误，允许处理继续
			log.GetLogger().Warn("originalText might contain actual content but splitContent contains [无文本]",
				zap.String("originalText", originalText),
				zap.String("splitContent", splitContent))
			return result, nil
		}
	}

	lines := strings.Split(splitContent, "\n")
	if len(lines) < 3 { // 至少需要一个完整的块
		log.GetLogger().Error("audioToSubtitle invaild Format, not enough lines", zap.Any("splitContent", splitContent))
		return nil, fmt.Errorf("audioToSubtitle invaild Format, not enough lines")
	}

	// 验证格式并提取原文
	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}

		// 检查是否为序号行
		if _, err := strconv.Atoi(line); err != nil {
			continue
		}

		if i+2 >= len(lines) {
			log.GetLogger().Error("audioToSubtitle invaild Format, block is not complete", zap.Any("splitContent", splitContent), zap.Any("line", line))
			return nil, fmt.Errorf("audioToSubtitle invaild Format, block is not complete")
		}
		// 获取翻译行和原文行
		translatedLine := strings.TrimSpace(lines[i+1])
		translatedLine = strings.TrimPrefix(translatedLine, "[")
		translatedLine = strings.TrimSuffix(translatedLine, "]")
		originalLine := strings.TrimSpace(lines[i+2])
		originalLine = strings.TrimPrefix(originalLine, "[")
		originalLine = strings.TrimSuffix(originalLine, "]")
		result = append(result, TranslatedItem{
			OriginText:     originalLine,
			TranslatedText: translatedLine,
		})
		i += 2 // 跳过翻译行和原文行
	}

	// 合并原文并比较字数
	combinedLength := 0
	for _, translatedItem := range result {
		combinedLength += len(strings.TrimSpace(translatedItem.OriginText))
	}
	originalTextLength := len(strings.TrimSpace(originalText))

	lenError := originalTextLength - combinedLength
	if lenError < 0 {
		lenError = -lenError
	}

	if lenError > len(originalText)/10 {
		// return nil, fmt.Errorf("audioToSubtitle invaild Format, originalText and splitContent length not match", zap.Any("splitContent", splitContent), zap.Any("originalText", originalText))
		log.GetLogger().Warn("audioToSubtitle invaild Format, originalText and splitContent length not match", zap.Any("splitContent", splitContent), zap.Any("originalText", originalText))
	}
	return result, nil
}

// calcLength 计算文本视觉长度
func calcLength(text string) float64 {
	var length float64
	for _, r := range text {
		code := r
		switch {
		case (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3040 && code <= 0x30FF): // 中日文
			length += 1.75
		case (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0x1100 && code <= 0x11FF): // 韩文
			length += 1.5
		case code >= 0x0E00 && code <= 0x0E7F: // 泰文
			length += 1
		case code >= 0xFF01 && code <= 0xFF5E: // 全角符号
			length += 1.75
		default: // 其他字符（英文等）
			length += 1
		}
	}
	return length
}

// splitTranslateItem 根据字符权重和最大长度分割长句
func (s Service) splitTranslateItem(items []TranslatedItem) ([]TranslatedItem, error) {
	var result []TranslatedItem
	maxLength := 70 // todo 先写死
	//targetMultiplier := config.Conf.Subtitle.TargetMultiplier

	for _, item := range items {
		// 计算翻译文本的加权长度
		if calcLength(item.OriginText) <= float64(maxLength) && calcLength(item.TranslatedText) <= float64(maxLength) {
			result = append(result, item)
			continue
		}

		// 调用大模型进行分割
		log.GetLogger().Info("splitTranslateItem long sentence detected, need split", zap.Any("item", item))
		splitItems, err := s.splitLongSentence(item)
		if err != nil {
			log.GetLogger().Error("splitTranslateItem splitLongSentence error", zap.Error(err), zap.Any("item", item))
			return nil, fmt.Errorf("split long sentence error: %w", err)
		}
		result = append(result, splitItems...)
	}

	return result, nil
}

// splitLongSentence 使用大模型分割长句并保持原文和译文对齐
func (s Service) splitLongSentence(item TranslatedItem) ([]TranslatedItem, error) {
	prompt := fmt.Sprintf(types.SplitLongSentencePrompt, item.OriginText, item.TranslatedText)

	response, err := s.ChatCompleter.ChatCompletion(prompt)
	if err != nil {
		return nil, fmt.Errorf("chat completion error: %w", err)
	}

	var splitResult struct {
		Align []struct {
			OriginPart     string `json:"origin_part"`
			TranslatedPart string `json:"translated_part"`
		} `json:"align"`
	}
	if err := json.Unmarshal([]byte(util.CleanMarkdownCodeBlock(response)), &splitResult); err != nil {
		log.GetLogger().Error("splitLongSentence parse split result error", zap.Error(err), zap.Any("response", response))
		return nil, fmt.Errorf("parse split result error: %w", err)
	}

	// 转换为TranslatedItem切片
	var splitItems []TranslatedItem
	for _, part := range splitResult.Align {
		splitItems = append(splitItems, TranslatedItem{
			OriginText:     part.OriginPart,
			TranslatedText: part.TranslatedPart,
		})
	}

	return splitItems, nil
}
