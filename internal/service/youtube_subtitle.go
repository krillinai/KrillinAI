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

	"go.uber.org/zap"
)

// VttWord 表示VTT文件中的一个单词及其时间戳信息
type VttWord struct {
	Text  string // 单词文本，包含标点符号
	Start string // 开始时间戳字符串 (HH:MM:SS.mmm)
	End   string // 结束时间戳字符串 (HH:MM:SS.mmm)
	Num   int    // 序号
}

type YoutubeSubtitleReq struct {
	TaskBasePath   string
	TaskId         string
	URL            string
	OriginLanguage string
	TargetLanguage string
	VttFile        string
	TaskPtr        *types.SubtitleTask
}

// YouTubeSubtitleService handles all operations related to YouTube subtitles.
type YouTubeSubtitleService struct {
	translator         *Translator
	timestampGenerator *TimestampGenerator
}

// NewYouTubeSubtitleService creates a new YouTubeSubtitleService.
func NewYouTubeSubtitleService() *YouTubeSubtitleService {
	return &YouTubeSubtitleService{
		translator:         NewTranslator(),
		timestampGenerator: NewTimestampGenerator(),
	}
}

// Process handles the entire workflow for YouTube subtitles, from downloading to processing.
func (s *YouTubeSubtitleService) Process(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	// 1. Download subtitle file
	vttFile, err := s.downloadYouTubeSubtitle(ctx, req)
	if err != nil {
		// Return error to let the caller handle fallback (e.g., audio transcription)
		return "", err
	}

	req.VttFile = vttFile

	// 2. Process the downloaded subtitle file
	log.GetLogger().Info("Successfully downloaded YouTube subtitles, processing...", zap.String("taskId", req.TaskId))
	return s.processYouTubeSubtitle(ctx, req)
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

// 使用yt-dlp下载YouTube视频的字幕文件
func (s *YouTubeSubtitleService) downloadYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	if !strings.Contains(req.URL, "youtube.com") {
		return "", fmt.Errorf("downloadYouTubeSubtitle: not a YouTube link")
	}

	// 提取YouTube视频ID
	videoID, err := util.GetYouTubeID(req.URL)
	if err != nil {
		return "", fmt.Errorf("downloadYouTubeSubtitle: failed to extract video ID: %w", err)
	}

	// 确定要下载的字幕语言
	subtitleLang := util.MapLanguageForYouTube(req.OriginLanguage)

	// 构造yt-dlp命令参数，使用视频ID作为文件名
	outputPattern := filepath.Join(req.TaskBasePath, videoID+".%(ext)s")
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
			subtitleFile, err := s.findDownloadedSubtitleFile(req.TaskBasePath, subtitleLang, videoID)
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
func (s *YouTubeSubtitleService) findDownloadedSubtitleFile(taskBasePath, language, videoID string) (string, error) {
	// 支持的字幕文件扩展名
	extensions := []string{".vtt", ".srt"}

	// 构造预期的文件名模式：{videoID}.{ext}
	for _, ext := range extensions {
		expectedFileName := fmt.Sprintf("%s.%s", videoID, ext)
		expectedPath := filepath.Join(taskBasePath, expectedFileName)

		// 检查文件是否存在
		if _, err := os.Stat(expectedPath); err == nil {
			return expectedPath, nil
		}
	}

	// 如果预期的文件名不存在，则回退到遍历目录的方式（兼容旧的命名方式）
	err := filepath.Walk(taskBasePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		fileName := info.Name()
		for _, ext := range extensions {
			// 检查文件名是否包含视频ID、语言代码和对应扩展名
			if strings.Contains(fileName, videoID) && strings.Contains(fileName, language) && strings.HasSuffix(fileName, ext) {
				return fmt.Errorf("found:%s", path) // 使用error来返回找到的文件路径
			}
		}
		return nil
	})

	if err != nil && strings.HasPrefix(err.Error(), "found:") {
		return strings.TrimPrefix(err.Error(), "found:"), nil
	}

	return "", fmt.Errorf("subtitle file not found for video ID: %s, language: %s", videoID, language)
}

// 处理YouTube字幕文件，转换为标准格式并进行翻译
func (s *YouTubeSubtitleService) processYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	if req.VttFile == "" {
		return "", fmt.Errorf("processYouTubeSubtitle: no original subtitle file found")
	}

	log.GetLogger().Info("processYouTubeSubtitle start", zap.Any("taskId", req.TaskId), zap.String("subtitleFile", req.VttFile))

	bilingualSrtFile := filepath.Join(req.TaskBasePath, types.SubtitleTaskBilingualSrtFileName)
	// 1. 转换VTT到SRT格式
	err := s.ConvertVttToSrt(req, bilingualSrtFile)
	if err != nil {
		return "", fmt.Errorf("processYouTubeSubtitle convertToSrtFormat error: %w", err)
	}

	log.GetLogger().Info("processYouTubeSubtitle converted to SRT", zap.Any("taskId", req.TaskId), zap.String("srtFile", bilingualSrtFile))

	return bilingualSrtFile, nil
}

// ExtractWordsFromVtt 从VTT文件中提取所有单词及其时间戳信息
func (s *YouTubeSubtitleService) ExtractWordsFromVtt(vttFile string) ([]VttWord, error) {
	// 记录正在尝试打开的文件路径
	log.GetLogger().Info("Attempting to open VTT file", zap.String("filePath", vttFile))

	file, err := os.Open(vttFile)
	if err != nil {
		return nil, fmt.Errorf("读取VTT文件失败: %w", err)
	}
	defer file.Close()

	var words []VttWord
	scanner := bufio.NewScanner(file)
	var blockStartTime, blockEndTime string
	wordNum := 0

	// 匹配时间戳行的正则表达式（支持有空格和无空格的格式）
	timestampLineRegex := regexp.MustCompile(`^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})`)
	// 匹配单词级时间戳的正则表达式
	wordTimeRegex := regexp.MustCompile(`<(\d{2}:\d{2}:\d{2}\.\d{3})>`)
	// 清理样式标签
	styleTagRegex := regexp.MustCompile(`</?c[^>]*>`)

	log.GetLogger().Debug("开始解析VTT文件", zap.String("文件", vttFile))

	// 用于跟踪已处理的单词，避免重复
	processedWords := make(map[string]bool)
	// 用于跟踪单词文本，避免同一个单词重复添加
	seenWordTexts := make(map[string]bool)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// 跳过空行和头部信息
		if line == "" || strings.HasPrefix(line, "WEBVTT") ||
			strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
			continue
		}

		// 检查是否是时间戳行（可能包含align等属性）
		if matches := timestampLineRegex.FindStringSubmatch(line); len(matches) >= 3 {
			blockStartTime = matches[1]
			blockEndTime = matches[2]
			log.GetLogger().Debug("发现时间戳", zap.String("开始", blockStartTime), zap.String("结束", blockEndTime))
			continue
		}

		// 如果不是时间戳行，且有有效的时间戳信息，则处理内容
		if blockStartTime != "" && blockEndTime != "" && line != "" {
			// 首先清理HTML实体和特殊字符
			cleanedLine := s.cleanVttText(line)

			// 如果清理后为空或只是空白字符，跳过
			if strings.TrimSpace(cleanedLine) == "" {
				continue
			}

			// 优先处理包含内联时间戳的行（这些是真正的单词级时间戳数据）
			if wordTimeRegex.MatchString(cleanedLine) {
				// 处理包含单词级时间戳的行
				styleCleaned := styleTagRegex.ReplaceAllString(cleanedLine, "")
				wordsFromLine := s.parseWordsWithTimestamps(styleCleaned, blockStartTime, blockEndTime, &wordNum)

				// 添加带时间戳的单词，这些有更高优先级
				for _, word := range wordsFromLine {
					// 再次清理单词文本
					word.Text = s.cleanVttText(word.Text)
					if strings.TrimSpace(word.Text) == "" {
						continue // 跳过空的单词
					}

					wordKey := fmt.Sprintf("%s-%s-%s", word.Text, word.Start, word.End)
					if !processedWords[wordKey] {
						words = append(words, word)
						processedWords[wordKey] = true
						// 同时记录这个单词文本已经被处理过
						seenWordTexts[strings.ToLower(word.Text)] = true
						log.GetLogger().Debug("添加带时间戳的单词",
							zap.String("文本", word.Text),
							zap.String("开始", word.Start),
							zap.String("结束", word.End))
					}
				}
			} else {
				// 对于没有内联时间戳的行，需要更严格的判断
				trimmedLine := strings.TrimSpace(cleanedLine)

				// 跳过明显的重复内容行（通常是完整句子的重复）
				if s.isLikelyRepeatContent(trimmedLine) {
					log.GetLogger().Debug("跳过重复内容", zap.String("文本", trimmedLine))
					continue
				}

				// 检查是否为有效的单个单词
				if s.isValidSingleWord(trimmedLine) {
					// 检查这个单词文本是否已经被处理过（忽略大小写）
					wordTextLower := strings.ToLower(trimmedLine)
					if seenWordTexts[wordTextLower] {
						log.GetLogger().Debug("跳过重复单词",
							zap.String("文本", trimmedLine),
							zap.String("时间", blockStartTime+" -> "+blockEndTime))
						continue
					}

					// 创建单词的唯一标识
					wordKey := fmt.Sprintf("%s-%s-%s", trimmedLine, blockStartTime, blockEndTime)
					if !processedWords[wordKey] {
						wordNum++
						word := VttWord{
							Text:  trimmedLine,
							Start: blockStartTime,
							End:   blockEndTime,
							Num:   wordNum,
						}
						words = append(words, word)
						processedWords[wordKey] = true
						seenWordTexts[wordTextLower] = true
						log.GetLogger().Debug("添加单个单词",
							zap.String("文本", trimmedLine),
							zap.String("开始", blockStartTime),
							zap.String("结束", blockEndTime))
					}
				} else {
					// 跳过完整句子或无效内容
					log.GetLogger().Debug("跳过完整句子或无效内容", zap.String("文本", trimmedLine))
				}
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("读取VTT文件失败: %v", err)
	}

	log.GetLogger().Info("VTT单词解析完成", zap.Int("总单词数", len(words)))
	return words, nil
}

