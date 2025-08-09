package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"krillin-ai/config"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"

	"go.uber.org/zap"
)

// 将内部语言代码映射为YouTube字幕语言代码
func (s Service) mapLanguageForYouTube(language string) string {
	languageMap := map[string]string{
		// 中文相关
        "zh_cn": "zh-Hans", // 简体中文
        "zh_tw": "zh-Hant", // 繁体中文
        
        "en":  "en",    // 英语
        "es":  "es",    // 西班牙语
        "fr":  "fr",    // 法语
        "de":  "de",    // 德语
        "ja":  "ja",    // 日语
        "ko":  "ko",    // 韩语
        "ru":  "ru",    // 俄语
        "pt":  "pt",    // 葡萄牙语
        "it":  "it",    // 意大利语
        "ar":  "ar",    // 阿拉伯语
        "hi":  "hi",    // 印地语
        "th":  "th",    // 泰语
        "vi":  "vi",    // 越南语
        "tr":  "tr",    // 土耳其语
        "pl":  "pl",    // 波兰语
        "nl":  "nl",    // 荷兰语
        "sv":  "sv",    // 瑞典语
        "da":  "da",    // 丹麦语
        "no":  "no",    // 挪威语
        "fi":  "fi",    // 芬兰语
        "id":  "id",    // 印度尼西亚语
        "ms":  "ms",    // 马来语
        "fil": "fil",   // 菲律宾语
        "bn":  "bn",    // 孟加拉语
        "he":  "iw",    // 希伯来语 (YouTube使用iw)
        "fa":  "fa",    // 波斯语
        "af":  "af",    // 南非语
        "el":  "el",    // 希腊语
        "uk":  "uk",    // 乌克兰语
        "hu":  "hu",    // 匈牙利语
        "sr":  "sr",    // 塞尔维亚语
        "hr":  "hr",    // 克罗地亚语
        "cs":  "cs",    // 捷克语
        "sw":  "sw",    // 斯瓦希里语
        "yo":  "yo",    // 约鲁巴语
        "ha":  "ha",    // 豪萨语
        "am":  "am",    // 阿姆哈拉语
        "om":  "om",    // 奥罗莫语
        "is":  "is",    // 冰岛语
        "lb":  "lb",    // 卢森堡语
        "ca":  "ca",    // 加泰罗尼亚语
        "ro":  "ro",    // 罗马尼亚语
        "sk":  "sk",    // 斯洛伐克语
        "bs":  "bs",    // 波斯尼亚语
        "mk":  "mk",    // 马其顿语
        "sl":  "sl",    // 斯洛文尼亚语
        "bg":  "bg",    // 保加利亚语
        "lv":  "lv",    // 拉脱维亚语
        "lt":  "lt",    // 立陶宛语
        "et":  "et",    // 爱沙尼亚语
        "mt":  "mt",    // 马耳他语
        "sq":  "sq",    // 阿尔巴尼亚语
        "pa":  "pa",    // 旁遮普语
        "jv":  "jv",    // 爪哇语
        "ta":  "ta",    // 泰米尔语
        "ur":  "ur",    // 乌尔都语
        "mr":  "mr",    // 马拉地语
        "te":  "te",    // 泰卢固语
        "ps":  "ps",    // 普什图语
        "ln":  "ln",    // 林加拉语
        "ml":  "ml",    // 马拉雅拉姆语
        "uz":  "uz",    // 乌兹别克语
        "kn":  "kn",    // 卡纳达语
        "or":  "or",    // 奥里亚语
        "ig":  "ig",    // 伊博语
        "zu":  "zu",    // 祖鲁语
        "xh":  "xh",    // 科萨语
        "km":  "km",    // 高棉语
        "lo":  "lo",    // 老挝语
        "ka":  "ka",    // 格鲁吉亚语
        "hy":  "hy",    // 亚美尼亚语
        "tg":  "tg",    // 塔吉克语
        "tk":  "tk",    // 土库曼语
        "kk":  "kk",    // 哈萨克语
        "ky":  "ky",    // 吉尔吉斯语
        "mn":  "mn",    // 蒙古语
        "gd":  "gd",    // 苏格兰盖尔语
        "ga":  "ga",    // 爱尔兰语
        "cy":  "cy",    // 威尔士语
        "ba":  "ba",    // 巴什基尔语
        "ceb": "ceb",   // 宿务语
        "tt":  "tt",    // 鞑靼语
        "rw":  "rw",    // 卢旺达语
        "be":  "be",    // 白俄罗斯语
        "mg":  "mg",    // 马达加斯加语
        "sm":  "sm",    // 萨摩亚语
        "to":  "to",    // 汤加语
        "mi":  "mi",    // 毛利语
        "gv":  "gv",    // 马恩岛语
	}

	if mappedLang, exists := languageMap[language]; exists {
		return mappedLang
	}

	return language
}

