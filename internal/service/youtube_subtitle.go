package service

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"krillin-ai/config"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"

	"regexp"
	"sort"

	"go.uber.org/zap"
)

type vttBlock struct {
	index         int
	startTime     string
	endTime       string
	lines         []string
	cleanLines    []string
	cleanText     string
	hasTimingTags bool
}

type srtSubtitle struct {
	startTime string
	endTime   string
	text      string
	duration  int64
}

// translator defines the interface for text translation.
type translator interface {
	splitTextAndTranslateV2(basePath, inputText string, originLang, targetLang types.StandardLanguageCode, enableModalFilter bool, id int) ([]*TranslatedItem, error)
}

// YouTubeSubtitleService handles all operations related to YouTube subtitles.
type YouTubeSubtitleService struct {
	translator translator
}

// NewYouTubeSubtitleService creates a new YouTubeSubtitleService.
func NewYouTubeSubtitleService(translator translator) *YouTubeSubtitleService {
	return &YouTubeSubtitleService{
		translator: translator,
	}
}

// Process handles the entire workflow for YouTube subtitles, from downloading to processing.
func (s *YouTubeSubtitleService) Process(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	// 1. Download subtitle file
	err := s.downloadYouTubeSubtitle(ctx, stepParam)
	if err != nil {
		// Return error to let the caller handle fallback (e.g., audio transcription)
		return err
	}

	// 2. Process the downloaded subtitle file
	log.GetLogger().Info("Successfully downloaded YouTube subtitles, processing...", zap.String("taskId", stepParam.TaskId))
	err = s.processYouTubeSubtitle(ctx, stepParam)
	if err != nil {
		return fmt.Errorf("processYouTubeSubtitle err: %w", err)
	}

	return nil
}