// cleanVttText 清理VTT文本中的HTML实体和特殊字符，包括音乐标记等
func (s *YouTubeSubtitleService) cleanVttText(text string) string {
	if text == "" {
		return text
	}

	// 先过滤音乐和其他提示标记（方括号内容）
	// 匹配 [music], [applause], [laughter], [inaudible] 等标记
	bracketRegex := regexp.MustCompile(`\[[^\]]*\]`)
	cleanedText := bracketRegex.ReplaceAllString(text, "")

	// 过滤圆括号内的提示（如 (music), (applause) 等）- 更全面的匹配
	parenRegex := regexp.MustCompile(`\([^)]*(?i:music|applause|laughter|laugh|inaudible|mumbling|cheering|whistling|booing|silence|noise|sound|audio)[^)]*\)`)
	cleanedText = parenRegex.ReplaceAllString(cleanedText, "")

	// 过滤音乐符号和表情符号
	musicSymbolRegex := regexp.MustCompile(`[♪♫♬♩🎵🎶🎤🎧🎼🎹🎸🎺🎻🥁]`)
	cleanedText = musicSymbolRegex.ReplaceAllString(cleanedText, "")

	// HTML实体解码映射
	htmlEntities := map[string]string{
		"&gt;&gt;": ">>", // 大于号双引号
		"&gt;":     ">",  // 大于号
		"&lt;&lt;": "<<", // 小于号双引号
		"&lt;":     "<",  // 小于号
		"&amp;":    "&",  // &符号
		"&quot;":   "\"", // 双引号
		"&apos;":   "'",  // 单引号
		"&nbsp;":   " ",  // 不间断空格
		"&#39;":    "'",  // 单引号的数字实体
		"&#34;":    "\"", // 双引号的数字实体
		"&#8203;":  "",   // 零宽度空格
		"&#8204;":  "",   // 零宽度非连接符
		"&#8205;":  "",   // 零宽度连接符
	}

	// 替换HTML实体
	for entity, replacement := range htmlEntities {
		cleanedText = strings.ReplaceAll(cleanedText, entity, replacement)
	}

	// 移除多余的空格
	cleanedText = strings.TrimSpace(cleanedText)

	// 将多个连续空格替换为单个空格
	spaceRegex := regexp.MustCompile(`\s+`)
	cleanedText = spaceRegex.ReplaceAllString(cleanedText, " ")

	return cleanedText
}

// isPurePunctuation 检查文本是否只包含标点符号
func (s *YouTubeSubtitleService) isPurePunctuation(text string) bool {
	if text == "" {
		return false
	}

	// 定义标点符号正则表达式（只包含标点符号，不包含字母和数字）
	punctOnlyRegex := regexp.MustCompile(`^[^\p{L}\p{N}]+$`)
	return punctOnlyRegex.MatchString(text)
}

// isAudioCue 检查是否为音频提示词（如music等）
func (s *YouTubeSubtitleService) isAudioCue(text string) bool {
	if text == "" {
		return false
	}

	// 将文本转为小写进行匹配
	lowerText := strings.ToLower(text)

	// 精确匹配的音频提示词列表（完全匹配，不使用Contains）
	exactAudioCues := []string{
		"music", "applause", "laughter", "laugh", "clapping", "clap",
		"cheering", "cheer", "whistling", "whistle", "booing", "boo",
		"silence", "quiet", "noise", "sound", "audio", "inaudible",
		"mumbling", "mumble", "sighing", "sigh", "gasping", "gasp",
		"crying", "cry", "sobbing", "sob", "screaming", "scream",
		"shouting", "shout", "yelling", "yell", "singing", "sing",
		"humming", "hum", "buzzing", "buzz", "ringing", "ring",
		"beeping", "beep", "clicking", "click", "ticking", "tick",
		"background", "bgm", "sfx", "fx", "effect", "effects",
	}

	// 检查是否完全匹配任何音频提示词
	for _, cue := range exactAudioCues {
		if lowerText == cue {
			return true
		}
	}

	// 检查是否包含特殊字符模式（如♪, ♫, ♬等音乐符号）
	musicSymbolRegex := regexp.MustCompile(`[♪♫♬♩🎵🎶]`)
	if musicSymbolRegex.MatchString(text) {
		return true
	}

	return false
}

// isLikelyRepeatContent 检查是否为重复的内容行（通常是完整句子）
func (s *YouTubeSubtitleService) isLikelyRepeatContent(text string) bool {
	if text == "" {
		return false
	}

	// 如果包含多个单词（有空格），很可能是重复的完整句子
	if strings.Contains(text, " ") {
		return true
	}

	// 如果文本很长（超过20个字符），也可能是重复内容
	if len(text) > 20 {
		return true
	}

	return false
}

// isValidSingleWord 检查是否为有效的单个单词
func (s *YouTubeSubtitleService) isValidSingleWord(text string) bool {
	if text == "" {
		return false
	}

	// 不能包含空格（单个单词）
	if strings.Contains(text, " ") {
		return false
	}

	// 检查是否为音乐或其他提示标记
	if s.isAudioCue(text) {
		return false
	}

	// 不能只是标点符号
	if s.isPurePunctuation(text) {
		return false
	}

	// 长度需要合理（1-15个字符）
	if len(text) < 1 || len(text) > 15 {
		return false
	}

	return true
}

// parseWordsWithTimestamps 解析包含时间戳的内容行，保持标点符号与单词的完整性
func (s *YouTubeSubtitleService) parseWordsWithTimestamps(line, blockStart, blockEnd string, wordNum *int) []VttWord {
	var words []VttWord

	// 匹配单词级时间戳
	wordTimeRegex := regexp.MustCompile(`<(\d{2}:\d{2}:\d{2}\.\d{3})>`)

	// 按时间戳分割文本
	timeMatches := wordTimeRegex.FindAllStringSubmatch(line, -1)
	textParts := wordTimeRegex.Split(line, -1)

	log.GetLogger().Debug("解析行内容",
		zap.String("原始行", line),
		zap.Int("时间戳数量", len(timeMatches)),
		zap.Int("文本片段数量", len(textParts)))

	// 处理第一个文本片段（开始到第一个时间戳）
	if len(textParts) > 0 && strings.TrimSpace(textParts[0]) != "" {
		firstWordText := strings.TrimSpace(textParts[0])
		var endTime string
		if len(timeMatches) > 0 {
			endTime = timeMatches[0][1]
		} else {
			endTime = blockEnd
		}

		// 分割成单词但保持标点符号
		wordsInPart := s.splitIntoWordsKeepPunctuation(firstWordText)
		for _, wordText := range wordsInPart {
			words = append(words, VttWord{
				Text:  wordText,
				Start: blockStart,
				End:   endTime,
				Num:   *wordNum,
			})
			(*wordNum)++
		}
	}

	// 处理剩余的文本片段
	for i := 1; i < len(textParts); i++ {
		textPart := strings.TrimSpace(textParts[i])
		if textPart == "" {
			continue
		}

		// 确定开始时间
		startTime := timeMatches[i-1][1]

		// 确定结束时间
		var endTime string
		if i < len(timeMatches) {
			endTime = timeMatches[i][1]
		} else {
			endTime = blockEnd
		}

		// 分割成单词但保持标点符号
		wordsInPart := s.splitIntoWordsKeepPunctuation(textPart)
		for _, wordText := range wordsInPart {
			words = append(words, VttWord{
				Text:  wordText,
				Start: startTime,
				End:   endTime,
				Num:   *wordNum,
			})
			(*wordNum)++
		}
	}

	return words
}

