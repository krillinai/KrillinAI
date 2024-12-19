package service

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"github.com/samber/lo"
	ffmpeg "github.com/u2takey/ffmpeg-go"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
	"krillin-ai/config"
	"krillin-ai/internal/dto"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/openai"
	"krillin-ai/pkg/util"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

func (s Service) StartSubtitleTask(req dto.StartVideoSubtitleTaskReq) (*dto.StartVideoSubtitleTaskResData, error) {
	// 校验链接
	if strings.Contains(req.Url, "youtube.com") {
		videoId, _ := util.GetYouTubeID(req.Url)
		if videoId == "" {
			return nil, fmt.Errorf("链接不合法")
		}
	}
	if strings.Contains(req.Url, "bilibili.com") {
		videoId := util.GetBilibiliVideoId(req.Url)
		if videoId == "" {
			return nil, fmt.Errorf("链接不合法")
		}
	}
	// 生成任务id
	taskId := util.GenerateRandStringWithUpperLowerNum(8)
	// 构造任务所需参数
	var resultType types.SubtitleResultType
	// 根据入参选项确定要返回的字幕类型
	if req.TargetLang == "none" {
		resultType = types.SubtitleResultTypeOriginOnly
	} else {
		if req.Bilingual == types.SubtitleTaskBilingualYes {
			if req.TranslationSubtitlePos == types.SubtitleTaskTranslationSubtitlePosTop {
				resultType = types.SubtitleResultTypeBilingualTranslationOnTop
			} else {
				resultType = types.SubtitleResultTypeBilingualTranslationOnBottom
			}
		} else {
			resultType = types.SubtitleResultTypeTargetOnly
		}
	}
	// 文字替换map
	replaceWordsMap := make(map[string]string)
	if len(req.Replace) > 0 {
		for _, replace := range req.Replace {
			beforeAfter := strings.Split(replace, "|")
			if len(beforeAfter) == 2 {
				replaceWordsMap[beforeAfter[0]] = beforeAfter[1]
			} else {
				log.GetLogger().Info("generateAudioSubtitles replace param length err", zap.Any("replace", replace), zap.Any("taskId", taskId))
			}
		}
	}
	var err error
	ctx := context.Background()
	// 创建字幕任务文件夹
	taskBasePath := filepath.Join("./tasks", taskId)
	if _, err = os.Stat(taskBasePath); os.IsNotExist(err) {
		// 不存在则创建
		err = os.MkdirAll(taskBasePath, os.ModePerm)
		if err != nil {
			log.GetLogger().Error("StartVideoSubtitleTask MkdirAll err", zap.Any("req", req), zap.Error(err))
		}
	}

	// 创建任务
	storage.SubtitleTasks[taskId] = &types.SubtitleTask{
		TaskId:   taskId,
		VideoSrc: req.Url,
		Status:   types.SubtitleTaskStatusProcessing,
	}
	stepParam := types.SubtitleTaskStepParam{
		TaskId:             taskId,
		TaskBasePath:       taskBasePath,
		Link:               req.Url,
		SubtitleResultType: resultType,
		EnableModalFilter:  req.ModalFilter == types.SubtitleTaskModalFilterYes,
		//EnableTts:          req.Tts,
		ReplaceWordsMap: replaceWordsMap,
		OriginLanguage:  types.StandardLanguageName(req.OriginLanguage),
		TargetLanguage:  types.StandardLanguageName(req.TargetLang),
		UserUILanguage:  types.StandardLanguageName(req.Language),
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				const size = 64 << 10
				buf := make([]byte, size)
				buf = buf[:runtime.Stack(buf, false)]
				log.GetLogger().Error("autoVideoSubtitle panic", zap.Any("panic:", r), zap.Any("stack:", buf))
				storage.SubtitleTasks[taskId].Status = types.SubtitleTaskStatusFailed
			}
		}()
		log.GetLogger().Info("video subtitle start task", zap.String("taskId", taskId))
		err = s.linkToAudioFile(ctx, &stepParam)
		if err != nil {
			log.GetLogger().Error("StartVideoSubtitleTask linkToAudioFile err", zap.Any("req", req), zap.Error(err))
			storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusFailed
			storage.SubtitleTasks[stepParam.TaskId].FailReason = "link to audio error"
			return
		}
		err = s.getVideoInfo(ctx, &stepParam)
		if err != nil {
			log.GetLogger().Error("StartVideoSubtitleTask getVideoInfo err", zap.Any("req", req), zap.Error(err))
			storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusFailed
			storage.SubtitleTasks[stepParam.TaskId].FailReason = "get video info error"
			return
		}
		err = s.audioToSubtitle(ctx, &stepParam)
		if err != nil {
			log.GetLogger().Error("StartVideoSubtitleTask audioToSubtitle err", zap.Any("req", req), zap.Error(err))
			storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusFailed
			storage.SubtitleTasks[stepParam.TaskId].FailReason = "audio to subtitle error"
			return
		}
		//err = s.srtFileToSpeech(ctx, &stepParam)
		//if err != nil {
		//	//zap.Default().Error("StartVideoSubtitleTask srtFileToSpeech err", zap.Any("req", req), zap.FieldErr(err))
		//	storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusFailed
		//	storage.SubtitleTasks[stepParam.TaskId].FailReason = "srt file to speech error"
		//	return
		//}
		err = s.uploadSubtitles(ctx, &stepParam)
		if err != nil {
			log.GetLogger().Error("StartVideoSubtitleTask uploadSubtitles err", zap.Any("req", req), zap.Error(err))
			storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusFailed
			storage.SubtitleTasks[stepParam.TaskId].FailReason = "upload subtitles error"
			return
		}

		log.GetLogger().Info("video subtitle task end", zap.String("taskId", taskId))
	}()

	return &dto.StartVideoSubtitleTaskResData{
		TaskId: taskId,
	}, nil
}