func (s *YouTubeSubtitleService) convertVttToSrtGo(inputPath, outputPath string) error {
	contentBytes, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read VTT file: %w", err)
	}
	content := string(contentBytes)
	lines := strings.Split(content, "\n")

	// --- 1. Parse all VTT blocks ---
	var vttBlocks []*vttBlock
	timestampRegex := regexp.MustCompile(`^(\d{2}:\d{2}:\d{2})\.(\d{3})\s-->\s(\d{2}:\d{2}:\d{2})\.(\d{3})`)
	tagRegex := regexp.MustCompile(`<[^>]*>`)
	timingTagRegex := regexp.MustCompile(`<\d{2}:\d{2}:\d{2}\.\d{3}>`)

	for i := 0; i < len(lines); {
		line := strings.TrimSpace(lines[i])
		if line == "" || strings.HasPrefix(line, "WEBVTT") || strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
			i++
			continue
		}

		if matches := timestampRegex.FindStringSubmatch(line); len(matches) == 5 {
			startTime := fmt.Sprintf("%s,%s", matches[1], matches[2])
			endTime := fmt.Sprintf("%s,%s", matches[3], matches[4])

			i++
			var subtitleLines []string
			for i < len(lines) && strings.TrimSpace(lines[i]) != "" {
				subtitleLines = append(subtitleLines, strings.TrimSpace(lines[i]))
				i++
			}

			if len(subtitleLines) > 0 {
				block := &vttBlock{
					startTime: startTime,
					endTime:   endTime,
					lines:     subtitleLines,
					index:     len(vttBlocks),
				}
				var cleanLines []string
				for _, l := range block.lines {
					cleanLine := strings.TrimSpace(tagRegex.ReplaceAllString(l, ""))
					if cleanLine != "" {
						cleanLines = append(cleanLines, cleanLine)
					}
				}
				block.cleanLines = cleanLines
				block.cleanText = strings.Join(cleanLines, " ")
				block.hasTimingTags = timingTagRegex.MatchString(strings.Join(block.lines, " "))
				vttBlocks = append(vttBlocks, block)
			}
		} else {
			i++
		}
	}

	// --- 2. Identify candidate blocks ---
	var candidateBlocks []*vttBlock
	for _, block := range vttBlocks {
		if !block.hasTimingTags && len(block.cleanLines) == 1 {
			candidateBlocks = append(candidateBlocks, block)
		}
	}

	// --- 3. Build precise timeline ---
	subtitlesMap := make(map[string]*srtSubtitle)
	for _, sBlock := range candidateBlocks {
		text := sBlock.cleanText
		startTime := sBlock.startTime
		endTime := sBlock.endTime

		// Search backwards for start time
		for i := sBlock.index - 1; i >= 0; i-- {
			pBlock := vttBlocks[i]
			if util.IsTextMatch(text, pBlock.cleanText) {
				startTime = pBlock.startTime
				break
			}
		}

		// Search forwards for end time
		for i := sBlock.index + 1; i < len(vttBlocks); i++ {
			tBlock := vttBlocks[i]
			if !tBlock.hasTimingTags && len(tBlock.cleanLines) >= 1 {
				if tBlock.cleanLines[0] == text {
					endTime = tBlock.startTime
					break
				}
			}
		}

		duration := util.TimeToMilliseconds(endTime) - util.TimeToMilliseconds(startTime)
		if existing, ok := subtitlesMap[text]; !ok || duration > existing.duration {
			subtitlesMap[text] = &srtSubtitle{
				startTime: startTime,
				endTime:   endTime,
				text:      text,
				duration:  duration,
			}
		}
	}

	// --- 4. Clean and sort ---
	var finalSubtitles []*srtSubtitle
	for _, sub := range subtitlesMap {
		finalSubtitles = append(finalSubtitles, sub)
	}
	sort.Slice(finalSubtitles, func(i, j int) bool {
		return util.TimeToMilliseconds(finalSubtitles[i].startTime) < util.TimeToMilliseconds(finalSubtitles[j].startTime)
	})

	// Fix overlaps
	if len(finalSubtitles) > 1 {
		for i := 0; i < len(finalSubtitles)-1; i++ {
			currentEndMs := util.TimeToMilliseconds(finalSubtitles[i].endTime)
			nextStartMs := util.TimeToMilliseconds(finalSubtitles[i+1].startTime)

			if currentEndMs > nextStartMs {
				adjustedEndMs := nextStartMs - 50
				if adjustedEndMs > util.TimeToMilliseconds(finalSubtitles[i].startTime) {
					finalSubtitles[i].endTime = util.MillisecondsToTime(adjustedEndMs)
				}
			}
		}
	}

	// --- 5. Write SRT file ---
	var srtContent strings.Builder
	for i, subtitle := range finalSubtitles {
		srtContent.WriteString(fmt.Sprintf("%d\n", i+1))
		srtContent.WriteString(fmt.Sprintf("%s --> %s\n", subtitle.startTime, subtitle.endTime))
		srtContent.WriteString(subtitle.text + "\n\n")
	}

	return os.WriteFile(outputPath, []byte(srtContent.String()), 0644)
}

func (s *YouTubeSubtitleService) parseVttTime(timeStr string) (float64, error) {
	// VTT format: HH:MM:SS.ms or MM:SS.ms
	parts := strings.Split(timeStr, ":")
	var h, m, sec, ms int
	var err error

	if len(parts) == 3 { // HH:MM:SS.ms
		h, err = strconv.Atoi(parts[0])
		if err != nil {
			return 0, err
		}
		m, err = strconv.Atoi(parts[1])
		if err != nil {
			return 0, err
		}
		secParts := strings.Split(parts[2], ".")
		sec, err = strconv.Atoi(secParts[0])
		if err != nil {
			return 0, err
		}
		ms, err = strconv.Atoi(secParts[1])
		if err != nil {
			return 0, err
		}
	} else if len(parts) == 2 { // MM:SS.ms
		m, err = strconv.Atoi(parts[0])
		if err != nil {
			return 0, err
		}
		secParts := strings.Split(parts[1], ".")
		sec, err = strconv.Atoi(secParts[0])
		if err != nil {
			return 0, err
		}
		ms, err = strconv.Atoi(secParts[1])
		if err != nil {
			return 0, err
		}
	} else {
		return 0, fmt.Errorf("invalid time format: %s", timeStr)
	}

	return float64(h)*3600 + float64(m)*60 + float64(sec) + float64(ms)/1000, nil
}