// splitIntoWordsKeepPunctuation 将文本分割成单词，但保持标点符号与单词的完整性
func (s *YouTubeSubtitleService) splitIntoWordsKeepPunctuation(text string) []string {
	if strings.TrimSpace(text) == "" {
		return nil
	}

	// 使用空格分割，但保持标点符号与单词在一起
	rawWords := strings.Fields(text)
	var result []string

	for _, word := range rawWords {
		// 清理每个单词中的特殊字符
		cleanedWord := s.cleanVttText(word)
		if strings.TrimSpace(cleanedWord) != "" {
			result = append(result, cleanedWord)
		}
	}

	return result
}

// ConvertVttToSrt 将VTT转换为SRT格式
func (s *YouTubeSubtitleService) ConvertVttToSrt(req *YoutubeSubtitleReq, srtFile string) error {
	// 检查VttFile字段是否存在
	vttFilePath := req.VttFile
	if vttFilePath == "" {
		// 如果VttFile为空，尝试在任务目录中查找VTT文件
		log.GetLogger().Warn("VTT file path is empty, trying to find VTT file in task directory",
			zap.String("taskBasePath", req.TaskBasePath))

		foundVttFile, err := s.findVttFileInDirectory(req.TaskBasePath)
		if err != nil {
			return fmt.Errorf("VTT file path is empty and failed to find VTT file in directory: %w", err)
		}
		vttFilePath = foundVttFile
		log.GetLogger().Info("Found VTT file in task directory", zap.String("vttFile", vttFilePath))
	}

	// 使用新的ExtractWordsFromVtt函数获取VttWord
	vttWords, err := s.ExtractWordsFromVtt(vttFilePath)
	if err != nil {
		return fmt.Errorf("failed to extract VTT words: %w", err)
	}

	// 将VttWord转换为SRT格式
	return s.writeVttWordsToSrt(vttWords, srtFile, req)
}

// findVttFileInDirectory 在指定目录中查找VTT文件
func (s *YouTubeSubtitleService) findVttFileInDirectory(dir string) (string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", fmt.Errorf("failed to read directory %s: %w", dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		fileName := entry.Name()
		if strings.HasSuffix(strings.ToLower(fileName), ".vtt") {
			fullPath := filepath.Join(dir, fileName)
			log.GetLogger().Info("Found VTT file", zap.String("file", fullPath))
			return fullPath, nil
		}
	}

	return "", fmt.Errorf("no VTT file found in directory: %s", dir)
}

// writeVttWordsToSrt 将VttWord数组写入SRT文件，支持翻译和时间戳生成
func (s *YouTubeSubtitleService) writeVttWordsToSrt(vttWords []VttWord, srtFile string, req *YoutubeSubtitleReq) error {
	if len(vttWords) == 0 {
		return fmt.Errorf("no VTT words to write")
	}

	// 初始进度基准（从当前进度开始，到90%结束）
	baseProgress := uint8(10) // 假设函数开始时已有10%进度
	if req.TaskPtr != nil && req.TaskPtr.ProcessPct > 0 {
		baseProgress = req.TaskPtr.ProcessPct
	}
	targetProgress := uint8(90) // 函数完成时的目标进度

	// 步骤1: 根据标点符号将单词整理成完整的句子 (约占总进度的10%)
	sentences := s.groupWordsIntoSentences(vttWords)
	if len(sentences) == 0 {
		return fmt.Errorf("no sentences formed from VTT words")
	}

	// 更新进度到15%
	if req.TaskPtr != nil {
		req.TaskPtr.ProcessPct = baseProgress + uint8(float64(targetProgress-baseProgress)*0.1)
		log.GetLogger().Info("Progress updated after grouping sentences",
			zap.Uint8("progress", req.TaskPtr.ProcessPct))
	}

	log.GetLogger().Info("Grouped VTT words into sentences", zap.Int("句子数", len(sentences)))

	// 创建初始的SrtBlock列表
	srtBlocks := make([]*util.SrtBlock, 0, 2*len(sentences))

	// 使用并发翻译，同时保证顺序
	type translationResult struct {
		index  int
		blocks []*util.SrtBlock
		err    error
	}

	// 创建结果通道和goroutine数量控制
	resultCh := make(chan translationResult, len(sentences))
	maxConcurrency := 5 // 限制并发数量，避免请求过多
	semaphore := make(chan struct{}, maxConcurrency)

	// 启动并发翻译
	for idx, sentence := range sentences {
		go func(index int, sent Sentence) {
			// 获取信号量
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			translatedBlocks, err := s.translator.SplitTextAndTranslate(sent.Text, types.StandardLanguageCode(req.OriginLanguage), types.StandardLanguageCode(req.TargetLanguage))
			if err != nil {
				log.GetLogger().Warn("Translation failed, using original text",
					zap.Int("index", index),
					zap.Error(err))
				resultCh <- translationResult{index: index, blocks: nil, err: err}
				return
			}

			// 构建临时SrtBlock
			notsSrtBlock := make([]*util.SrtBlock, 0, len(translatedBlocks))
			for _, block := range translatedBlocks {
				notsSrtBlock = append(notsSrtBlock, &util.SrtBlock{
					OriginLanguageSentence: block.OriginText,
					TargetLanguageSentence: block.TranslatedText,
				})
			}

			// 生成时间戳
			updatedBlocks, err := s.timestampGenerator.GenerateTimestamps(
				notsSrtBlock,
				s.convertVttWordsToTypesWords(sent.Words),
				types.StandardLanguageCode("base"), // 默认使用base语言类型
				0.0,                                // 时间偏移
			)
			if err != nil {
				log.GetLogger().Warn("Timestamp generation failed",
					zap.Int("index", index),
					zap.Error(err))
				updatedBlocks = notsSrtBlock // 使用未生成时间戳的块
			}

			resultCh <- translationResult{index: index, blocks: updatedBlocks, err: nil}
		}(idx, sentence)
	}

	// 收集结果，按顺序排列，实时更新进度 (占总进度的70%)
	results := make(map[int][]*util.SrtBlock)
	completedTasks := 0
	translationProgressBase := baseProgress + uint8(float64(targetProgress-baseProgress)*0.1) // 15%
	translationProgressRange := uint8(float64(targetProgress-baseProgress) * 0.7)             // 70%的进度范围

	for i := 0; i < len(sentences); i++ {
		result := <-resultCh
		completedTasks++

		if result.err == nil {
			results[result.index] = result.blocks
		}

		// 实时更新翻译进度
		if req.TaskPtr != nil {
			currentTranslationProgress := float64(completedTasks) / float64(len(sentences))
			req.TaskPtr.ProcessPct = translationProgressBase + uint8(float64(translationProgressRange)*currentTranslationProgress)

			// 每完成5个或完成所有任务时记录日志
			if completedTasks%5 == 0 || completedTasks == len(sentences) {
				log.GetLogger().Info("Translation progress updated",
					zap.Int("completed", completedTasks),
					zap.Int("total", len(sentences)),
					zap.Uint8("progress", req.TaskPtr.ProcessPct))
			}
		}
	}

	// 按顺序添加到最终的srtBlocks (占总进度的10%)
	var blockIndex int
	for i := 0; i < len(sentences); i++ {
		if blocks, exists := results[i]; exists {
			for _, block := range blocks {
				srtBlocks = append(srtBlocks, &util.SrtBlock{
					Index:                  blockIndex + 1,
					Timestamp:              block.Timestamp,
					OriginLanguageSentence: block.OriginLanguageSentence,
					TargetLanguageSentence: block.TargetLanguageSentence,
				})
				blockIndex++
			}
		}
	}

	// 更新进度到85%（结果整理完成）
	if req.TaskPtr != nil {
		req.TaskPtr.ProcessPct = baseProgress + uint8(float64(targetProgress-baseProgress)*0.85)
		log.GetLogger().Info("Progress updated after organizing results",
			zap.Uint8("progress", req.TaskPtr.ProcessPct))
	}

	// 步骤6: 写入正常的SRT文件
	err := s.writeSrtBlocksToFile(srtBlocks, srtFile)
	if err != nil {
		return err
	}

	// 更新进度到88%（正常SRT文件写入完成）
	if req.TaskPtr != nil {
		req.TaskPtr.ProcessPct = baseProgress + uint8(float64(targetProgress-baseProgress)*0.88)
		log.GetLogger().Info("Progress updated after writing SRT file",
			zap.Uint8("progress", req.TaskPtr.ProcessPct))
	}

	// 步骤7: 生成短字幕文件
	shortSrtFile := filepath.Join(filepath.Dir(srtFile), types.SubtitleTaskShortOriginMixedSrtFileName)
	err = s.writeShortMixedSrtFile(srtBlocks, shortSrtFile, sentences)
	if err != nil {
		return err
	}

	// 最终更新进度到90%（所有操作完成）
	if req.TaskPtr != nil {
		req.TaskPtr.ProcessPct = targetProgress
		log.GetLogger().Info("writeVttWordsToSrt completed",
			zap.Uint8("final_progress", req.TaskPtr.ProcessPct),
			zap.Int("total_srt_blocks", len(srtBlocks)))
	}

	return nil
}

