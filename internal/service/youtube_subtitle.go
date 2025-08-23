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

type YoutubeSubtitleReq struct {
	TaskBasePath   string
	TaskId         string
	URL            string
	OriginLanguage string
	TargetLanguage string
	VttFile        string
}

// translator defines the interface for text translation.
type translator interface {
	splitTextAndTranslateV2(basePath, inputText string, originLang, targetLang types.StandardLanguageCode, enableModalFilter bool, id int) ([]*TranslatedItem, error)
}

// YouTubeSubtitleService handles all operations related to YouTube subtitles.
type YouTubeSubtitleService struct {
	translator *Translator
}

// NewYouTubeSubtitleService creates a new YouTubeSubtitleService.
func NewYouTubeSubtitleService() *YouTubeSubtitleService {
	return &YouTubeSubtitleService{
		translator: NewTranslator(),
	}
}

// Process handles the entire workflow for YouTube subtitles, from downloading to processing.
func (s *YouTubeSubtitleService) Process(ctx context.Context, req *YoutubeSubtitleReq) error {
	// 1. Download subtitle file
	vttFile, err := s.downloadYouTubeSubtitle(ctx, req)
	if err != nil {
		// Return error to let the caller handle fallback (e.g., audio transcription)
		return err
	}

	req.VttFile = vttFile

	// 2. Process the downloaded subtitle file
	log.GetLogger().Info("Successfully downloaded YouTube subtitles, processing...", zap.String("taskId", req.TaskId))
	_, err = s.processYouTubeSubtitle(ctx, req)
	if err != nil {
		return fmt.Errorf("processYouTubeSubtitle err: %w", err)
	}

	return nil
}

// func (s *YouTubeSubtitleService) convertVttToSrt(inputPath, outputPath string) error {
// 	contentBytes, err := os.ReadFile(inputPath)
// 	if err != nil {
// 		return fmt.Errorf("failed to read VTT file: %w", err)
// 	}
// 	content := string(contentBytes)
// 	lines := strings.Split(content, "\n")

// 	// --- 1. Parse all VTT blocks ---
// 	var vttBlocks []*vttBlock
// 	timestampRegex := regexp.MustCompile(`^(\d{2}:\d{2}:\d{2})\.(\d{3})\s-->\s(\d{2}:\d{2}:\d{2})\.(\d{3})`)
// 	tagRegex := regexp.MustCompile(`<[^>]*>`)
// 	timingTagRegex := regexp.MustCompile(`<\d{2}:\d{2}:\d{2}\.\d{3}>`)

// 	for i := 0; i < len(lines); {
// 		line := strings.TrimSpace(lines[i])
// 		if line == "" || strings.HasPrefix(line, "WEBVTT") || strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
// 			i++
// 			continue
// 		}

// 		if matches := timestampRegex.FindStringSubmatch(line); len(matches) == 5 {
// 			startTime := fmt.Sprintf("%s,%s", matches[1], matches[2])
// 			endTime := fmt.Sprintf("%s,%s", matches[3], matches[4])

// 			i++
// 			var subtitleLines []string
// 			for i < len(lines) && strings.TrimSpace(lines[i]) != "" {
// 				subtitleLines = append(subtitleLines, strings.TrimSpace(lines[i]))
// 				i++
// 			}

// 			if len(subtitleLines) > 0 {
// 				block := &vttBlock{
// 					startTime: startTime,
// 					endTime:   endTime,
// 					lines:     subtitleLines,
// 					index:     len(vttBlocks),
// 				}
// 				var cleanLines []string
// 				for _, l := range block.lines {
// 					cleanLine := strings.TrimSpace(tagRegex.ReplaceAllString(l, ""))
// 					if cleanLine != "" {
// 						cleanLines = append(cleanLines, cleanLine)
// 					}
// 				}
// 				block.cleanLines = cleanLines
// 				block.cleanText = strings.Join(cleanLines, " ")
// 				block.hasTimingTags = timingTagRegex.MatchString(strings.Join(block.lines, " "))
// 				vttBlocks = append(vttBlocks, block)
// 			}
// 		} else {
// 			i++
// 		}
// 	}