func (s *YouTubeSubtitleService) parseVttToWords(vttPath string) ([]types.Word, error) {
	file, err := os.Open(vttPath)
	if err != nil {
		return nil, fmt.Errorf("parseVttToWords open file error: %w", err)
	}
	defer file.Close()

	var words []types.Word
	scanner := bufio.NewScanner(file)
	var blockStartTime, blockEndTime float64
	wordNum := 0

	timestampLineRegex := regexp.MustCompile(`^((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s-->\s((?:\d{2}:)?\d{2}:\d{2}\.\d{3})`)
	wordTimeRegex := regexp.MustCompile(`<((?:\d{2}:)?\d{2}:\d{2}\.\d{3})>`)
	styleTagRegex := regexp.MustCompile(`</?c>`)
	hasWordTimestampRegex := regexp.MustCompile(`<(?:\d{2}:)?\d{2}:\d{2}\.\d{3}>`)

	for scanner.Scan() {
		line := scanner.Text()

		if matches := timestampLineRegex.FindStringSubmatch(line); len(matches) > 2 {
			start, err := s.parseVttTime(matches[1])
			if err != nil {
				log.GetLogger().Warn("parseVttToWords: failed to parse block start time", zap.String("time", matches[1]), zap.Error(err))
				continue
			}
			end, err := s.parseVttTime(matches[2])
			if err != nil {
				log.GetLogger().Warn("parseVttToWords: failed to parse block end time", zap.String("time", matches[2]), zap.Error(err))
				continue
			}
			blockStartTime = start
			blockEndTime = end
			continue
		}

		if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "WEBVTT") || strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
			continue
		}

		if !hasWordTimestampRegex.MatchString(line) {
			continue
		}

		content := styleTagRegex.ReplaceAllString(line, "")
		lastTime := blockStartTime

		timeMatches := wordTimeRegex.FindAllStringSubmatch(content, -1)
		textParts := wordTimeRegex.Split(content, -1)

		for i, textPart := range textParts {
			cleanedText := strings.TrimSpace(textPart)
			if cleanedText == "" {
				continue
			}

			var endTime float64
			if i < len(timeMatches) {
				var err error
				endTime, err = s.parseVttTime(timeMatches[i][1])
				if err != nil {
					log.GetLogger().Warn("parseVttToWords: failed to parse word end time", zap.String("time", timeMatches[i][1]), zap.Error(err))
					endTime = lastTime // Fallback
				}
			} else {
				endTime = blockEndTime
			}

			words = append(words, types.Word{
				Text:  cleanedText,
				Start: lastTime,
				End:   endTime,
				Num:   wordNum,
			})
			wordNum++
			lastTime = endTime
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("parseVttToWords scan error: %w", err)
	}

	return words, nil
}