// 使用yt-dlp下载YouTube视频的字幕文件
func (s Service) downloadYouTubeSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
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
	subtitleLang := s.mapLanguageForYouTube(string(stepParam.OriginLanguage))

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
func (s Service) findDownloadedSubtitleFile(taskBasePath, language string) (string, error) {
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
func (s Service) processYouTubeSubtitle(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
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
	return nil
}

// 转换为SRT格式
func (s Service) convertToSrtFormat(inputPath, taskBasePath string) (string, error) {
	if strings.HasSuffix(inputPath, ".srt") {
		return inputPath, nil
	}

	if strings.HasSuffix(inputPath, ".vtt") {
		// 使用VttToSrtPath脚本转换
		outputPath := filepath.Join(taskBasePath, "converted_subtitle.srt")

		log.GetLogger().Info("Converting VTT to SRT", zap.String("input", inputPath), zap.String("output", outputPath))

		cmd := exec.Command(storage.VttToSrtPath, inputPath, outputPath)
		output, err := cmd.CombinedOutput()
		if err != nil {
			log.GetLogger().Error("VTT to SRT conversion failed", zap.String("output", string(output)), zap.Error(err))
			return "", fmt.Errorf("VTT to SRT conversion failed: %w", err)
		}

		log.GetLogger().Info("VTT to SRT conversion completed", zap.String("output", string(output)))
		return outputPath, nil
	}

	return "", fmt.Errorf("unsupported subtitle format: %s", inputPath)
}

// MergedSentence 表示一个或多个SRT块合并成的逻辑句子 为了翻译时提供更好的上下文
type MergedSentence struct {
	OriginalText string
	Blocks       []*util.SrtBlock
}

// TranslateSrtFile 翻译SRT文件
func (s Service) TranslateSrtFile(ctx context.Context, stepParam *types.SubtitleTaskStepParam, srtFilePath string) error {
	log.GetLogger().Info("translateSrtFile starting", zap.Any("taskId", stepParam.TaskId), zap.String("srtFile", srtFilePath))

	// 1. 解析SRT文件 获取SRT块
	srtBlocks, err := s.ParseSrtFile(srtFilePath)
	if err != nil {
		return fmt.Errorf("translateSrtFile parseSrtFile error: %w", err)
	}
	stepParam.TaskPtr.ProcessPct = 40

	// 2. 将相邻的SRT块合并成逻辑句子以获得更好的翻译上下文
	mergedSentences := s.mergeSrtBlocks(srtBlocks)

	// 3. 提取合并后的文本内容进行翻译
	var textContents []string
	for _, merged := range mergedSentences {
		textContents = append(textContents, merged.OriginalText)
	}

	if len(textContents) == 0 {
		return fmt.Errorf("translateSrtFile: no text content found in SRT file")
	}

	for _, text := range textContents {
		log.GetLogger().Info("translateSrtFile merged text for translation", zap.String("text", text))
	}
	stepParam.TaskPtr.ProcessPct = 50

	// 4. 批量翻译合并后的文本内容
	log.GetLogger().Info("translateSrtFile starting translation", zap.Any("taskId", stepParam.TaskId), zap.Int("textCount", len(textContents)))
	translatedItems, err := s.translateSubtitleTextsV2(textContents, stepParam.OriginLanguage, stepParam.TargetLanguage, stepParam.EnableModalFilter)
	if err != nil {
		return fmt.Errorf("translateSrtFile translateSubtitleTextsV2 error: %w", err)
	}
	for _, item := range translatedItems {
		log.GetLogger().Info("translateSrtFile translatedItem", zap.String("originText", item.OriginText), zap.String("translatedText", item.TranslatedText))
	}
	stepParam.TaskPtr.ProcessPct = 80

	// 5. 将翻译结果使用llm拆分并应用回原始的SRT块
	err = s.applyMergedTranslationToSrtBlocks(mergedSentences, translatedItems, stepParam)
	if err != nil {
		return fmt.Errorf("translateSrtFile applyMergedTranslationToSrtBlocks error: %w", err)
	}

	// 6. 生成各种格式的字幕文件
	err = s.generateSubtitleFiles(stepParam, srtBlocks)
	if err != nil {
		return fmt.Errorf("translateSrtFile generateSubtitleFiles error: %w", err)
	}

	stepParam.TaskPtr.ProcessPct = 90
	log.GetLogger().Info("translateSrtFile completed", zap.Any("taskId", stepParam.TaskId))
	return nil
}

// 解析SRT文件
func (s Service) ParseSrtFile(srtFilePath string) ([]*util.SrtBlock, error) {
	file, err := os.Open(srtFilePath)
	if err != nil {
		return nil, fmt.Errorf("parseSrtFile open file error: %w", err)
	}
	defer file.Close()

	var srtBlocks []*util.SrtBlock
	scanner := bufio.NewScanner(file)
	var currentBlock []string

	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)

		if line == "" {
			// 空行表示一个字幕块结束
			if len(currentBlock) >= 3 {
				block, err := s.parseSrtBlock(currentBlock)
				if err != nil {
					log.GetLogger().Warn("parseSrtFile skip invalid block", zap.Any("block", currentBlock), zap.Error(err))
				} else {
					srtBlocks = append(srtBlocks, block)
				}
			}
			currentBlock = nil
		} else {
			currentBlock = append(currentBlock, line)
		}
	}

	// 处理文件末尾的最后一个块
	if len(currentBlock) >= 3 {
		block, err := s.parseSrtBlock(currentBlock)
		if err != nil {
			log.GetLogger().Warn("parseSrtFile skip final invalid block", zap.Any("block", currentBlock), zap.Error(err))
		} else {
			srtBlocks = append(srtBlocks, block)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("parseSrtFile scan error: %w", err)
	}

	return srtBlocks, nil
}