// Sentence 表示一个完整的句子及其时间信息
type Sentence struct {
	Text      string    // 句子文本
	Words     []VttWord // 组成句子的单词
	StartTime string    // 句子开始时间
	EndTime   string    // 句子结束时间
}

// groupWordsIntoSentences 根据标点符号将单词分组成完整的句子
func (s *YouTubeSubtitleService) groupWordsIntoSentences(words []VttWord) []Sentence {
	if len(words) == 0 {
		return nil
	}

	// 第一步：按整句标点符号分割（句号、问号、感叹号）
	primarySentences := s.splitByPrimarySentencePunctuation(words)

	// 第二步：对超长的句子按逗号、分号等进行二次分割
	var finalSentences []Sentence
	for _, sentence := range primarySentences {
		if util.CountEffectiveChars(sentence.Text) > config.Conf.App.MaxSentenceLength {
			// 超长句子，按逗号等进行二次分割
			secondarySentences := s.splitBySecondarySentencePunctuation(sentence.Words)
			finalSentences = append(finalSentences, secondarySentences...)
		} else {
			// 句子长度合适，直接保留
			finalSentences = append(finalSentences, sentence)
		}
	}

	log.GetLogger().Debug("Grouped words into sentences",
		zap.Int("总单词数", len(words)),
		zap.Int("一级分割句子数", len(primarySentences)),
		zap.Int("最终句子数", len(finalSentences)))

	return finalSentences
}

// GroupWordsIntoSentencesPublic 公开的分组方法，用于测试
func (s *YouTubeSubtitleService) GroupWordsIntoSentencesPublic(words []VttWord) []Sentence {
	return s.groupWordsIntoSentences(words)
}

// ExtractWordsFromVttPublic 公开的VTT提取方法，用于测试
func (s *YouTubeSubtitleService) ExtractWordsFromVttPublic(vttFile string) ([]VttWord, error) {
	return s.ExtractWordsFromVtt(vttFile)
}

// SplitBySecondarySentencePunctuationPublic 公开的二次分割方法，用于测试
func (s *YouTubeSubtitleService) SplitBySecondarySentencePunctuationPublic(words []VttWord) []Sentence {
	return s.splitBySecondarySentencePunctuation(words)
}

// CleanVttTextPublic 公开的文本清理方法，用于测试
func (s *YouTubeSubtitleService) CleanVttTextPublic(text string) string {
	return s.cleanVttText(text)
}

// IsValidSingleWordPublic 公开的单词验证方法，用于测试
func (s *YouTubeSubtitleService) IsValidSingleWordPublic(text string) bool {
	return s.isValidSingleWord(text)
}

// IsAudioCuePublic 公开的音频提示检测方法，用于测试
func (s *YouTubeSubtitleService) IsAudioCuePublic(text string) bool {
	return s.isAudioCue(text)
}

// endsWithSentencePunctuation 检查文本是否以句子结束标点符号结尾
func (s *YouTubeSubtitleService) endsWithSentencePunctuation(text string, punctuation []rune) bool {
	if text == "" {
		return false
	}

	textRunes := []rune(text)
	lastRune := textRunes[len(textRunes)-1]

	for _, punct := range punctuation {
		if lastRune == punct {
			return true
		}
	}
	return false
}

// splitByPrimarySentencePunctuation 按整句标点符号（句号、问号、感叹号）分割
func (s *YouTubeSubtitleService) splitByPrimarySentencePunctuation(words []VttWord) []Sentence {
	if len(words) == 0 {
		return nil
	}

	var sentences []Sentence
	var currentWords []VttWord
	primaryEndPunctuation := []rune{'.', '!', '?', '。', '！', '？'}

	for _, word := range words {
		currentWords = append(currentWords, word)

		// 检查单词是否以整句结束标点符号结尾
		if s.endsWithSentencePunctuation(word.Text, primaryEndPunctuation) {
			if len(currentWords) > 0 {
				sentence := s.createSentenceFromWords(currentWords)
				sentences = append(sentences, sentence)
				currentWords = []VttWord{} // 重置
			}
		}
	}

	// 处理最后一组单词（如果没有以标点结尾）
	if len(currentWords) > 0 {
		sentence := s.createSentenceFromWords(currentWords)
		sentences = append(sentences, sentence)
	}

	return sentences
}

// splitBySecondarySentencePunctuation 按逗号、分号等断句标点符号分割
func (s *YouTubeSubtitleService) splitBySecondarySentencePunctuation(words []VttWord) []Sentence {
	if len(words) == 0 {
		return nil
	}

	var sentences []Sentence
	var currentWords []VttWord
	secondaryEndPunctuation := []rune{',', ';', '，', '；'} // 中英文逗号和分号
	foundPunctuation := false                             // 跟踪是否找到了标点符号

	for _, word := range words {
		currentWords = append(currentWords, word)

		// 检查单词是否以逗号或分号结尾
		if s.endsWithSentencePunctuation(word.Text, secondaryEndPunctuation) {
			foundPunctuation = true
			if len(currentWords) > 0 {
				sentence := s.createSentenceFromWords(currentWords)
				sentences = append(sentences, sentence)
				currentWords = []VttWord{} // 重置
			}
		}
	}

	// 处理最后一组单词
	if len(currentWords) > 0 {
		sentence := s.createSentenceFromWords(currentWords)
		sentences = append(sentences, sentence)
	}

	// 如果没有找到可分割的标点符号，使用智能分句策略
	if !foundPunctuation {
		log.GetLogger().Info("No punctuation found, using smart sentence splitting",
			zap.Int("total_words", len(words)))
		return s.splitBySmartRules(words)
	}

	// 如果找到标点符号但句子仍然过长，也使用智能分句作为补充
	for _, sentence := range sentences {
		if util.CountEffectiveChars(sentence.Text) > config.Conf.App.MaxSentenceLength {
			log.GetLogger().Info("Found long sentence even after punctuation split, using smart splitting",
				zap.Int("sentence_length", util.CountEffectiveChars(sentence.Text)),
				zap.Int("max_length", config.Conf.App.MaxSentenceLength))
			return s.splitBySmartRules(words)
		}
	}

	return sentences
}

// createSentenceFromWords 从单词列表创建句子
func (s *YouTubeSubtitleService) createSentenceFromWords(words []VttWord) Sentence {
	if len(words) == 0 {
		return Sentence{}
	}

	var textParts []string
	for _, word := range words {
		textParts = append(textParts, word.Text)
	}

	return Sentence{
		Text:      strings.Join(textParts, " "),
		Words:     words,
		StartTime: words[0].Start,
		EndTime:   words[len(words)-1].End,
	}
}

// convertVttWordsToTypesWords 将VttWord转换为types.Word供时间戳生成器使用
func (s *YouTubeSubtitleService) convertVttWordsToTypesWords(vttWords []VttWord) []types.Word {
	var typesWords []types.Word

	for _, vttWord := range vttWords {
		// 将字符串时间戳转换为float64
		startTime, _ := s.parseVttTime(vttWord.Start)
		endTime, _ := s.parseVttTime(vttWord.End)

		typesWords = append(typesWords, types.Word{
			Text:  vttWord.Text,
			Start: startTime,
			End:   endTime,
			Num:   vttWord.Num,
		})
	}

	return typesWords
}