// 使用yt-dlp下载YouTube视频的字幕文件
func (s *YouTubeSubtitleService) downloadYouTubeSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	link := stepParam.Link
	if !strings.Contains(link, "youtube.com") {
		return fmt.Errorf("downloadYouTubeSubtitle: not a YouTube link")
	}

	videoId, err := util.GetYouTubeID(link)
	if err != nil {
		log.GetLogger().Error("downloadYouTubeSubtitle.GetYouTubeID error", zap.Any("stepParam", stepParam), zap.Error(err))
		return fmt.Errorf("downloadYouTubeSubtitle.GetYouTubeID error: %w", err)
	}

	stepParam.Link = "https://www.youtube.com/watch?v=" + videoId

	// 确定要下载的字幕语言
	subtitleLang := util.MapLanguageForYouTube(string(stepParam.OriginLanguage))

	// 构造yt-dlp命令参数
	outputPattern := filepath.Join(stepParam.TaskBasePath, "%(title)s.%(ext)s")
	cmdArgs := []string{
		"--write-auto-subs",
		"--sub-langs", subtitleLang,
		"--skip-download",
		"-o", outputPattern,
		stepParam.Link,
	}

	// 添加代理设置
	if config.Conf.App.Proxy != "" {
		cmdArgs = append(cmdArgs, "--proxy", config.Conf.App.Proxy)
	}

	// 添加cookies
	cmdArgs = append(cmdArgs, "--cookies", "./cookies.txt")

	// 添加ffmpeg路径
	if storage.FfmpegPath != "ffmpeg" {
		cmdArgs = append(cmdArgs, "--ffmpeg-location", storage.FfmpegPath)
	}

	log.GetLogger().Info("downloadYouTubeSubtitle starting", zap.Any("taskId", stepParam.TaskId), zap.Any("cmdArgs", cmdArgs))

	// 添加重试机制
	maxAttempts := 3
	var lastErr error

	for attempt := 0; attempt < maxAttempts; attempt++ {
		log.GetLogger().Info("Attempting to download YouTube subtitle",
			zap.Any("taskId", stepParam.TaskId),
			zap.Int("attempt", attempt+1),
			zap.Int("maxAttempts", maxAttempts))

		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		output, err := cmd.CombinedOutput()

		if err == nil {
			log.GetLogger().Info("downloadYouTubeSubtitle completed", zap.Any("taskId", stepParam.TaskId), zap.String("output", string(output)))

			// 查找下载的字幕文件
			subtitleFile, err := s.findDownloadedSubtitleFile(stepParam.TaskBasePath, subtitleLang)
			if err != nil {
				log.GetLogger().Error("downloadYouTubeSubtitle findDownloadedSubtitleFile error", zap.Any("stepParam", stepParam), zap.Error(err))
				return fmt.Errorf("downloadYouTubeSubtitle findDownloadedSubtitleFile error: %w", err)
			}

			stepParam.OriginalSubtitleFilePath = subtitleFile
			stepParam.TaskPtr.ProcessPct = 20

			log.GetLogger().Info("downloadYouTubeSubtitle found subtitle file", zap.Any("taskId", stepParam.TaskId), zap.String("subtitleFile", subtitleFile))
			return nil
		}

		lastErr = err
		log.GetLogger().Warn("downloadYouTubeSubtitle attempt failed",
			zap.Any("taskId", stepParam.TaskId),
			zap.Int("attempt", attempt+1),
			zap.String("output", string(output)),
			zap.Error(err))

		// 如果不是最后一次尝试，等待一段时间再重试
		if attempt < maxAttempts-1 {
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
	}

	log.GetLogger().Error("downloadYouTubeSubtitle failed after all attempts", zap.Any("stepParam", stepParam), zap.Error(lastErr))
	return fmt.Errorf("downloadYouTubeSubtitle yt-dlp error after %d attempts: %w", maxAttempts, lastErr)
}

// 查找下载的字幕文件
func (s *YouTubeSubtitleService) findDownloadedSubtitleFile(taskBasePath, language string) (string, error) {
	// 支持的字幕文件扩展名
	extensions := []string{".vtt", ".srt"}

	err := filepath.Walk(taskBasePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		fileName := info.Name()
		for _, ext := range extensions {
			// 检查文件名是否包含语言代码和对应扩展名
			if strings.Contains(fileName, language) && strings.HasSuffix(fileName, ext) {
				return fmt.Errorf("found:%s", path) // 使用error来返回找到的文件路径
			}
		}
		return nil
	})

	if err != nil && strings.HasPrefix(err.Error(), "found:") {
		return strings.TrimPrefix(err.Error(), "found:"), nil
	}

	return "", fmt.Errorf("subtitle file not found for language: %s", language)
}