func (s Service) GetTaskStatus(req dto.GetVideoSubtitleTaskReq) (*dto.GetVideoSubtitleTaskResData, error) {
	task := storage.SubtitleTasks[req.TaskId]
	if task == nil {
		return nil, errors.New("任务不存在")
	}
	return &dto.GetVideoSubtitleTaskResData{
		TaskId:         task.TaskId,
		ProcessPercent: task.ProcessPct,
		VideoInfo: &dto.VideoInfo{
			Title:                 task.Title,
			Description:           task.Description,
			TranslatedTitle:       task.TranslatedTitle,
			TranslatedDescription: task.TranslatedDescription,
		},
		SubtitleInfo: lo.Map(task.SubtitleInfos, func(item types.SubtitleInfo, _ int) *dto.SubtitleInfo {
			return &dto.SubtitleInfo{
				Name:        item.Name,
				DownloadUrl: item.DownloadUrl,
			}
		}),
		TargetLanguage:    task.TargetLanguage,
		SpeechDownloadUrl: task.SpeechDownloadUrl,
	}, nil
}

// 新版流程：链接->本地音频文件->扣费->视频信息获取（若有）->本地字幕文件->cos上的字幕信息

func (s Service) linkToAudioFile(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var err error
	link := stepParam.Link
	audioPath := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskAudioFileName)
	if strings.Contains(link, "cdn.krillin.ai") {
		// todo
	} else if strings.Contains(link, "youtube.com") {
		var videoId string
		videoId, err = util.GetYouTubeID(link)
		if err != nil {
			log.GetLogger().Error("linkToAudioFile.GetYouTubeID err", zap.Any("step param", stepParam), zap.Error(err))
			return err
		}
		stepParam.Link = "https://www.youtube.com/watch?v=" + videoId
		// 使用 yt-dlp 下载音频并保存到指定目录
		cmdArgs := []string{"-f", "bestaudio", "--extract-audio", "--audio-format", "mp3", "--audio-quality", "192K", "-o", audioPath, stepParam.Link}

		cmdArgs = append(cmdArgs, "--cookies", "./cookies.txt")
		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		err = cmd.Run()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.Step2DownloadAudio yt-dlp err", zap.Any("step param", stepParam), zap.Error(err))
			return err
		}
	} else if strings.Contains(link, "bilibili.com") {
		videoId := util.GetBilibiliVideoId(link)
		if videoId == "" {
			return errors.New("invalid link")
		}
		stepParam.Link = "https://www.bilibili.com/video/" + videoId
		cmdArgs := []string{"-f", "bestaudio[ext=m4a]", "-x", "--audio-format", "mp3", "-o", audioPath, stepParam.Link}
		//proxy := conf.GetString("subtitle.proxy")
		//if proxy != "" {
		//	cmdArgs = append(cmdArgs, "--proxy", proxy)
		//}
		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		err = cmd.Run()
		if err != nil {
			log.GetLogger().Error("generateAudioSubtitles.Step2DownloadAudio yt-dlp err", zap.Any("step param", stepParam), zap.Error(err))
			return err
		}
	} else {
		log.GetLogger().Info("linkToAudioFile.unsupported link type", zap.Any("step param", stepParam))
		return errors.New("invalid link")
	}
	stepParam.AudioFilePath = audioPath
	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 6
	return nil
}