// writeSrtBlocksToFile 将SrtBlock数组写入文件
func (s *YouTubeSubtitleService) writeSrtBlocksToFile(blocks []*util.SrtBlock, srtFile string) error {
	file, err := os.Create(srtFile)
	if err != nil {
		return fmt.Errorf("failed to create SRT file: %w", err)
	}
	defer file.Close()

	for _, block := range blocks {
		// 写入序号
		_, err = file.WriteString(fmt.Sprintf("%d\n", block.Index))
		if err != nil {
			return err
		}

		// 写入时间戳
		_, err = file.WriteString(block.Timestamp + "\n")
		if err != nil {
			return err
		}

		// 写入文本内容 - 双语显示：目标语言在上，原语言在下
		var textContent strings.Builder
		if block.TargetLanguageSentence != "" {
			textContent.WriteString(block.TargetLanguageSentence)
			if block.OriginLanguageSentence != "" {
				textContent.WriteString("\n")
				textContent.WriteString(block.OriginLanguageSentence)
			}
		} else if block.OriginLanguageSentence != "" {
			// 如果没有翻译，只显示原语言
			textContent.WriteString(block.OriginLanguageSentence)
		}

		if textContent.Len() > 0 {
			_, err = file.WriteString(textContent.String() + "\n\n")
			if err != nil {
				return err
			}
		}
	}

	log.GetLogger().Info("SRT file written successfully",
		zap.String("文件", srtFile),
		zap.Int("块数", len(blocks)))

	return nil
}

// writeShortMixedSrtFile 生成短字幕文件，基于已拆分的长字幕SRT块
func (s *YouTubeSubtitleService) writeShortMixedSrtFile(srtBlocks []*util.SrtBlock, shortSrtFile string, sentences []Sentence) error {
	file, err := os.Create(shortSrtFile)
	if err != nil {
		return fmt.Errorf("failed to create short SRT file: %w", err)
	}
	defer file.Close()

	blockIndex := 1
	wordsPerSegment := 6 // 每个短字幕显示的单词数量

	// 添加usedIndices跟踪已使用的VTT单词
	allWords := s.getAllWordsFromSentences(sentences)
	usedIndices := make(map[int]bool)

	for _, srtBlock := range srtBlocks {
		// 先写入完整的目标语言字幕块（中文翻译）
		if srtBlock.TargetLanguageSentence != "" {
			_, err = file.WriteString(fmt.Sprintf("%d\n", blockIndex))
			if err != nil {
				return err
			}

			_, err = file.WriteString(srtBlock.Timestamp + "\n")
			if err != nil {
				return err
			}

			_, err = file.WriteString(srtBlock.TargetLanguageSentence + "\n\n")
			if err != nil {
				return err
			}
			blockIndex++
		}

		// 处理对应的原始语言（英文），按单词拆分
		if srtBlock.OriginLanguageSentence != "" {
			// 将原始语言句子按空格分割成单词，并清理多余的引号
			originText := strings.TrimSpace(srtBlock.OriginLanguageSentence)
			// 清理开头和结尾的多余引号
			originText = strings.Trim(originText, `"'`)
			words := strings.Fields(originText)

			// 找到整个SRT块对应的VttWord序列，使用跟踪版本避免重复匹配
			correspondingVttWords := s.findCorrespondingWordsWithTracking(srtBlock, allWords, usedIndices)

			log.GetLogger().Debug("Processing SRT block for short subtitles",
				zap.String("originText", originText),
				zap.Int("wordsCount", len(words)),
				zap.Int("correspondingVttWordsCount", len(correspondingVttWords)))

			// 按指定数量拆分单词
			for wordStart := 0; wordStart < len(words); wordStart += wordsPerSegment {
				wordEnd := wordStart + wordsPerSegment
				if wordEnd > len(words) {
					wordEnd = len(words)
				}

				segmentWords := words[wordStart:wordEnd]
				if len(segmentWords) == 0 {
					continue
				}

				segmentText := strings.Join(segmentWords, " ")

				// 计算这个片段对应的VTT单词时间戳
				var srtTimestamp string
				if len(correspondingVttWords) > 0 && len(words) > 0 {
					// 计算片段在整个SRT块中的相对位置
					startRatio := float64(wordStart) / float64(len(words))
					endRatio := float64(wordEnd) / float64(len(words))

					// 映射到correspondingVttWords中的位置
					vttStartIdx := int(startRatio * float64(len(correspondingVttWords)))
					vttEndIdx := int(endRatio * float64(len(correspondingVttWords)))

					// 确保索引在有效范围内
					if vttStartIdx >= len(correspondingVttWords) {
						vttStartIdx = len(correspondingVttWords) - 1
					}
					if vttEndIdx > len(correspondingVttWords) {
						vttEndIdx = len(correspondingVttWords)
					}
					if vttEndIdx <= vttStartIdx {
						vttEndIdx = vttStartIdx + 1
					}

					// 获取时间戳
					startTime := correspondingVttWords[vttStartIdx].Start
					endTime := correspondingVttWords[vttEndIdx-1].End

					log.GetLogger().Debug("Calculated segment timestamps",
						zap.String("segmentText", segmentText),
						zap.Int("vttStartIdx", vttStartIdx),
						zap.Int("vttEndIdx", vttEndIdx),
						zap.String("startTime", startTime),
						zap.String("endTime", endTime))

					var err error
					srtTimestamp, err = s.convertToSrtTimestamp(startTime, endTime)
					if err != nil {
						srtTimestamp = srtBlock.Timestamp
						log.GetLogger().Warn("Failed to convert timestamp, using SRT block timestamp", zap.Error(err))
					}
				} else {
					// Fallback到SRT块时间戳
					srtTimestamp = srtBlock.Timestamp
					log.GetLogger().Warn("No corresponding VTT words found, using SRT block timestamp",
						zap.Int("correspondingVttWordsCount", len(correspondingVttWords)),
						zap.Int("wordsCount", len(words)))
				}

				// 写入源语言片段
				_, err = file.WriteString(fmt.Sprintf("%d\n", blockIndex))
				if err != nil {
					return err
				}

				_, err = file.WriteString(srtTimestamp + "\n")
				if err != nil {
					return err
				}

				_, err = file.WriteString(segmentText + "\n\n")
				if err != nil {
					return err
				}
				blockIndex++
			}
		}
	}

	log.GetLogger().Info("Short mixed SRT file written successfully",
		zap.String("文件", shortSrtFile),
		zap.Int("总块数", blockIndex-1))

	return nil
}

// findVttWordsForText 根据文本内容在句子中找到对应的VttWord
func (s *YouTubeSubtitleService) findVttWordsForText(text string, sentences []Sentence) []VttWord {
	textWords := strings.Fields(strings.TrimSpace(text))
	if len(textWords) == 0 {
		return []VttWord{}
	}

	// 在所有句子中寻找匹配的单词序列
	for _, sentence := range sentences {
		if len(sentence.Words) < len(textWords) {
			continue
		}

		// 尝试在这个句子中找到匹配的单词序列
		for startIdx := 0; startIdx <= len(sentence.Words)-len(textWords); startIdx++ {
			match := true
			for i, expectedWord := range textWords {
				actualWord := strings.TrimSpace(sentence.Words[startIdx+i].Text)
				expectedClean := strings.Trim(expectedWord, ".,!?;:")
				actualClean := strings.Trim(actualWord, ".,!?;:")

				if !strings.EqualFold(expectedClean, actualClean) {
					match = false
					break
				}
			}

			if match {
				return sentence.Words[startIdx : startIdx+len(textWords)]
			}
		}
	}

	return []VttWord{}
}

// getAllWordsFromSentences 从所有句子中获取所有单词的扁平列表
func (s *YouTubeSubtitleService) getAllWordsFromSentences(sentences []Sentence) []VttWord {
	var allWords []VttWord
	for _, sentence := range sentences {
		allWords = append(allWords, sentence.Words...)
	}
	return allWords
}