// 	// --- 2. Identify candidate blocks ---
// 	var candidateBlocks []*vttBlock
// 	for _, block := range vttBlocks {
// 		if !block.hasTimingTags && len(block.cleanLines) == 1 {
// 			candidateBlocks = append(candidateBlocks, block)
// 		}
// 	}

// 	// --- 3. Build precise timeline ---
// 	subtitlesMap := make(map[string]*srtSubtitle)
// 	for _, sBlock := range candidateBlocks {
// 		text := sBlock.cleanText
// 		startTime := sBlock.startTime
// 		endTime := sBlock.endTime

// 		// Search backwards for start time
// 		for i := sBlock.index - 1; i >= 0; i-- {
// 			pBlock := vttBlocks[i]
// 			if util.IsTextMatch(text, pBlock.cleanText) {
// 				startTime = pBlock.startTime
// 				break
// 			}
// 		}

// 		// Search forwards for end time
// 		for i := sBlock.index + 1; i < len(vttBlocks); i++ {
// 			tBlock := vttBlocks[i]
// 			if !tBlock.hasTimingTags && len(tBlock.cleanLines) >= 1 {
// 				if tBlock.cleanLines[0] == text {
// 					endTime = tBlock.startTime
// 					break
// 				}
// 			}
// 		}

// 		duration := util.TimeToMilliseconds(endTime) - util.TimeToMilliseconds(startTime)
// 		if existing, ok := subtitlesMap[text]; !ok || duration > existing.duration {
// 			subtitlesMap[text] = &srtSubtitle{
// 				startTime: startTime,
// 				endTime:   endTime,
// 				text:      text,
// 				duration:  duration,
// 			}
// 		}
// 	}

// 	// --- 4. Clean and sort ---
// 	var finalSubtitles []*srtSubtitle
// 	for _, sub := range subtitlesMap {
// 		finalSubtitles = append(finalSubtitles, sub)
// 	}
// 	sort.Slice(finalSubtitles, func(i, j int) bool {
// 		return util.TimeToMilliseconds(finalSubtitles[i].startTime) < util.TimeToMilliseconds(finalSubtitles[j].startTime)
// 	})

// 	// Fix overlaps
// 	if len(finalSubtitles) > 1 {
// 		for i := 0; i < len(finalSubtitles)-1; i++ {
// 			currentEndMs := util.TimeToMilliseconds(finalSubtitles[i].endTime)
// 			nextStartMs := util.TimeToMilliseconds(finalSubtitles[i+1].startTime)

// 			if currentEndMs > nextStartMs {
// 				adjustedEndMs := nextStartMs - 50
// 				if adjustedEndMs > util.TimeToMilliseconds(finalSubtitles[i].startTime) {
// 					finalSubtitles[i].endTime = util.MillisecondsToTime(adjustedEndMs)
// 				}
// 			}
// 		}
// 	}

// 	// --- 5. Write SRT file ---
// 	var srtContent strings.Builder
// 	for i, subtitle := range finalSubtitles {
// 		srtContent.WriteString(fmt.Sprintf("%d\n", i+1))
// 		srtContent.WriteString(fmt.Sprintf("%s --> %s\n", subtitle.startTime, subtitle.endTime))
// 		srtContent.WriteString(subtitle.text + "\n\n")
// 	}

// 	return os.WriteFile(outputPath, []byte(srtContent.String()), 0644)
// }

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

func (s *YouTubeSubtitleService) parseSrtTime(timeStr string) (float64, error) {
	vttTimeStr := strings.Replace(timeStr, ",", ".", 1)
	return s.parseVttTime(vttTimeStr)
}