func (s Service) getVideoInfo(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	link := stepParam.Link
	if strings.Contains(link, "youtube.com") || strings.Contains(link, "bilibili.com") {
		var (
			err                error
			title, description string
		)
		// 获取标题
		titleCmdArgs := []string{"--skip-download", "--encoding", "utf-8", "--get-title", stepParam.Link}
		descriptionCmdArgs := []string{"--skip-download", "--encoding", "utf-8", "--get-description", stepParam.Link}
		//proxy := conf.GetString("subtitle.proxy")
		//if proxy != "" {
		//	titleCmdArgs = append(titleCmdArgs, "--proxy", proxy)
		//	descriptionCmdArgs = append(descriptionCmdArgs, "--proxy", proxy)
		//	titleCmdArgs = append(titleCmdArgs, "--cookies", "./cookies.txt")
		//	descriptionCmdArgs = append(descriptionCmdArgs, "--cookies", "./cookies.txt")
		//}
		titleCmdArgs = append(titleCmdArgs, "--cookies", "./cookies.txt")
		descriptionCmdArgs = append(descriptionCmdArgs, "--cookies", "./cookies.txt")
		cmd := exec.Command(storage.YtdlpPath, titleCmdArgs...)
		var output []byte
		output, err = cmd.Output()
		if err != nil {
			log.GetLogger().Error("getVideoInfo yt-dlp error", zap.Any("stepParam", stepParam), zap.Error(err))
			// 不需要整个流程退出
		}
		title = string(output)
		cmd = exec.Command(storage.YtdlpPath, descriptionCmdArgs...)
		output, err = cmd.Output()
		if err != nil {
			log.GetLogger().Error("getVideoInfo yt-dlp error", zap.Any("stepParam", stepParam), zap.Error(err))
		}
		description = string(output)
		log.GetLogger().Debug("getVideoInfo title and description", zap.String("title", title), zap.String("description", description))
		// 翻译
		var result string
		result, err = s.OpenaiClient.ChatCompletion(fmt.Sprintf(types.TranslateVideoTitleAndDescriptionPrompt, types.GetStandardLanguageName(stepParam.TargetLanguage), title+"####"+description))
		if err != nil {
			log.GetLogger().Error("getVideoInfo openai chat completion error", zap.Any("stepParam", stepParam), zap.Error(err))
		}
		log.GetLogger().Debug("getVideoInfo translate video info result", zap.String("result", result))

		storage.SubtitleTasks[stepParam.TaskId].Title = title
		storage.SubtitleTasks[stepParam.TaskId].Description = description
		storage.SubtitleTasks[stepParam.TaskId].OriginLanguage = string(stepParam.OriginLanguage)
		storage.SubtitleTasks[stepParam.TaskId].TargetLanguage = string(stepParam.TargetLanguage)
		storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 10
		splitResult := strings.Split(result, "####")
		if len(splitResult) == 1 {
			storage.SubtitleTasks[stepParam.TaskId].TranslatedTitle = splitResult[0]
		} else if len(splitResult) == 2 {
			storage.SubtitleTasks[stepParam.TaskId].TranslatedTitle = splitResult[0]
			storage.SubtitleTasks[stepParam.TaskId].TranslatedDescription = splitResult[1]
		} else {
			log.GetLogger().Error("getVideoInfo translate video info error split result length != 1 and 2", zap.Any("stepParam", stepParam), zap.Any("translate result", result), zap.Error(err))
		}
	}
	return nil
}

func (s Service) audioToSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	var err error
	err = s.splitAudio(ctx, stepParam)
	if err != nil {
		return err
	}
	err = s.audioToSrt(ctx, stepParam) // 这里进度更新到90%了
	if err != nil {
		return err
	}
	err = s.splitSrt(ctx, stepParam)
	if err != nil {
		return err
	}
	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 95
	return nil
}