// 解析单个SRT块
func (s Service) parseSrtBlock(blockLines []string) (*util.SrtBlock, error) {
	if len(blockLines) < 3 {
		return nil, fmt.Errorf("parseSrtBlock: invalid block format, need at least 3 lines")
	}

	// 第一行是序号
	index, err := strconv.Atoi(blockLines[0])
	if err != nil {
		return nil, fmt.Errorf("parseSrtBlock: invalid index: %w", err)
	}

	// 第二行是时间戳
	timestamp := blockLines[1]
	if !strings.Contains(timestamp, "-->") {
		return nil, fmt.Errorf("parseSrtBlock: invalid timestamp format")
	}

	// 处理文本内容
	var originText, targetText string

	if len(blockLines) == 3 {
		// 单语字幕，只有一行文本
		originText = strings.TrimSpace(blockLines[2])
		targetText = "" // 需要翻译
	} else if len(blockLines) >= 4 {
		// 双语字幕，有两行文本
		originText = strings.TrimSpace(blockLines[2])
		targetText = strings.TrimSpace(blockLines[3])
	}

	if originText == "" {
		return nil, fmt.Errorf("parseSrtBlock: no origin text content found")
	}

	return &util.SrtBlock{
		Index:                  index,
		Timestamp:              timestamp,
		OriginLanguageSentence: originText,
		TargetLanguageSentence: targetText,
	}, nil
}

func (s Service) splitTranslatedSentence(originalParts []string, translatedFullText string) ([]string, error) {
	if len(originalParts) == 1 {
		return []string{translatedFullText}, nil
	}

	var originalPartsStr string
	for i, part := range originalParts {
		originalPartsStr += fmt.Sprintf("%d. %s\n", i+1, part)
	}

	prompt := fmt.Sprintf(types.SplitTranslatedSentencePrompt, translatedFullText, originalPartsStr)

	response, err := s.ChatCompleter.ChatCompletion(prompt)
	if err != nil {
		return nil, fmt.Errorf("splitTranslatedSentence chat completion error: %w", err)
	}

	var splitResult struct {
		Parts []string `json:"parts"`
	}

	cleanResponse := util.CleanMarkdownCodeBlock(response)
	if err := json.Unmarshal([]byte(cleanResponse), &splitResult); err != nil {
		log.GetLogger().Error("splitTranslatedSentence parse split result error", zap.Error(err), zap.Any("response", response))
		// 作为备用方案，按比例分配
		return s.splitByRatio(originalParts, translatedFullText), nil
	}

	if len(splitResult.Parts) != len(originalParts) {
		log.GetLogger().Warn("splitTranslatedSentence part count mismatch", zap.Int("expected", len(originalParts)), zap.Int("got", len(splitResult.Parts)))
		// 作为备用方案，按比例分配
		return s.splitByRatio(originalParts, translatedFullText), nil
	}

	return splitResult.Parts, nil
}

