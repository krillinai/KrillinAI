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

	originSrtFile := filepath.Join(req.TaskBasePath, "origin.srt")
	// 1. 转换VTT到SRT格式
	err := s.ConvertVttToSrt(req.VttFile, originSrtFile, req.OriginLanguage, req.TargetLanguage)
	if err != nil {
		return "", fmt.Errorf("processYouTubeSubtitle convertToSrtFormat error: %w", err)
	}

	log.GetLogger().Info("processYouTubeSubtitle converted to SRT", zap.Any("taskId", req.TaskId), zap.String("srtFile", originSrtFile))

	return "", nil
}

// ExtractWordsFromVtt 从VTT文件中提取所有单词及其时间戳信息
func (s *YouTubeSubtitleService) ExtractWordsFromVtt(vttFile string) ([]VttWord, error) {
	file, err := os.Open(vttFile)
	if err != nil {
		return nil, fmt.Errorf("无法打开VTT文件: %v", err)
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

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// 跳过空行和头部信息
		if line == "" || strings.HasPrefix(line, "WEBVTT") ||
			strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
			continue
		}

		// 检查是否是时间戳行
		if matches := timestampLineRegex.FindStringSubmatch(line); len(matches) >= 3 {
			blockStartTime = matches[1]
			blockEndTime = matches[2]
			log.GetLogger().Debug("发现时间戳", zap.String("开始", blockStartTime), zap.String("结束", blockEndTime))
			continue
		}

		// 如果不是时间戳行，且有有效的时间戳信息，则处理内容
		if blockStartTime != "" && blockEndTime != "" && line != "" {
			// 检查是否包含内联时间戳（单词级时间戳的标准格式）
			if wordTimeRegex.MatchString(line) {
				// 处理包含单词级时间戳的行
				cleanLine := styleTagRegex.ReplaceAllString(line, "")
				wordsFromLine := s.parseWordsWithTimestamps(cleanLine, blockStartTime, blockEndTime, &wordNum)
				words = append(words, wordsFromLine...)
			} else {
				// 对于没有内联时间戳的行，进一步判断是否为单词
				// 严格判断：只有单个单词且不是完整句子的重复
				trimmedLine := strings.TrimSpace(line)

				// 检查是否为单个单词（不包含空格，且不是纯标点符号）
				isWord := !strings.Contains(trimmedLine, " ") &&
					len(trimmedLine) > 0 &&
					!s.isPurePunctuation(trimmedLine)

				if isWord {
					wordNum++
					word := VttWord{
						Text:  trimmedLine,
						Start: blockStartTime,
						End:   blockEndTime,
						Num:   wordNum,
					}
					words = append(words, word)
					log.GetLogger().Debug("提取单词", zap.String("文本", trimmedLine),
						zap.String("开始", blockStartTime), zap.String("结束", blockEndTime))
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

// isPurePunctuation 检查文本是否只包含标点符号
func (s *YouTubeSubtitleService) isPurePunctuation(text string) bool {
	if text == "" {
		return false
	}

	// 定义标点符号正则表达式（只包含标点符号，不包含字母和数字）
	punctOnlyRegex := regexp.MustCompile(`^[^\p{L}\p{N}]+$`)
	return punctOnlyRegex.MatchString(text)
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
		if strings.TrimSpace(word) != "" {
			result = append(result, word)
		}
	}

	return result
}

// ConvertVttToSrt 将VTT转换为SRT格式
func (s *YouTubeSubtitleService) ConvertVttToSrt(vttFile, srtFile string, originLang, targetLang string) error {
	// 使用新的ExtractWordsFromVtt函数获取VttWord
	vttWords, err := s.ExtractWordsFromVtt(vttFile)
	if err != nil {
		return fmt.Errorf("failed to extract VTT words: %w", err)
	}

	// 将VttWord转换为SRT格式
	return s.writeVttWordsToSrt(vttWords, srtFile, originLang, targetLang)
}

// writeVttWordsToSrt 将VttWord数组写入SRT文件，支持翻译和时间戳生成
func (s *YouTubeSubtitleService) writeVttWordsToSrt(vttWords []VttWord, srtFile string, originLang, targetLang string) error {
	if len(vttWords) == 0 {
		return fmt.Errorf("no VTT words to write")
	}

	// 步骤1: 根据标点符号将单词整理成完整的句子
	sentences := s.groupWordsIntoSentences(vttWords)
	if len(sentences) == 0 {
		return fmt.Errorf("no sentences formed from VTT words")
	}

	log.GetLogger().Info("Grouped VTT words into sentences", zap.Int("句子数", len(sentences)))

	// 创建初始的SrtBlock列表
	srtBlocks := make([]*util.SrtBlock, 0, 2*len(sentences))
	notsSrtBlock := make([]*util.SrtBlock, 0, 10)
	var i int
	for _, sentence := range sentences {
		translatedBlocks, err := s.translator.SplitTextAndTranslate(sentence.Text, types.StandardLanguageCode(originLang), types.StandardLanguageCode(targetLang))
		if err != nil {
			log.GetLogger().Warn("Translation failed, using original text", zap.Error(err))
			continue
		}

		for _, block := range translatedBlocks {
			notsSrtBlock = append(notsSrtBlock, &util.SrtBlock{
				OriginLanguageSentence: block.OriginText,
				TargetLanguageSentence: block.TranslatedText,
			})
		}
		updatedBlocks, err := s.timestampGenerator.GenerateTimestamps(
			notsSrtBlock,
			s.convertVttWordsToTypesWords(sentence.Words),
			types.StandardLanguageCode("base"), // 默认使用base语言类型
			0.0,                                // 时间偏移
		)
		if err != nil {
			log.GetLogger().Warn("Timestamp generation failed", zap.Error(err))
		} else {
			notsSrtBlock = updatedBlocks
		}

		for _, block := range updatedBlocks {
			srtBlocks = append(srtBlocks, &util.SrtBlock{
				Index:                  i + 1,
				Timestamp:              block.Timestamp,
				OriginLanguageSentence: block.OriginLanguageSentence,
				TargetLanguageSentence: block.TargetLanguageSentence,
			})
			i++
		}
		// 清空临时数组，为下一个句子准备
		notsSrtBlock = []*util.SrtBlock{}
	}

	// 步骤6: 写入SRT文件
	return s.writeSrtBlocksToFile(srtBlocks, srtFile)
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

	for _, word := range words {
		currentWords = append(currentWords, word)

		// 检查单词是否以逗号或分号结尾
		if s.endsWithSentencePunctuation(word.Text, secondaryEndPunctuation) {
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

	// 如果没有找到可分割的标点符号，返回原始句子
	if len(sentences) <= 1 {
		return []Sentence{s.createSentenceFromWords(words)}
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