func (s Service) uploadSubtitles(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	subtitleInfos := make([]types.SubtitleInfo, 0)
	var err error
	for _, info := range stepParam.SubtitleInfos {
		srcFile := info.Path
		if len(stepParam.ReplaceWordsMap) > 0 { // 需要进行替换
			replacedSrcFile := util.AddSuffixToFileName(srcFile, "_replaced")
			err = util.ReplaceFileContent(srcFile, replacedSrcFile, stepParam.ReplaceWordsMap)
			if err != nil {
				log.GetLogger().Error("generateAudioSubtitles.uploadSubtitles ReplaceFileContent err", zap.Any("stepParam", stepParam), zap.Error(err))
				return err
			}
			srcFile = replacedSrcFile
		}
		subtitleInfos = append(subtitleInfos, types.SubtitleInfo{
			TaskId:      stepParam.TaskId,
			Name:        info.Name,
			DownloadUrl: srcFile,
		})
	}
	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].SubtitleInfos = subtitleInfos
	storage.SubtitleTasks[stepParam.TaskId].Status = types.SubtitleTaskStatusSuccess
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 100
	// 配音文件
	if stepParam.TtsResultFilePath != "" {
		storage.SubtitleTasks[stepParam.TaskId].SpeechDownloadUrl = stepParam.TtsResultFilePath
	}
	return nil
}

func (s Service) splitAudio(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.splitAudio start", zap.String("task id", stepParam.TaskId))
	var err error
	// 使用ffmpeg-go分割音频
	outputPattern := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskSplitAudioFileNamePattern) // 输出文件格式
	segmentDuration := config.Conf.App.SegmentDuration * 60                                             // 每段的时长
	err = ffmpeg.Input(stepParam.AudioFilePath).
		Output(outputPattern, ffmpeg.KwArgs{
			"f":                "segment",       // 设置输出文件类型为分段
			"segment_time":     segmentDuration, // 设置每段的时长(以秒为单位)
			"reset_timestamps": "1",             // 重置每段的时间戳
		}).OverWriteOutput().ErrorToStdOut().Run()

	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitAudio ffmpeg err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}

	// 获取分割后的文件列表
	audioFiles, err := filepath.Glob(filepath.Join(stepParam.TaskBasePath, fmt.Sprintf("%s_*.mp3", types.SubtitleTaskSplitAudioFileNamePrefix)))
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitAudio filepath.Glob err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}
	if len(audioFiles) == 0 {
		log.GetLogger().Error("audioToSubtitle.splitAudio no audio files found", zap.Any("stepParam", stepParam))
		return errors.New("no audio files found")
	}

	num := 1
	for _, audioFile := range audioFiles {
		stepParam.SmallAudios = append(stepParam.SmallAudios, &types.SmallAudio{
			AudioFile: audioFile,
			Num:       num,
		})
		num++
	}

	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 20

	log.GetLogger().Info("audioToSubtitle.splitAudio end", zap.String("task id", stepParam.TaskId))
	return nil
}