// 处理YouTube字幕文件，转换为标准格式并进行翻译
func (s *YouTubeSubtitleService) processYouTubeSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if stepParam.OriginalSubtitleFilePath == "" {
		return fmt.Errorf("processYouTubeSubtitle: no original subtitle file found")
	}

	log.GetLogger().Info("processYouTubeSubtitle starting", zap.Any("taskId", stepParam.TaskId), zap.String("subtitleFile", stepParam.OriginalSubtitleFilePath))

	// 1. 转换VTT到SRT格式
	srtFilePath, err := s.convertToSrtFormat(stepParam.OriginalSubtitleFilePath, stepParam.TaskBasePath)
	if err != nil {
		return fmt.Errorf("processYouTubeSubtitle convertToSrtFormat error: %w", err)
	}

	log.GetLogger().Info("processYouTubeSubtitle converted to SRT", zap.Any("taskId", stepParam.TaskId), zap.String("srtFile", srtFilePath))
	stepParam.TaskPtr.ProcessPct = 30

	// 2. 翻译SRT文件
	err = s.TranslateSrtFile(ctx, stepParam, srtFilePath)
	if err != nil {
		return fmt.Errorf("processYouTubeSubtitle translateSrtFile error: %w", err)
	}

	stepParam.TaskPtr.ProcessPct = 90
	log.GetLogger().Info("processYouTubeSubtitle completed", zap.Any("taskId", stepParam.TaskId))

	err = splitSrt(stepParam)
	if err != nil {
		return fmt.Errorf("processYouTubeSubtitle splitSrt error: %w", err)
	}

	return nil
}

// 转换为SRT格式
func (s *YouTubeSubtitleService) convertToSrtFormat(inputPath, taskBasePath string) (string, error) {
	if strings.HasSuffix(inputPath, ".srt") {
		return inputPath, nil
	}

	if strings.HasSuffix(inputPath, ".vtt") {
		outputPath := filepath.Join(taskBasePath, "converted_subtitle.srt")

		log.GetLogger().Info("Converting VTT to SRT with internal Go function", zap.String("input", inputPath), zap.String("output", outputPath))

		if err := util.ConvertVttToSrtGo(inputPath, outputPath); err != nil {
			log.GetLogger().Error("VTT to SRT conversion failed", zap.Error(err))
			return "", fmt.Errorf("VTT to SRT conversion failed: %w", err)
		}

		log.GetLogger().Info("VTT to SRT conversion completed", zap.String("output", outputPath))
		return outputPath, nil
	}

	return "", fmt.Errorf("unsupported subtitle format: %s", inputPath)
}