// findCorrespondingWords 根据SRT块的原始文本找到对应的原始单词
func (s *YouTubeSubtitleService) findCorrespondingWords(srtBlock *util.SrtBlock, allWords []VttWord) []VttWord {
	if srtBlock.OriginLanguageSentence == "" {
		return []VttWord{}
	}

	// 基于文本内容匹配，而不是时间戳匹配
	originText := strings.TrimSpace(srtBlock.OriginLanguageSentence)
	// 清理开头和结尾的引号
	originText = strings.Trim(originText, `"'`)

	// 将原始文本按空格分割成单词
	expectedWords := strings.Fields(originText)
	if len(expectedWords) == 0 {
		return []VttWord{}
	}

	log.GetLogger().Debug("Finding corresponding words",
		zap.String("originText", originText),
		zap.Int("expectedWordsCount", len(expectedWords)),
		zap.Int("allWordsCount", len(allWords)))

	// 在所有单词中查找匹配的序列
	var correspondingWords []VttWord

	for i := 0; i <= len(allWords)-len(expectedWords); i++ {
		// 检查从位置i开始是否匹配expectedWords序列
		match := true
		candidateWords := make([]VttWord, len(expectedWords))

		for j, expectedWord := range expectedWords {
			if i+j >= len(allWords) {
				match = false
				break
			}

			actualWord := strings.TrimSpace(allWords[i+j].Text)
			// 移除标点符号进行比较
			expectedWordClean := strings.Trim(expectedWord, ".,!?;:")
			actualWordClean := strings.Trim(actualWord, ".,!?;:")

			if !strings.EqualFold(expectedWordClean, actualWordClean) {
				match = false
				break
			}
			candidateWords[j] = allWords[i+j]
		}

		if match {
			correspondingWords = candidateWords
			break
		}
	}

	log.GetLogger().Debug("Found corresponding words",
		zap.String("originText", originText),
		zap.Int("foundWords", len(correspondingWords)))

	return correspondingWords
}

// findCorrespondingWordsWithTracking 根据SRT块的原始文本找到对应的原始单词，并追踪已使用的单词
func (s *YouTubeSubtitleService) findCorrespondingWordsWithTracking(srtBlock *util.SrtBlock, allWords []VttWord, usedIndices map[int]bool) []VttWord {
	if srtBlock.OriginLanguageSentence == "" {
		return []VttWord{}
	}

	// 基于文本内容匹配
	originText := strings.TrimSpace(srtBlock.OriginLanguageSentence)
	expectedWords := strings.Fields(originText)
	if len(expectedWords) == 0 {
		return []VttWord{}
	}

	// 在所有单词中查找匹配的序列，跳过已使用的单词
	var correspondingWords []VttWord

	for i := 0; i <= len(allWords)-len(expectedWords); i++ {
		// 跳过已使用的起始位置
		if usedIndices[i] {
			continue
		}

		// 检查从位置i开始是否匹配expectedWords序列
		match := true
		candidateWords := make([]VttWord, len(expectedWords))
		candidateIndices := make([]int, len(expectedWords))

		for j, expectedWord := range expectedWords {
			wordIndex := i + j
			if wordIndex >= len(allWords) || usedIndices[wordIndex] {
				match = false
				break
			}

			actualWord := strings.TrimSpace(allWords[wordIndex].Text)
			expectedWordClean := strings.Trim(expectedWord, ".,!?;:")
			actualWordClean := strings.Trim(actualWord, ".,!?;:")

			if !strings.EqualFold(expectedWordClean, actualWordClean) {
				match = false
				break
			}
			candidateWords[j] = allWords[wordIndex]
			candidateIndices[j] = wordIndex
		}

		if match {
			correspondingWords = candidateWords
			// 标记这些单词为已使用
			for _, idx := range candidateIndices {
				usedIndices[idx] = true
			}
			break
		}
	}

	log.GetLogger().Debug("Found corresponding words with tracking",
		zap.String("originText", originText),
		zap.Int("foundWords", len(correspondingWords)))

	return correspondingWords
}

// parseSrtTimestamp 解析SRT时间戳格式 "HH:MM:SS,mmm --> HH:MM:SS,mmm"
func (s *YouTubeSubtitleService) parseSrtTimestamp(timestamp string) (float64, float64, error) {
	parts := strings.Split(timestamp, " --> ")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid SRT timestamp format: %s", timestamp)
	}

	startTime, err := s.parseSrtTime(parts[0])
	if err != nil {
		return 0, 0, fmt.Errorf("failed to parse start time: %w", err)
	}

	endTime, err := s.parseSrtTime(parts[1])
	if err != nil {
		return 0, 0, fmt.Errorf("failed to parse end time: %w", err)
	}

	return startTime, endTime, nil
}

// parseSrtTime 解析单个SRT时间格式 "HH:MM:SS,mmm"
func (s *YouTubeSubtitleService) parseSrtTime(timeStr string) (float64, error) {
	// SRT格式: HH:MM:SS,mmm
	timeStr = strings.Replace(timeStr, ",", ".", 1) // 转换为VTT格式
	return s.parseVttTime(timeStr)
}

// convertToSrtTimestamp 将VTT时间戳格式转换为SRT时间戳格式
func (s *YouTubeSubtitleService) convertToSrtTimestamp(startTime, endTime string) (string, error) {
	// VTT格式: HH:MM:SS.mmm
	// SRT格式: HH:MM:SS,mmm
	srtStart := strings.Replace(startTime, ".", ",", 1)
	srtEnd := strings.Replace(endTime, ".", ",", 1)
	return fmt.Sprintf("%s --> %s", srtStart, srtEnd), nil
}

// splitBySmartRules 智能分句：当没有标点符号时，使用多种策略分句
func (s *YouTubeSubtitleService) splitBySmartRules(words []VttWord) []Sentence {
	if len(words) == 0 {
		return nil
	}

	log.GetLogger().Info("Using smart sentence splitting strategies",
		zap.Int("total_words", len(words)))

	// 对于超长序列（>200个单词），采用分层处理策略
	if len(words) > 200 {
		return s.splitLargeSequenceByLayers(words)
	}

	var sentences []Sentence

	// 策略1: 基于语义分割点（连词、介词等）
	semanticSplits := s.splitBySemanticBreaks(words)
	if len(semanticSplits) > 1 {
		log.GetLogger().Info("Split by semantic breaks", zap.Int("result_sentences", len(semanticSplits)))
		sentences = append(sentences, semanticSplits...)
	} else {
		// 策略2: 基于时间间隔分句
		timeSplits := s.splitByTimeGaps(words)
		if len(timeSplits) > 1 {
			log.GetLogger().Info("Split by time gaps", zap.Int("result_sentences", len(timeSplits)))
			sentences = append(sentences, timeSplits...)
		} else {
			// 策略3: 固定长度分句（最后的备用方案）
			lengthSplits := s.splitByFixedLength(words)
			log.GetLogger().Info("Split by fixed length", zap.Int("result_sentences", len(lengthSplits)))
			sentences = append(sentences, lengthSplits...)
		}
	}

	return sentences
}

// splitLargeSequenceByLayers 分层处理超长序列的智能分句
func (s *YouTubeSubtitleService) splitLargeSequenceByLayers(words []VttWord) []Sentence {
	log.GetLogger().Info("Using layered splitting for large sequence",
		zap.Int("total_words", len(words)))

	// 第一层：按时间间隔进行粗分割，使用更小的阈值
	const roughTimeGapThreshold = 0.5 // 500毫秒
	roughChunks := s.splitByTimeGapsWithThreshold(words, roughTimeGapThreshold)

	if len(roughChunks) <= 1 {
		// 如果时间分割无效，按固定大小分块
		roughChunks = s.splitIntoFixedChunks(words, 100) // 每块100个单词
	}

	log.GetLogger().Info("First layer time-based rough splitting",
		zap.Int("rough_chunks", len(roughChunks)))

	var finalSentences []Sentence

	// 第二层：对每个时间块应用语义分割
	for i, chunk := range roughChunks {
		log.GetLogger().Debug("Processing chunk", zap.Int("chunk_index", i),
			zap.Int("chunk_words", len(chunk.Words)))

		// 对每个块使用常规智能分句
		chunkSentences := s.applySplittingStrategies(chunk.Words)
		finalSentences = append(finalSentences, chunkSentences...)
	}

	log.GetLogger().Info("Layered splitting completed",
		zap.Int("original_words", len(words)),
		zap.Int("final_sentences", len(finalSentences)))

	return finalSentences
}