func (s Service) audioToSrt(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.audioToSrt start", zap.Any("taskId", stepParam.TaskId))
	var (
		stepNum             = 0
		parallelControlChan = make(chan struct{}, config.Conf.App.TranslateParallelNum)
		eg                  errgroup.Group
		stepNumMu           sync.Mutex
		err                 error
	)
	for _, audioFileItem := range stepParam.SmallAudios {
		parallelControlChan <- struct{}{}
		audioFile := audioFileItem
		eg.Go(func() error {
			defer func() {
				<-parallelControlChan
			}()
			// 语音转文字
			var transcriptionData *openai.TranscriptionData
			for i := 0; i < 3; i++ {
				language := string(stepParam.OriginLanguage)
				if language == "zh_cn" {
					language = "zh" // 切换一下
				}
				transcriptionData, err = s.OpenaiClient.Transcription(audioFile.AudioFile, language)
				if err == nil {
					break
				}
			}
			if err != nil {
				log.GetLogger().Error("audioToSubtitle.audioToSrt.Transcription err", zap.Any("stepParam", stepParam), zap.Error(err))
				return err
			}

			audioFile.TranscriptionData = transcriptionData

			// 更新字幕任务信息
			stepNumMu.Lock()
			stepNum++
			processPct := uint8(20 + 70*stepNum/(len(stepParam.SmallAudios)*2))
			stepNumMu.Unlock()
			storage.SubtitleTasks[stepParam.TaskId].ProcessPct = processPct

			// 拆分字幕并翻译
			err = s.splitTextAndTranslate(stepParam.TaskId, stepParam.TaskBasePath, stepParam.TargetLanguage, stepParam.EnableModalFilter, audioFile)
			if err != nil {
				log.GetLogger().Error("audioToSubtitle.audioToSrt.splitTextAndTranslate err", zap.Any("stepParam", stepParam), zap.Error(err))
				return err
			}

			stepNumMu.Lock()
			stepNum++
			processPct = uint8(20 + 70*stepNum/(len(stepParam.SmallAudios)*2))
			stepNumMu.Unlock()

			storage.SubtitleTasks[stepParam.TaskId].ProcessPct = processPct

			// 生成时间戳
			err = s.generateTimestamps(stepParam.TaskId, stepParam.TaskBasePath, stepParam.OriginLanguage, stepParam.SubtitleResultType, audioFile)
			if err != nil {
				log.GetLogger().Error("audioToSubtitle.audioToSrt.generateTimestamps err", zap.Any("stepParam", stepParam), zap.Error(err))
				return err
			}
			return nil
		})
	}

	if err = eg.Wait(); err != nil {
		log.GetLogger().Error("audioToSubtitle.audioToSrt.eg.Wait err", zap.Any("taskId", stepParam.TaskId), zap.Error(err))
		return err
	}

	// 合并文件
	originNoTsFiles := make([]string, 0)
	bilingualFiles := make([]string, 0)
	for i := 1; i <= len(stepParam.SmallAudios); i++ {
		splitOriginNoTsFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, i))
		originNoTsFiles = append(originNoTsFiles, splitOriginNoTsFile)
		splitBilingualFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, fmt.Sprintf(types.SubtitleTaskSplitBilingualSrtFileNamePattern, i))
		bilingualFiles = append(bilingualFiles, splitBilingualFile)
	}

	// 合并原始无时间戳字幕
	originNoTsFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskSrtNoTimestampFileName)
	err = util.MergeFile(originNoTsFile, originNoTsFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.audioToSrt.MergeFile originNoTs err",
			zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}

	// 合并最终双语字幕
	bilingualFile := fmt.Sprintf("%s/%s", stepParam.TaskBasePath, types.SubtitleTaskBilingualSrtFileName)
	err = util.MergeSrtFiles(bilingualFile, bilingualFiles...)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.audioToSrt.MergeFile ts err",
			zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}

	// 供后续分割单语使用
	stepParam.BilingualSrtFilePath = bilingualFile

	// 更新字幕任务信息
	storage.SubtitleTasks[stepParam.TaskId].ProcessPct = 90

	log.GetLogger().Info("audioToSubtitle.audioToSrt end", zap.Any("taskId", stepParam.TaskId))

	return nil
}

func (s Service) splitSrt(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	log.GetLogger().Info("audioToSubtitle.splitSrt start", zap.Any("task id", stepParam.TaskId))

	originLanguageSrtFilePath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskOriginLanguageSrtFileName)
	targetLanguageSrtFilePath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
	// 打开双语字幕文件
	file, err := os.Open(stepParam.BilingualSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt os.Open err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}
	defer file.Close()

	// 打开输出文件
	originLanguageSrtFile, err := os.Create(originLanguageSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt os.Create originLanguageSrtFile err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}
	defer originLanguageSrtFile.Close()
	targetLanguageSrtFile, err := os.Create(targetLanguageSrtFilePath)
	if err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt os.Create targetLanguageSrtFile err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
	}
	defer targetLanguageSrtFile.Close()

	isTargetOnTop := stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop

	scanner := bufio.NewScanner(file)
	var block []string

	for scanner.Scan() {
		line := scanner.Text()
		// 空行代表一个字幕块的结束
		if line == "" {
			if len(block) > 0 {
				util.ProcessBlock(block, targetLanguageSrtFile, originLanguageSrtFile, isTargetOnTop)
				block = nil
			}
		} else {
			block = append(block, line)
		}
	}
	// 处理文件末尾的字幕块
	if len(block) > 0 {
		util.ProcessBlock(block, targetLanguageSrtFile, originLanguageSrtFile, isTargetOnTop)
	}

	if err = scanner.Err(); err != nil {
		log.GetLogger().Error("audioToSubtitle.splitSrt scanner.Err err", zap.Any("stepParam", stepParam), zap.Error(err))
		return err
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
		// 供生成配音使用
		stepParam.TtsSourceFilePath = stepParam.BilingualSrtFilePath
	}

	log.GetLogger().Info("audioToSubtitle.splitSrt end", zap.Any("task id", stepParam.TaskId))
	return nil
}