func (s *YouTubeSubtitleService) parseSrtTimestampLine(line string) (float64, float64, error) {
	parts := strings.Split(line, " --> ")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid srt timestamp line: %s", line)
	}
	startTime, err := s.parseSrtTime(strings.TrimSpace(parts[0]))
	if err != nil {
		return 0, 0, fmt.Errorf("failed to parse start time from '%s': %w", parts[0], err)
	}
	endTime, err := s.parseSrtTime(strings.TrimSpace(parts[1]))
	if err != nil {
		return 0, 0, fmt.Errorf("failed to parse end time from '%s': %w", parts[1], err)
	}
	return startTime, endTime, nil
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

			// 分离标点符号和单词
			wordsFromText := s.extractWordsWithPunctuation(cleanedText, lastTime, endTime)
			for _, word := range wordsFromText {
				word.Num = wordNum
				words = append(words, word)
				wordNum++
			}

			lastTime = endTime
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("parseVttToWords scan error: %w", err)
	}

	return words, nil
}

// extractWordsWithPunctuation 分离文本中的单词和标点符号，保持时间戳信息
func (s *YouTubeSubtitleService) extractWordsWithPunctuation(text string, startTime, endTime float64) []types.Word {
	if text == "" {
		return nil
	}

	var result []types.Word

	// 定义标点符号的正则表达式
	punctRegex := regexp.MustCompile(`^(.*?)([.!?,:;])$`)

	// 检查文本是否以标点符号结尾
	if matches := punctRegex.FindStringSubmatch(text); len(matches) == 3 {
		wordPart := strings.TrimSpace(matches[1])
		punctPart := matches[2]

		// 如果有单词部分，先添加单词
		if wordPart != "" {
			// 计算单词的时间范围（占大部分时间）
			duration := endTime - startTime
			wordDuration := duration * 0.8 // 单词占80%的时间
			wordEndTime := startTime + wordDuration

			result = append(result, types.Word{
				Text:  wordPart,
				Start: startTime,
				End:   wordEndTime,
			})

			// 标点符号占剩余时间
			result = append(result, types.Word{
				Text:  punctPart,
				Start: wordEndTime,
				End:   endTime,
			})
		} else {
			// 只有标点符号
			result = append(result, types.Word{
				Text:  punctPart,
				Start: startTime,
				End:   endTime,
			})
		}
	} else {
		// 检查开头的标点符号
		leadingPunctRegex := regexp.MustCompile(`^([.!?,:;]+)(.*)$`)
		if matches := leadingPunctRegex.FindStringSubmatch(text); len(matches) == 3 {
			punctPart := matches[1]
			wordPart := strings.TrimSpace(matches[2])

			duration := endTime - startTime
			punctDuration := duration * 0.2 // 标点占20%的时间
			punctEndTime := startTime + punctDuration

			// 先添加标点符号
			result = append(result, types.Word{
				Text:  punctPart,
				Start: startTime,
				End:   punctEndTime,
			})

			// 如果有单词部分，再添加单词
			if wordPart != "" {
				result = append(result, types.Word{
					Text:  wordPart,
					Start: punctEndTime,
					End:   endTime,
				})
			}
		} else {
			// 没有标点符号，直接添加整个文本
			result = append(result, types.Word{
				Text:  text,
				Start: startTime,
				End:   endTime,
			})
		}
	}

	return result
}

// 判断文本是否标点稀缺
func (s *YouTubeSubtitleService) isPunctuationSparse(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return true
	}
	// 常见中英标点
	punctRegex := regexp.MustCompile(`[\.,!\?;:，。！？；：]`)
	punctCount := len(punctRegex.FindAllStringIndex(trimmed, -1))
	// 长文本且无标点，视为稀缺
	if punctCount == 0 && len([]rune(trimmed)) > 20 {
		return true
	}
	// 标点占比过低也视为稀缺
	ratio := float64(punctCount) / float64(len([]rune(trimmed)))
	return ratio < 0.01
}