// splitByTimeGapsWithThreshold 使用指定阈值按时间间隔分句
func (s *YouTubeSubtitleService) splitByTimeGapsWithThreshold(words []VttWord, thresholdSeconds float64) []Sentence {
	if len(words) <= 3 {
		return []Sentence{s.createSentenceFromWords(words)}
	}

	var sentences []Sentence
	var currentWords []VttWord

	for i, word := range words {
		currentWords = append(currentWords, word)

		// 检查与下一个词的时间间隔
		if i < len(words)-1 {
			currentEnd, err := s.parseVttTime(word.End)
			if err != nil {
				continue
			}
			nextStart, err := s.parseVttTime(words[i+1].Start)
			if err != nil {
				continue
			}

			timeGap := nextStart - currentEnd

			// 如果时间间隔较大且当前句子有足够长度，分句
			if timeGap >= thresholdSeconds && len(currentWords) >= 3 {
				sentence := s.createSentenceFromWords(currentWords)
				sentences = append(sentences, sentence)
				currentWords = []VttWord{} // 重置
			}
		}
	}

	// 处理剩余的单词
	if len(currentWords) > 0 {
		sentence := s.createSentenceFromWords(currentWords)
		sentences = append(sentences, sentence)
	}

	// 如果没有找到有效分割点，按固定大小分块
	if len(sentences) <= 1 {
		return s.splitIntoFixedChunks(words, 50) // 每块50个单词
	}

	return sentences
}

// splitIntoFixedChunks 按固定单词数量分块
func (s *YouTubeSubtitleService) splitIntoFixedChunks(words []VttWord, chunkSize int) []Sentence {
	var chunks []Sentence

	for i := 0; i < len(words); i += chunkSize {
		end := i + chunkSize
		if end > len(words) {
			end = len(words)
		}

		chunk := s.createSentenceFromWords(words[i:end])
		chunks = append(chunks, chunk)
	}

	return chunks
}

// applySplittingStrategies 对单个块应用分句策略
func (s *YouTubeSubtitleService) applySplittingStrategies(words []VttWord) []Sentence {
	if len(words) == 0 {
		return nil
	}

	// 策略1: 基于语义分割点
	semanticSplits := s.splitBySemanticBreaks(words)
	if len(semanticSplits) > 1 && !s.hasVeryShortSentences(semanticSplits) {
		return semanticSplits
	}

	// 策略2: 基于时间间隔
	timeSplits := s.splitByTimeGaps(words)
	if len(timeSplits) > 1 && !s.hasVeryShortSentences(timeSplits) {
		return timeSplits
	}

	// 策略3: 固定长度分句（最后的备用方案）
	return s.splitByFixedLength(words)
}

// splitBySemanticBreaks 基于语义分割点分句（连词、过渡词等）
func (s *YouTubeSubtitleService) splitBySemanticBreaks(words []VttWord) []Sentence {
	if len(words) <= 5 {
		return []Sentence{s.createSentenceFromWords(words)}
	}

	// 优化后的语义分割标志词 - 更注重句子完整性
	strongBreakWords := map[string]bool{
		// 强分割词：通常标志新句子或独立从句的开始
		"however": true, "therefore": true, "moreover": true, "furthermore": true,
		"nonetheless": true, "meanwhile": true, "afterwards": true, "consequently": true,
		"additionally": true, "besides": true, "similarly": true, "likewise": true,
		"nevertheless": true, "subsequently": true, "alternatively": true,
		// 时间和顺序标志词
		"first": true, "second": true, "third": true, "finally": true, "lastly": true,
		"next": true, "then": true, "now": true, "later": true, "previously": true,
		// 条件和对比词
		"although": true, "though": true, "whereas": true, "despite": true,
	}

	// 弱分割词：只在特定上下文中分割，需要更多条件
	contextualBreakWords := map[string]bool{
		"and": true, "but": true, "or": true, "so": true,
		"because": true, "since": true, "when": true, "while": true,
		"if": true, "unless": true, "until": true, "before": true,
		"after": true, "during": true,
	}

	var sentences []Sentence
	var currentWords []VttWord
	minSentenceLength := 5 // 最小句子长度（单词数）

	for i, word := range words {
		currentWords = append(currentWords, word)
		wordLower := strings.ToLower(strings.TrimSpace(word.Text))

		shouldBreak := false

		// 检查强分割词
		if strongBreakWords[wordLower] && len(currentWords) >= minSentenceLength {
			shouldBreak = true
		}

		// 检查弱分割词，需要额外条件
		if !shouldBreak && contextualBreakWords[wordLower] && len(currentWords) >= minSentenceLength {
			// 额外条件：确保前面有完整的主谓结构
			if s.hasCompletePhrase(currentWords[:len(currentWords)-1]) {
				shouldBreak = true
			}
		}

		// 如果满足分割条件且不是最后一个词
		if shouldBreak && i < len(words)-1 {
			// 创建句子，但不包含分割词（分割词放到下一句开头）
			if len(currentWords) > 1 {
				sentence := s.createSentenceFromWords(currentWords[:len(currentWords)-1])
				sentences = append(sentences, sentence)
				currentWords = []VttWord{word} // 分割词作为下一句的开头
			}
		}
	}

	// 处理剩余的单词
	if len(currentWords) > 0 {
		sentence := s.createSentenceFromWords(currentWords)
		sentences = append(sentences, sentence)
	}

	// 如果分割结果不理想，返回空
	if len(sentences) <= 1 || s.hasVeryShortSentences(sentences) {
		return []Sentence{}
	}

	return sentences
}

// hasCompletePhrase 检查词组是否包含完整的主谓结构或意义单元
func (s *YouTubeSubtitleService) hasCompletePhrase(words []VttWord) bool {
	if len(words) < 3 {
		return false
	}

	text := strings.ToLower(strings.Join(s.extractTextsFromWords(words), " "))

	// 检查是否包含动词指示词（简单启发式）
	verbIndicators := []string{
		"am", "is", "are", "was", "were", "be", "been", "being",
		"have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
		"can", "may", "might", "must", "shall",
		"go", "goes", "went", "come", "comes", "came", "get", "gets", "got",
		"make", "makes", "made", "take", "takes", "took", "give", "gives", "gave",
		"see", "sees", "saw", "know", "knows", "knew", "think", "thinks", "thought",
		"say", "says", "said", "tell", "tells", "told", "want", "wants", "wanted",
		"need", "needs", "needed", "like", "likes", "liked", "work", "works", "worked",
	}

	for _, verb := range verbIndicators {
		if strings.Contains(text, " "+verb+" ") || strings.HasPrefix(text, verb+" ") {
			return true
		}
	}

	return false
}

// hasVeryShortSentences 检查是否有过短的句子
func (s *YouTubeSubtitleService) hasVeryShortSentences(sentences []Sentence) bool {
	for _, sentence := range sentences {
		words := strings.Fields(sentence.Text)
		if len(words) < 3 {
			return true
		}
	}
	return false
}

// extractTextsFromWords 从VttWord数组中提取文本数组
func (s *YouTubeSubtitleService) extractTextsFromWords(words []VttWord) []string {
	texts := make([]string, len(words))
	for i, word := range words {
		texts[i] = word.Text
	}
	return texts
}

// splitByTimeGaps 基于时间间隔分句（检测较长的停顿）
func (s *YouTubeSubtitleService) splitByTimeGaps(words []VttWord) []Sentence {
	if len(words) <= 3 {
		return []Sentence{s.createSentenceFromWords(words)}
	}

	var sentences []Sentence
	var currentWords []VttWord

	// 设置时间间隔阈值（秒）
	const timeGapThreshold = 0.8 // 800毫秒

	for i, word := range words {
		currentWords = append(currentWords, word)

		// 检查与下一个词的时间间隔
		if i < len(words)-1 {
			currentEnd, err := s.parseVttTime(word.End)
			if err != nil {
				continue
			}
			nextStart, err := s.parseVttTime(words[i+1].Start)
			if err != nil {
				continue
			}

			timeGap := nextStart - currentEnd

			// 如果时间间隔较大且当前句子有足够长度，分句
			if timeGap >= timeGapThreshold && len(currentWords) >= 3 {
				sentence := s.createSentenceFromWords(currentWords)
				sentences = append(sentences, sentence)
				currentWords = []VttWord{} // 重置
			}
		}
	}

	// 处理剩余的单词
	if len(currentWords) > 0 {
		sentence := s.createSentenceFromWords(currentWords)
		sentences = append(sentences, sentence)
	}

	// 如果没有找到有效分割点，返回空
	if len(sentences) <= 1 {
		return []Sentence{}
	}

	return sentences
}