func (s Service) splitByRatio(originalParts []string, translatedFullText string) []string {
	var totalOriginalLen int
	for _, part := range originalParts {
		totalOriginalLen += len(part)
	}

	if totalOriginalLen == 0 {
		// 无法按比例切分，将所有文本放入第一部分
		result := make([]string, len(originalParts))
		result[0] = translatedFullText
		return result
	}

	result := make([]string, len(originalParts))
	translatedRunes := []rune(translatedFullText)
	var currentPos int
	for i := 0; i < len(originalParts)-1; i++ {
		ratio := float64(len(originalParts[i])) / float64(totalOriginalLen)
		splitPos := currentPos + int(ratio*float64(len(translatedRunes)))
		if splitPos > len(translatedRunes) {
			splitPos = len(translatedRunes)
		}
		result[i] = string(translatedRunes[currentPos:splitPos])
		currentPos = splitPos
	}
	result[len(originalParts)-1] = string(translatedRunes[currentPos:])

	return result
}

// applyMergedTranslationToSrtBlocks 将合并翻译后的结果智能地拆分并应用回原始的SRT块
func (s Service) applyMergedTranslationToSrtBlocks(mergedSentences []MergedSentence, translatedItems []*TranslatedItem, stepParam *types.SubtitleTaskStepParam) error {
	translationMap := make(map[string]string)
	for _, item := range translatedItems {
		if item != nil {
			translationMap[strings.TrimSpace(item.OriginText)] = item.TranslatedText
		}
	}

	for _, merged := range mergedSentences {
		mergedOriginalText := strings.TrimSpace(merged.OriginalText)
		translatedText, found := translationMap[mergedOriginalText]

		if !found {
			log.GetLogger().Warn("applyMergedTranslationToSrtBlocks: no translation found for merged sentence, using original text",
				zap.String("merged_sentence", mergedOriginalText))
			// 如果找不到翻译，每个块都使用自己的原文
			for _, block := range merged.Blocks {
				block.TargetLanguageSentence = block.OriginLanguageSentence
			}
			continue
		}

		if len(merged.Blocks) == 1 {
			merged.Blocks[0].TargetLanguageSentence = translatedText
		} else {
			// 如果一个翻译对应多个块，需要将其拆分
			var originalParts []string
			for _, block := range merged.Blocks {
				originalParts = append(originalParts, block.OriginLanguageSentence)
			}

			translatedParts, err := s.splitTranslatedSentence(originalParts, translatedText)
			if err != nil {
				log.GetLogger().Error("applyMergedTranslationToSrtBlocks: failed to split translated sentence, using ratio-based splitting",
					zap.String("merged_sentence", mergedOriginalText), zap.Error(err))
				// 出错时，作为备用方案，按比例分配
				translatedParts = s.splitByRatio(originalParts, translatedText)
			}

			for i, block := range merged.Blocks {
				if i < len(translatedParts) {
					block.TargetLanguageSentence = translatedParts[i]
				} else {
					// 如果拆分出的部分少于原始块，用空字符串填充
					block.TargetLanguageSentence = ""
				}
			}
		}
	}

	// 为所有块应用语言特定的美化
	for _, merged := range mergedSentences {
		for _, block := range merged.Blocks {
			if util.IsAsianLanguage(stepParam.TargetLanguage) {
				block.TargetLanguageSentence = util.BeautifyAsianLanguageSentence(block.TargetLanguageSentence)
			}
			if util.IsAsianLanguage(stepParam.OriginLanguage) {
				block.OriginLanguageSentence = util.BeautifyAsianLanguageSentence(block.OriginLanguageSentence)
			}
		}
	}

	return nil
}