// 基于词级时间戳与时长/停顿/字数上限进行分句（适用于无标点场景）
func (s *YouTubeSubtitleService) splitByWordPausesAndLimits(words []types.Word, lang types.StandardLanguageCode, maxChars int) []string {
	if len(words) == 0 {
		return nil
	}

	// 语言自适应阈值
	var minPauseSec float64
	var maxDurationSec float64
	if util.IsAsianLanguage(lang) {
		minPauseSec = 0.30
		maxDurationSec = 3.5
	} else {
		minPauseSec = 0.45
		maxDurationSec = 4.5
	}

	// 组句时的连接符（中日韩泰不加空格）
	joinWithSpace := !util.IsAsianLanguage(lang)

	var (
		result           []string
		builder          strings.Builder
		currentStart     = words[0].Start
		prevEnd          = words[0].End
		currentCharCount = 0
	)

	appendWord := func(w string) {
		if builder.Len() > 0 && joinWithSpace {
			builder.WriteString(" ")
		}
		builder.WriteString(w)
		currentCharCount += util.CountEffectiveChars(w)
	}

	flush := func() {
		text := strings.TrimSpace(util.CleanPunction(builder.String()))
		if text != "" {
			result = append(result, text)
		}
		builder.Reset()
		currentCharCount = 0
	}

	// 先写入第一个词
	appendWord(strings.TrimSpace(words[0].Text))

	for i := 1; i < len(words); i++ {
		w := words[i]
		// 计算与上个词的停顿
		pause := w.Start - prevEnd
		// 预估加入该词后的时长与字数
		duration := w.End - currentStart
		nextChars := currentCharCount + util.CountEffectiveChars(w.Text)

		// 到达任一阈值则切分
		if pause >= minPauseSec || duration >= maxDurationSec || nextChars >= maxChars {
			flush()
			currentStart = w.Start
		}

		appendWord(strings.TrimSpace(w.Text))
		prevEnd = w.End
	}

	// 最后残留
	if builder.Len() > 0 {
		flush()
	}

	// 如仍为空，退回将所有词拼为一句
	if len(result) == 0 {
		var all strings.Builder
		for i, w := range words {
			if i > 0 && joinWithSpace {
				all.WriteString(" ")
			}
			all.WriteString(strings.TrimSpace(w.Text))
		}
		text := strings.TrimSpace(util.CleanPunction(all.String()))
		if text != "" {
			result = append(result, text)
		}
	}

	return result
}