func getSentenceTimestamps(words []openai.Word, sentence string, lastTs float64, language types.StandardLanguageName) (types.SrtSentence, float64, error) {
	var srtSt types.SrtSentence
	var sentenceWordList []string
	if language == types.LanguageNameEnglish || language == types.LanguageNameGerman { // 处理方式不同
		sentenceWordList = util.SplitSentence(sentence)
		if len(sentenceWordList) == 0 {
			return srtSt, 0, fmt.Errorf("sentence is empty")
		}

		sentenceWords := make([]openai.Word, 0)

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
				sentenceWords = append(sentenceWords, openai.Word{
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
			return srtSt, 0, fmt.Errorf("no valid sentence")
		}

		// 找到最大连续子数组后，再去找整个句子开始和结束的时间戳
		beginWord := sentenceWords[beginWordIndex]
		endWord := sentenceWords[endWordIndex-1]
		if endWordIndex-beginWordIndex == len(sentenceWords) {
			srtSt.Start = beginWord.Start
			srtSt.End = endWord.End
			thisLastTs = endWord.End
			return srtSt, thisLastTs, nil
		}

		if beginWordIndex > 0 {
			for i := beginWordIndex - 1; i >= 0; i-- {
				if beginWord.Num > 0 && strings.EqualFold(words[beginWord.Num-1].Text, sentenceWords[i].Text) {
					beginWord = words[beginWord.Num-1]
				}
			}
		}

		if endWordIndex < len(sentenceWords) {
			for i := endWordIndex; i < len(sentenceWords); i++ {
				if endWord.Num+1 < len(words) && strings.EqualFold(words[endWord.Num+1].Text, sentenceWords[i].Text) {
					endWord = words[endWord.Num+1]
				}
			}
		}

		if beginWord.Num > sentenceWords[0].Num && beginWord.Num-sentenceWords[0].Num < 10 {
			beginWord = sentenceWords[0]
		}

		if sentenceWords[len(sentenceWords)-1].Num > endWord.Num && sentenceWords[len(sentenceWords)-1].Num-endWord.Num < 10 {
			endWord = sentenceWords[len(sentenceWords)-1]
		}

		srtSt.Start = beginWord.Start
		srtSt.End = endWord.End
		if beginWord.Num != endWord.Num && endWord.End > thisLastTs {
			thisLastTs = endWord.End
		}

		return srtSt, thisLastTs, nil
	} else {
		sentenceWordList = strings.Split(util.GetRecognizableString(sentence), "")
		if len(sentenceWordList) == 0 {
			return srtSt, 0, fmt.Errorf("sentence is empty")
		}

		sentenceWords := make([]openai.Word, 0)

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
		beginWordIndex, endWordIndex := jumpFindMaxIncreasingSubArray(sentenceWords)
		if (endWordIndex - beginWordIndex) == 0 {
			return srtSt, 0, fmt.Errorf("no valid sentence")
		}

		beginWord := sentenceWords[beginWordIndex]
		endWord := sentenceWords[endWordIndex]

		srtSt.Start = beginWord.Start
		srtSt.End = endWord.End
		if beginWord.Num != endWord.Num && endWord.End > thisLastTs {
			thisLastTs = endWord.End
		}

		return srtSt, thisLastTs, nil
	}
}

// 找到 Num 值递增的最大连续子数组
func findMaxIncreasingSubArray(words []openai.Word) (int, int) {
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
func jumpFindMaxIncreasingSubArray(words []openai.Word) (int, int) {
	if len(words) == 0 {
		return -1, -1
	}

	// dp[i] 表示以 words[i] 结束的递增子数组的长度
	dp := make([]int, len(words))
	// prev[i] 用来记录与当前递增子数组相连的前一个元素的索引
	prev := make([]int, len(words))

	// 初始化，所有的 dp[i] 都是1，因为每个元素本身就是一个长度为1的子数组
	for i := 0; i < len(words); i++ {
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
		return -1, -1
	}

	// 回溯找到子数组的起始索引
	startIdx = endIdx
	for prev[startIdx] != -1 {
		startIdx = prev[startIdx]
	}

	// 返回找到的最长递增子数组的起始和结束索引
	return startIdx, endIdx
}

func (s Service) generateTimestamps(taskId, basePath string, originLanguage types.StandardLanguageName, resultType types.SubtitleResultType, audioFile *types.SmallAudio) error {
	// 获取原始无时间戳字幕内容
	srtBlocks, err := util.ParseSrtNoTsToSrtBlock(audioFile.SrtNoTsFile)
	if err != nil {
		log.GetLogger().Error("generateAudioSubtitles.generateTimestamps.ReadSrtBlocks err", zap.String("taskId", taskId), zap.Error(err))
		return err
	}

	// 获取每个字幕块的时间戳
	var lastTs float64
	for _, srtBlock := range srtBlocks {
		if srtBlock.OriginLanguageSentence == "" {
			continue
		}
		sentenceTs, ts, err := getSentenceTimestamps(audioFile.TranscriptionData.Words, srtBlock.OriginLanguageSentence, lastTs, originLanguage)
		if err != nil || ts < lastTs {
			continue
		}
		lastTs = ts
		tsOffset := float64(config.Conf.App.SegmentDuration) * 60 * float64(audioFile.Num-1)
		srtBlock.Timestamp = fmt.Sprintf("%s --> %s", util.FormatTime(float32(sentenceTs.Start+tsOffset)), util.FormatTime(float32(sentenceTs.End+tsOffset)))
	}

	// 保存带时间戳的原始字幕
	finalBilingualSrtFileName := fmt.Sprintf("%s/%s", basePath, fmt.Sprintf(types.SubtitleTaskSplitBilingualSrtFileNamePattern, audioFile.Num))
	finalBilingualSrtFile, err := os.Create(finalBilingualSrtFileName)
	if err != nil {
		log.GetLogger().Error("generateAudioSubtitles.generateTimestamps.os.Open err", zap.String("taskId", taskId), zap.Error(err))
		return err
	}
	defer finalBilingualSrtFile.Close()

	// 写入字幕文件
	for _, srtBlock := range srtBlocks {
		_, _ = finalBilingualSrtFile.WriteString(fmt.Sprintf("%d\n", srtBlock.Index))
		_, _ = finalBilingualSrtFile.WriteString(srtBlock.Timestamp + "\n")
		if resultType == types.SubtitleResultTypeBilingualTranslationOnTop {
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.TargetLanguageSentence + "\n")
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.OriginLanguageSentence + "\n\n")
		} else {
			// on bottom 或者单语类型，都用on bottom
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.OriginLanguageSentence + "\n")
			_, _ = finalBilingualSrtFile.WriteString(srtBlock.TargetLanguageSentence + "\n\n")
		}
	}

	return nil
}