// translateSubtitleTextsV2 为字幕文本提供并发翻译。
// 它为每个文本提供上下文（前后句子）以提高翻译质量
func (s Service) translateSubtitleTextsV2(inputTexts []string, originLang, targetLang types.StandardLanguageCode, enableModalFilter bool) ([]*TranslatedItem, error) {
	if len(inputTexts) == 0 {
		return []*TranslatedItem{}, nil
	}

	// 并发翻译
	var (
		signal  = make(chan struct{}, config.Conf.App.TranslateParallelNum) // 控制最大并发数
		wg      sync.WaitGroup
		results = make([]*TranslatedItem, len(inputTexts))
	)

	for i, sentence := range inputTexts {
		wg.Add(1)
		signal <- struct{}{}

		go func(index int, originText string) {
			defer wg.Done()
			defer func() { <-signal }()

			// 为提高翻译质量，提供上下文
			contextSentenceNum := 3

			// 生成前面句子的string
			var previousSentences string
			if index > 0 {
				start := 0
				if index-contextSentenceNum > 0 {
					start = index - contextSentenceNum
				}
				for i := start; i < index; i++ {
					previousSentences += inputTexts[i] + "\n"
				}
			}

			// 生成后面句子的string
			var nextSentences string
			if index < len(inputTexts)-1 {
				end := len(inputTexts) - 1
				if index+contextSentenceNum < end {
					end = index + contextSentenceNum
				}
				for i := index + 1; i <= end; i++ {
					if i > index+1 {
						nextSentences += "\n"
					}
					nextSentences += inputTexts[i]
				}
			}

			// 构建翻译提示词
			prompt := fmt.Sprintf(types.SplitTextWithContextPrompt, types.GetStandardLanguageName(targetLang), previousSentences, originText, nextSentences)

			// 执行翻译，带重试机制
			var translatedText string
			var err error
			for attempt := range config.Conf.App.TranslateMaxAttempts {
				translatedText, err = s.ChatCompleter.ChatCompletion(prompt)
				if err == nil {
					break
				}
				log.GetLogger().Warn("translateSubtitleTextsV2 translation attempt failed",
					zap.Int("sentenceIndex", index),
					zap.Int("attempt", attempt+1),
					zap.Error(err))
			}

			if err != nil {
				log.GetLogger().Error("translateSubtitleTextsV2 llm translate error", zap.Error(err), zap.Any("original text", originText))
				results[index] = &TranslatedItem{
					OriginText:     originText,
					TranslatedText: originText, // 翻译失败时返回原文
				}
			} else {
				translatedText = strings.TrimSpace(translatedText)
				results[index] = &TranslatedItem{
					OriginText:     originText,
					TranslatedText: translatedText,
				}
			}
		}(i, sentence)
	}

	wg.Wait()

	return results, nil
}

// --- 时间戳处理和字幕块合并逻辑 ---

func (s Service) mergeSrtBlocks(blocks []*util.SrtBlock) []MergedSentence {
	var mergedSentences []MergedSentence
	if len(blocks) == 0 {
		return mergedSentences
	}

	timeGapThreshold := 200 * time.Millisecond
	maxLength := 250 // Max characters to merge

	var currentBlocks []*util.SrtBlock

	for i := 0; i < len(blocks); i++ {
		currentBlocks = append(currentBlocks, blocks[i])

		// 决定是否结束当前的合并组
		finalize := false
		if i+1 >= len(blocks) { // 是最后一个块
			finalize = true
		} else {
			_, currentEnd, err := util.GetBlockTimes(blocks[i])
			if err != nil {
				log.GetLogger().Warn("无法解析当前块的时间，将结束合并组", zap.Int("blockIndex", blocks[i].Index), zap.Error(err))
				finalize = true
			} else {
				nextStart, _, err := util.GetBlockTimes(blocks[i+1])
				if err != nil {
					log.GetLogger().Warn("无法解析下一个块的时间，将结束合并组", zap.Int("blockIndex", blocks[i+1].Index), zap.Error(err))
					finalize = true
				} else {
					// 条件1：时间间隔太大
					if nextStart-currentEnd > timeGapThreshold {
						finalize = true
					}
					// 条件2：合并后的文本太长
					var currentLength int
					for _, b := range currentBlocks {
						currentLength += len(b.OriginLanguageSentence)
					}
					if currentLength >= maxLength {
						finalize = true
					}
				}
			}
		}

		if finalize {
			var sb strings.Builder
			for _, b := range currentBlocks {
				sb.WriteString(strings.TrimSpace(b.OriginLanguageSentence))
				sb.WriteString(" ")
			}

			mergedSentences = append(mergedSentences, MergedSentence{
				OriginalText: strings.TrimSpace(sb.String()),
				Blocks:       currentBlocks,
			})
			currentBlocks = nil // 开始新的一组
		}
	}

	return mergedSentences
}

// 生成各种格式的字幕文件
func (s Service) generateSubtitleFiles(stepParam *types.SubtitleTaskStepParam, srtBlocks []*util.SrtBlock) error {
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
func (s Service) writeBilingualSrtFile(filePath string, srtBlocks []*util.SrtBlock, resultType types.SubtitleResultType) error {
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
func (s Service) writeOriginSrtFile(filePath string, srtBlocks []*util.SrtBlock) error {
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
func (s Service) writeTargetSrtFile(filePath string, srtBlocks []*util.SrtBlock) error {
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
func (s Service) populateSubtitleInfos(stepParam *types.SubtitleTaskStepParam, srtBlocks []*util.SrtBlock) {
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