// 使用yt-dlp下载YouTube视频的字幕文件
func (s *YouTubeSubtitleService) downloadYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	if !strings.Contains(req.URL, "youtube.com") {
		return "", fmt.Errorf("downloadYouTubeSubtitle: not a YouTube link")
	}

	// 确定要下载的字幕语言
	subtitleLang := util.MapLanguageForYouTube(req.OriginLanguage)

	// 构造yt-dlp命令参数
	outputPattern := filepath.Join(req.TaskBasePath, "%(title)s.%(ext)s")
	cmdArgs := []string{
		"--write-auto-subs",
		"--sub-langs", subtitleLang,
		"--skip-download",
		"-o", outputPattern,
		req.URL,
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

	log.GetLogger().Info("downloadYouTubeSubtitle starting", zap.Any("taskId", req.TaskId), zap.Any("cmdArgs", cmdArgs))

	// 添加重试机制
	maxAttempts := 3
	var lastErr error

	for attempt := 0; attempt < maxAttempts; attempt++ {
		log.GetLogger().Info("Attempting to download YouTube subtitle",
			zap.Any("taskId", req.TaskId),
			zap.Int("attempt", attempt+1),
			zap.Int("maxAttempts", maxAttempts))

		cmd := exec.Command(storage.YtdlpPath, cmdArgs...)
		output, err := cmd.CombinedOutput()

		if err == nil {
			log.GetLogger().Info("downloadYouTubeSubtitle completed", zap.Any("taskId", req.TaskId), zap.String("output", string(output)))

			// 查找下载的字幕文件
			subtitleFile, err := s.findDownloadedSubtitleFile(req.TaskBasePath, subtitleLang)
			if err != nil {
				log.GetLogger().Error("downloadYouTubeSubtitle findDownloadedSubtitleFile error", zap.Any("stepParam", req), zap.Error(err))
				return "", fmt.Errorf("downloadYouTubeSubtitle findDownloadedSubtitleFile error: %w", err)
			}

			log.GetLogger().Info("downloadYouTubeSubtitle found subtitle file", zap.Any("taskId", req.TaskId), zap.String("subtitleFile", subtitleFile))
			return subtitleFile, nil
		}

		lastErr = err
		log.GetLogger().Warn("downloadYouTubeSubtitle attempt failed",
			zap.Any("taskId", req.TaskId),
			zap.Int("attempt", attempt+1),
			zap.String("output", string(output)),
			zap.Error(err))

		// 如果不是最后一次尝试，等待一段时间再重试
		if attempt < maxAttempts-1 {
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
	}

	log.GetLogger().Error("downloadYouTubeSubtitle failed after all attempts", zap.Any("req", req), zap.Error(lastErr))
	return "", fmt.Errorf("downloadYouTubeSubtitle yt-dlp error after %d attempts: %w", maxAttempts, lastErr)
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
func (s *YouTubeSubtitleService) processYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	if req.VttFile == "" {
		return "", fmt.Errorf("processYouTubeSubtitle: no original subtitle file found")
	}

	log.GetLogger().Info("processYouTubeSubtitle start", zap.Any("taskId", req.TaskId), zap.String("subtitleFile", req.VttFile))

	originSrtFile := filepath.Join(req.TaskBasePath, "origin.srt")
	// 1. 转换VTT到SRT格式
	err := s.convertVttToSrt(req.VttFile, originSrtFile)
	if err != nil {
		return "", fmt.Errorf("processYouTubeSubtitle convertToSrtFormat error: %w", err)
	}

	log.GetLogger().Info("processYouTubeSubtitle converted to SRT", zap.Any("taskId", req.TaskId), zap.String("srtFile", originSrtFile))

	return "", nil
}

// 转换为SRT格式
func (s *YouTubeSubtitleService) convertVttToSrt(vttFile, srtFile string) error {
	contentBytes, err := os.ReadFile(vttFile)
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

	os.WriteFile(srtFile, []byte(srtContent.String()), 0644)

	log.GetLogger().Info("VTT to SRT conversion completed", zap.String("output", srtFile))
	return nil
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
	utilWords, err := util.ParseVttToWords(stepParam.VttFile)
	if err != nil {
		return fmt.Errorf("translateSrtFile parseVttToWords error: %w", err)
	}
	var words []types.Word
	for _, w := range utilWords {
		words = append(words, types.Word{
			Text:  w.Text,
			Start: w.Start,
			End:   w.End,
			Num:   w.Num,
		})
	}

	// 3. 将字幕块分段，模拟audio2subtitle的逻辑
	const segmentSize = 10
	var finalSrtBlocks []*types.SrtBlock
	totalBlocks := len(srtBlocks)

	for i := 0; i < totalBlocks; i += segmentSize {
		end := i + segmentSize
		if end > totalBlocks {
			end = totalBlocks
		}
		segmentBlocks := srtBlocks[i:end]
		if len(segmentBlocks) == 0 {
			continue
		}

		// 3.1 获取当前分段的时间范围和原文
		var segmentTextBuilder strings.Builder
		var segmentStartTime, segmentEndTime float64
		var timeRangeSet bool

		for _, block := range segmentBlocks {
			segmentTextBuilder.WriteString(block.OriginLanguageSentence)
			segmentTextBuilder.WriteString(" ")

			// 解析当前块的时间戳来确定段落的时间范围
			if block.Timestamp != "" {
				startTime, endTime, err := s.parseSrtTimestampLine(block.Timestamp)
				if err == nil {
					if !timeRangeSet {
						segmentStartTime = startTime
						segmentEndTime = endTime
						timeRangeSet = true
					} else {
						if startTime < segmentStartTime {
							segmentStartTime = startTime
						}
						if endTime > segmentEndTime {
							segmentEndTime = endTime
						}
					}
				}
			}
		}

		segmentText := strings.TrimSpace(segmentTextBuilder.String())
		if segmentText == "" {
			continue
		}

		// 3.1.1 根据时间范围过滤相关的词语
		var segmentWords []types.Word
		if timeRangeSet {
			// 为时间范围添加一些缓冲区以确保不遗漏边界词语
			bufferTime := 5.0 // 5秒缓冲
			filterStartTime := segmentStartTime - bufferTime
			filterEndTime := segmentEndTime + bufferTime

			for _, word := range words {
				// 如果词语的时间范围与段落时间范围有重叠，则包含这个词语
				if word.End >= filterStartTime && word.Start <= filterEndTime {
					segmentWords = append(segmentWords, word)
				}
			}
		}

		// 如果基于时间的过滤没有找到词语，则使用所有词语作为回退
		if len(segmentWords) == 0 {
			log.GetLogger().Warn("Could not find words in time range, using all words as fallback.",
				zap.Int("start_index", i),
				zap.Float64("segment_start_time", segmentStartTime),
				zap.Float64("segment_end_time", segmentEndTime))
			segmentWords = words
		} else {
			log.GetLogger().Info("Found words for segment",
				zap.Int("start_index", i),
				zap.Int("word_count", len(segmentWords)),
				zap.Float64("segment_start_time", segmentStartTime),
				zap.Float64("segment_end_time", segmentEndTime))
		}

		// 3.2 翻译分段文本（优先无标点时间感知切分）
		log.GetLogger().Info("Translating segment", zap.Int("start_index", i), zap.Int("end_index", end))

		useTimeAware := util.IsAsianLanguage(stepParam.OriginLanguage) || s.isPunctuationSparse(segmentText)
		var tempSrtBlocks []*util.SrtBlock

		if useTimeAware && len(segmentWords) > 0 {
			preSentences := s.splitByWordPausesAndLimits(segmentWords, stepParam.OriginLanguage, config.Conf.App.MaxSentenceLength)
			for idx, sent := range preSentences {
				items, err := s.translator.SplitTextAndTranslate(stepParam.TaskBasePath, sent, stepParam.OriginLanguage, stepParam.TargetLanguage, stepParam.EnableModalFilter, i+idx)
				if err != nil {
					log.GetLogger().Warn("translate short sentence failed, skip", zap.Error(err), zap.String("sentence", sent))
					continue
				}
				for _, it := range items {
					tempSrtBlocks = append(tempSrtBlocks, &util.SrtBlock{
						Index:                  len(tempSrtBlocks) + 1,
						OriginLanguageSentence: it.OriginText,
						TargetLanguageSentence: it.TranslatedText,
					})
				}
			}
			if len(tempSrtBlocks) == 0 {
				log.GetLogger().Warn("time-aware split yielded no result, fallback to default translator", zap.Int("start_index", i))
			}
		}

		// 回退：按原有逻辑一次性切分+翻译
		if len(tempSrtBlocks) == 0 {
			translatedItems, err := s.translator.SplitTextAndTranslate(stepParam.TaskBasePath, segmentText, stepParam.OriginLanguage, stepParam.TargetLanguage, stepParam.EnableModalFilter, i)
			if err != nil {
				log.GetLogger().Error("Failed to translate segment, skipping.", zap.Error(err), zap.Int("start_index", i))
				continue
			}
			for itemIndex, item := range translatedItems {
				tempSrtBlocks = append(tempSrtBlocks, &util.SrtBlock{
					Index:                  itemIndex + 1, // Index is relative to the segment
					OriginLanguageSentence: item.OriginText,
					TargetLanguageSentence: item.TranslatedText,
				})
			}
		}

		// 3.4 为当前分段生成时间戳
		timeMatcher := NewTimestampGenerator()
		segmentUtilSrtBlocks, err := timeMatcher.GenerateTimestamps(tempSrtBlocks, segmentWords, stepParam.OriginLanguage, 0)
		if err != nil {
			log.GetLogger().Error("Failed to generate timestamps for segment, skipping.", zap.Error(err), zap.Int("start_index", i))
			continue
		}

		// 3.5 收集处理好的字幕块
		for _, b := range segmentUtilSrtBlocks {
			finalSrtBlocks = append(finalSrtBlocks, &types.SrtBlock{
				// Index需要重新计算以保证全局唯一和递增
				Index:                  len(finalSrtBlocks) + 1,
				Timestamp:              b.Timestamp,
				OriginLanguageSentence: b.OriginLanguageSentence,
				TargetLanguageSentence: b.TargetLanguageSentence,
			})
		}
	}

	stepParam.TaskPtr.ProcessPct = 80

	// 4. 生成各种格式的字幕文件
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