// TranslateSrtFile 翻译SRT文件
func (s *YouTubeSubtitleService) TranslateSrtFile(ctx context.Context, stepParam *types.SubtitleTaskStepParam, srtFilePath string) error {
	log.GetLogger().Info("translateSrtFile starting", zap.Any("taskId", stepParam.TaskId), zap.String("srtFile", srtFilePath))

	// 1. 解析SRT/VTT文件 获取SRT块用于提取原文
	utilSrtBlocks, err := util.ParseSrtFile(srtFilePath)
	if err != nil {
		return fmt.Errorf("translateSrtFile parseSrtFile error: %w", err)
	}
	if len(utilSrtBlocks) == 0 {
		return fmt.Errorf("translateSrtFile: no srt blocks found in file")
	}

	var srtBlocks []*types.SrtBlock
	for _, b := range utilSrtBlocks {
		srtBlocks = append(srtBlocks, &types.SrtBlock{
			Index:                  b.Index,
			Timestamp:              b.Timestamp,
			OriginLanguageSentence: b.OriginLanguageSentence,
			TargetLanguageSentence: b.TargetLanguageSentence,
		})
	}

	stepParam.TaskPtr.ProcessPct = 40

	// 2. 解析VTT文件以获取单词级时间戳
	utilWords, err := util.ParseVttToWords(stepParam.OriginalSubtitleFilePath)
	if err != nil {
		return fmt.Errorf("translateSrtFile parseVttToWords error: %w", err)
	}
	// convert []util.Word to []types.Word
	var words []types.Word
	for _, w := range utilWords {
		words = append(words, types.Word{
			Text:  w.Text,
			Start: w.Start,
			End:   w.End,
			Num:   w.Num,
		})
	}

	// 3. 将所有SRT块的原文合并为一个长文本
	var allOriginTextBuilder strings.Builder
	for _, block := range srtBlocks {
		allOriginTextBuilder.WriteString(block.OriginLanguageSentence)
		allOriginTextBuilder.WriteString(" ")
	}
	allOriginText := strings.TrimSpace(allOriginTextBuilder.String())

	// 4. 调用V2翻译服务，传入完整的上下文
	log.GetLogger().Info("translateSrtFile starting translation for full text", zap.Any("taskId", stepParam.TaskId))
	translatedItems, err := s.translator.splitTextAndTranslateV2(stepParam.TaskBasePath, allOriginText, stepParam.OriginLanguage, stepParam.TargetLanguage, stepParam.EnableModalFilter, 0)
	if err != nil {
		return fmt.Errorf("translateSrtFile splitTextAndTranslateV2 error: %w", err)
	}
	stepParam.TaskPtr.ProcessPct = 80

	// 5. 将翻译结果转换为无时间戳的SrtBlock
	var tempSrtBlocks []*util.SrtBlock
	for i, item := range translatedItems {
		tempSrtBlocks = append(tempSrtBlocks, &util.SrtBlock{
			Index:                  i + 1,
			OriginLanguageSentence: item.OriginText,
			TargetLanguageSentence: item.TranslatedText,
		})
	}

	// 6. 使用`generateSrtWithTimestamps`的逻辑为字幕块生成时间戳
	timeMatcher := NewTimestampGenerator()
	finalUtilSrtBlocks, err := timeMatcher.GenerateTimestamps(tempSrtBlocks, words, stepParam.OriginLanguage, 0)
	if err != nil {
		return fmt.Errorf("translateSrtFile GenerateTimestamps error: %w", err)
	}

	var finalSrtBlocks []*types.SrtBlock
	for _, b := range finalUtilSrtBlocks {
		finalSrtBlocks = append(finalSrtBlocks, &types.SrtBlock{
			Index:                  b.Index,
			Timestamp:              b.Timestamp,
			OriginLanguageSentence: b.OriginLanguageSentence,
			TargetLanguageSentence: b.TargetLanguageSentence,
		})
	}

	// 7. 生成各种格式的字幕文件
	err = s.generateSubtitleFiles(stepParam, finalSrtBlocks)
	if err != nil {
		return fmt.Errorf("translateSrtFile generateSubtitleFiles error: %w", err)
	}

	stepParam.TaskPtr.ProcessPct = 90
	log.GetLogger().Info("translateSrtFile completed", zap.Any("taskId", stepParam.TaskId))
	return nil
}

// 生成各种格式的字幕文件
func (s *YouTubeSubtitleService) generateSubtitleFiles(stepParam *types.SubtitleTaskStepParam, srtBlocks []*types.SrtBlock) error {
	// 生成双语字幕文件
	bilingualSrtPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskBilingualSrtFileName)
	err := s.writeBilingualSrtFile(bilingualSrtPath, srtBlocks, stepParam.SubtitleResultType)
	if err != nil {
		return fmt.Errorf("generateSubtitleFiles writeBilingualSrtFile error: %w", err)
	}
	stepParam.BilingualSrtFilePath = bilingualSrtPath

	// 生成原语言字幕文件
	originSrtPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskOriginLanguageSrtFileName)
	err = s.writeOriginSrtFile(originSrtPath, srtBlocks)
	if err != nil {
		return fmt.Errorf("generateSubtitleFiles writeOriginSrtFile error: %w", err)
	}

	// 生成目标语言字幕文件
	if stepParam.TargetLanguage != stepParam.OriginLanguage && stepParam.TargetLanguage != "none" {
		targetSrtPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
		err = s.writeTargetSrtFile(targetSrtPath, srtBlocks)
		if err != nil {
			return fmt.Errorf("generateSubtitleFiles writeTargetSrtFile error: %w", err)
		}
	}

	// 填充字幕信息
	s.populateSubtitleInfos(stepParam, srtBlocks)

	return nil
}