// splitByFixedLength 按固定长度分句（备用方案），优化以避免在关键词中间分割
func (s *YouTubeSubtitleService) splitByFixedLength(words []VttWord) []Sentence {
	if len(words) == 0 {
		return nil
	}

	var sentences []Sentence
	var currentWords []VttWord

	// 优化固定长度策略：目标长度10-15个单词，但避免在不合适的地方分割
	const targetLength = 12
	const minLength = 8
	const maxLength = 18

	// 不适合作为句子结尾的词
	badEndWords := map[string]bool{
		"a": true, "an": true, "the": true,
		"of": true, "in": true, "on": true, "at": true, "to": true, "for": true,
		"with": true, "by": true, "from": true, "about": true,
		"and": true, "but": true, "or": true,
		"is": true, "am": true, "are": true, "was": true, "were": true,
		"have": true, "has": true, "had": true,
		"will": true, "would": true, "could": true, "should": true,
		"my": true, "your": true, "his": true, "her": true, "its": true, "our": true, "their": true,
		"this": true, "that": true, "these": true, "those": true,
		// 新增：常见的不适合独立成句的词
		"up": true, "down": true, "out": true, "off": true, "away": true, "back": true,
		"into": true, "onto": true, "upon": true, "within": true, "without": true,
		"through": true, "across": true, "under": true, "over": true,
		"before": true, "after": true, "during": true, "since": true, "until": true,
		"can": true, "may": true, "might": true, "must": true, "shall": true,
		"not": true, "never": true, "always": true, "often": true, "sometimes": true,
		"very": true, "quite": true, "really": true, "just": true, "only": true,
		"more": true, "most": true, "less": true, "least": true, "much": true,
		"too": true, "so": true, "such": true, "even": true, "still": true,
	}

	// 常见的不应该被分割的短语和固定搭配
	commonPhrases := [][]string{
		{"fall", "apart"}, {"break", "down"}, {"give", "up"}, {"take", "off"},
		{"put", "on"}, {"turn", "off"}, {"turn", "on"}, {"look", "up"},
		{"look", "down"}, {"come", "back"}, {"go", "away"}, {"walk", "away"},
		{"run", "away"}, {"get", "up"}, {"sit", "down"}, {"stand", "up"},
		{"wake", "up"}, {"grow", "up"}, {"pick", "up"}, {"drop", "off"},
		{"find", "out"}, {"figure", "out"}, {"work", "out"}, {"sort", "out"},
		{"carry", "on"}, {"move", "on"}, {"hold", "on"}, {"hang", "on"},
		{"right", "now"}, {"right", "away"}, {"right", "here"}, {"right", "there"},
		{"all", "over"}, {"all", "around"}, {"all", "along"}, {"all", "together"},
		{"once", "again"}, {"over", "again"}, {"time", "after", "time"},
		{"day", "after", "day"}, {"year", "after", "year"}, {"forever"},
		{"for", "good"}, {"for", "sure"}, {"for", "real"}, {"for", "now"},
		{"at", "all"}, {"at", "once"}, {"at", "last"}, {"at", "first"},
		{"in", "fact"}, {"in", "general"}, {"in", "particular"}, {"in", "short"},
		{"on", "purpose"}, {"on", "time"}, {"by", "chance"}, {"by", "accident"},
		{"lose", "touch"}, {"get", "lost"}, {"make", "sense"}, {"take", "care"},
	}

	for i, word := range words {
		currentWords = append(currentWords, word)
		currentLength := len(currentWords)

		// 判断是否应该在此处分割
		shouldSplit := false

		if currentLength >= maxLength {
			// 超过最大长度，必须分割
			shouldSplit = true
		} else if currentLength >= targetLength {
			// 达到目标长度，寻找合适的分割点
			wordText := strings.ToLower(strings.TrimSpace(word.Text))

			// 检查是否为不良结尾词
			if !badEndWords[wordText] {
				// 进一步检查是否会分割常见短语
				if !s.wouldSplitCommonPhrase(currentWords, words, i, commonPhrases) {
					shouldSplit = true
				}
			}
		} else if i == len(words)-1 {
			// 最后一个词，必须结束
			shouldSplit = true
		}

		// 执行分割
		if shouldSplit && currentLength >= minLength {
			sentence := s.createSentenceFromWords(currentWords)
			sentences = append(sentences, sentence)
			currentWords = []VttWord{} // 重置
		} else if shouldSplit && currentLength < minLength && i == len(words)-1 {
			// 如果是最后一句但长度不够，仍然创建句子
			sentence := s.createSentenceFromWords(currentWords)
			sentences = append(sentences, sentence)
			currentWords = []VttWord{} // 重置
		}
	}

	// 处理可能剩余的单词（虽然理论上不应该有）
	if len(currentWords) > 0 {
		if len(sentences) > 0 {
			// 如果已经有句子，将剩余词合并到最后一句
			lastIdx := len(sentences) - 1
			lastSentence := &sentences[lastIdx]

			// 重新创建包含所有词的句子
			allWords := s.extractWordsFromSentence(*lastSentence)
			allWords = append(allWords, currentWords...)
			*lastSentence = s.createSentenceFromWords(allWords)
		} else {
			// 如果没有句子，创建一个新句子
			sentence := s.createSentenceFromWords(currentWords)
			sentences = append(sentences, sentence)
		}
	}

	// 后处理：合并过短的句子
	sentences = s.mergeVeryShortSentences(sentences)

	log.GetLogger().Info("Optimized fixed length splitting completed",
		zap.Int("original_words", len(words)),
		zap.Int("created_sentences", len(sentences)),
		zap.Int("target_length", targetLength))

	return sentences
}

// extractWordsFromSentence 从句子中提取VttWord（用于合并句子）
func (s *YouTubeSubtitleService) extractWordsFromSentence(sentence Sentence) []VttWord {
	// 直接返回句子中已有的单词数据
	return sentence.Words
}

// wouldSplitCommonPhrase 检查在当前位置分割是否会分开常见短语
func (s *YouTubeSubtitleService) wouldSplitCommonPhrase(currentWords, allWords []VttWord, currentIndex int, commonPhrases [][]string) bool {
	if len(currentWords) == 0 || currentIndex >= len(allWords)-1 {
		return false
	}

	// 获取当前句子末尾的几个词
	endWords := make([]string, 0, 3)
	for i := max(0, len(currentWords)-3); i < len(currentWords); i++ {
		endWords = append(endWords, strings.ToLower(strings.TrimSpace(currentWords[i].Text)))
	}

	// 获取接下来的几个词
	nextWords := make([]string, 0, 3)
	for i := currentIndex + 1; i < min(currentIndex+4, len(allWords)); i++ {
		nextWords = append(nextWords, strings.ToLower(strings.TrimSpace(allWords[i].Text)))
	}

	// 检查是否会分割常见短语
	for _, phrase := range commonPhrases {
		if s.wouldSplitPhrase(endWords, nextWords, phrase) {
			return true
		}
	}

	return false
}

// wouldSplitPhrase 检查是否会分割特定短语
func (s *YouTubeSubtitleService) wouldSplitPhrase(endWords, nextWords, phrase []string) bool {
	// 构建完整的词序列
	allWords := append(endWords, nextWords...)

	// 在词序列中查找短语
	for i := 0; i <= len(allWords)-len(phrase); i++ {
		match := true
		for j, phraseWord := range phrase {
			if i+j >= len(allWords) || allWords[i+j] != phraseWord {
				match = false
				break
			}
		}

		if match {
			// 找到短语，检查分割点是否在短语中间
			splitPoint := len(endWords)
			phraseStart := i
			phraseEnd := i + len(phrase)

			if splitPoint > phraseStart && splitPoint < phraseEnd {
				return true // 会分割这个短语
			}
		}
	}

	return false
}

// mergeVeryShortSentences 合并过短的句子到前一句
func (s *YouTubeSubtitleService) mergeVeryShortSentences(sentences []Sentence) []Sentence {
	if len(sentences) <= 1 {
		return sentences
	}

	var result []Sentence
	const veryShortThreshold = 3 // 少于3个单词认为是过短

	for _, sentence := range sentences {
		words := strings.Fields(sentence.Text)

		if len(words) <= veryShortThreshold && len(result) > 0 {
			// 当前句子过短，合并到前一句
			lastIdx := len(result) - 1
			prevSentence := &result[lastIdx]

			// 合并单词
			mergedWords := append(prevSentence.Words, sentence.Words...)

			// 重新创建句子
			*prevSentence = s.createSentenceFromWords(mergedWords)
		} else {
			// 句子长度正常，直接添加
			result = append(result, sentence)
		}
	}

	return result
}

// min 返回两个int中的较小值
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// max 返回两个int中的较大值
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