func (s Service) splitTextAndTranslate(taskId, baseTaskPath string, targetLanguage types.StandardLanguageName, enableModalFilter bool, audioFile *types.SmallAudio) error {
	var (
		splitContent string
		splitPrompt  string
		err          error
	)
	if enableModalFilter {
		splitPrompt = fmt.Sprintf(types.SplitTextPromptWithModalFilter, types.GetStandardLanguageName(targetLanguage))
	} else {
		splitPrompt = fmt.Sprintf(types.SplitTextPrompt, types.GetStandardLanguageName(targetLanguage))
	}
	if audioFile.TranscriptionData.Text == "" {
		splitContent = ""
	} else {
		for i := 0; i < 3; i++ {
			splitContent, err = s.OpenaiClient.ChatCompletion(splitPrompt + audioFile.TranscriptionData.Text)
			if err == nil {
				break
			}
		}
	}

	if err != nil {
		log.GetLogger().Error("generateAudioSubtitles.splitTextAndTranslate.ChatCompletion err", zap.Any("taskId", taskId), zap.Error(err))
		return err
	}

	//保存不带时间戳的原始字幕
	originNoTsSrtFile := fmt.Sprintf("%s/%s", baseTaskPath, fmt.Sprintf(types.SubtitleTaskSplitSrtNoTimestampFileNamePattern, audioFile.Num))
	err = os.WriteFile(originNoTsSrtFile, []byte(splitContent), 0644)
	if err != nil {
		log.GetLogger().Error("generateAudioSubtitles.splitTextAndTranslate.os.WriteFile err", zap.Any("taskId", taskId), zap.Error(err))
		return err
	}

	audioFile.SrtNoTsFile = originNoTsSrtFile

	return nil
}