// 写入双语字幕文件
func (s *YouTubeSubtitleService) writeBilingualSrtFile(filePath string, srtBlocks []*types.SrtBlock, resultType types.SubtitleResultType) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	for _, block := range srtBlocks {
		_, _ = file.WriteString(fmt.Sprintf("%d\n", block.Index))
		_, _ = file.WriteString(block.Timestamp + "\n")

		if resultType == types.SubtitleResultTypeBilingualTranslationOnTop {
			_, _ = file.WriteString(block.TargetLanguageSentence + "\n")
			_, _ = file.WriteString(block.OriginLanguageSentence + "\n\n")
		} else {
			_, _ = file.WriteString(block.OriginLanguageSentence + "\n")
			_, _ = file.WriteString(block.TargetLanguageSentence + "\n\n")
		}
	}

	return nil
}

// 写入原语言字幕文件
func (s *YouTubeSubtitleService) writeOriginSrtFile(filePath string, srtBlocks []*types.SrtBlock) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	for _, block := range srtBlocks {
		_, _ = file.WriteString(fmt.Sprintf("%d\n", block.Index))
		_, _ = file.WriteString(block.Timestamp + "\n")
		_, _ = file.WriteString(block.OriginLanguageSentence + "\n\n")
	}

	return nil
}

// 写入目标语言字幕文件
func (s *YouTubeSubtitleService) writeTargetSrtFile(filePath string, srtBlocks []*types.SrtBlock) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	for _, block := range srtBlocks {
		_, _ = file.WriteString(fmt.Sprintf("%d\n", block.Index))
		_, _ = file.WriteString(block.Timestamp + "\n")
		_, _ = file.WriteString(block.TargetLanguageSentence + "\n\n")
	}

	return nil
}

// 填充字幕信息
func (s *YouTubeSubtitleService) populateSubtitleInfos(stepParam *types.SubtitleTaskStepParam, srtBlocks []*types.SrtBlock) {
	// 添加原语言单语字幕
	originSrtPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskOriginLanguageSrtFileName)
	subtitleInfo := types.SubtitleFileInfo{
		Path:               originSrtPath,
		LanguageIdentifier: string(stepParam.OriginLanguage),
	}
	if stepParam.UserUILanguage == types.LanguageNameEnglish {
		subtitleInfo.Name = types.GetStandardLanguageName(stepParam.OriginLanguage) + " Subtitle"
	} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
		subtitleInfo.Name = types.GetStandardLanguageName(stepParam.OriginLanguage) + " 单语字幕"
	}
	stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)

	// 添加目标语言单语字幕（如果需要）
	if stepParam.SubtitleResultType == types.SubtitleResultTypeTargetOnly ||
		stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom ||
		stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop {
		targetSrtPath := filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
		subtitleInfo = types.SubtitleFileInfo{
			Path:               targetSrtPath,
			LanguageIdentifier: string(stepParam.TargetLanguage),
		}
		if stepParam.UserUILanguage == types.LanguageNameEnglish {
			subtitleInfo.Name = types.GetStandardLanguageName(stepParam.TargetLanguage) + " Subtitle"
		} else if stepParam.UserUILanguage == types.LanguageNameSimplifiedChinese {
			subtitleInfo.Name = types.GetStandardLanguageName(stepParam.TargetLanguage) + " 单语字幕"
		}
		stepParam.SubtitleInfos = append(stepParam.SubtitleInfos, subtitleInfo)
	}

	// 添加双语字幕（如果需要）
	if stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnTop ||
		stepParam.SubtitleResultType == types.SubtitleResultTypeBilingualTranslationOnBottom {
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

	// 设置TTS源文件路径
	stepParam.TtsSourceFilePath = stepParam.BilingualSrtFilePath
}
