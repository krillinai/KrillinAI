package service

import (
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/openai"
	"krillin-ai/pkg/util"
	"strings"
	"sync"

	"go.uber.org/zap"
)

type Translator struct {
	chatCompleter types.ChatCompleter
}

func NewTranslator() *Translator {
	return &Translator{
		chatCompleter: openai.NewClient(config.Conf.Llm.BaseUrl, config.Conf.Llm.ApiKey, config.Conf.App.Proxy),
	}
}

func (t *Translator) SplitTextAndTranslate(inputText string, originLang, targetLang types.StandardLanguageCode) ([]*TranslatedItem, error) {
	sentences := util.SplitTextSentences(inputText, config.Conf.App.MaxSentenceLength)
	if len(sentences) == 0 {
		return []*TranslatedItem{}, nil
	}

	// 补丁：whisper转录中文的时候很多句子后面不输出符号，导致上面基于符号的切分失效
	if IsSplitUseSpace(originLang) {
		newSentences := make([]string, 0)
		for _, sentence := range sentences {
			newSentences = append(newSentences, strings.Split(sentence, " ")...)
		}
		sentences = newSentences
	}

	shortSentences := make([]string, 0)
	// 使用递归拆句确保所有句子都满足长度要求
	for _, sentence := range sentences {
		if sentence == "" {
			continue
		}
		recursiveSplitItems := t.recursiveSplitSentence(sentence, 0)
		shortSentences = append(shortSentences, recursiveSplitItems...)
	}

	sentences = shortSentences

	var (
		signal  = make(chan struct{}, config.Conf.App.TranslateParallelNum) // 控制最大并发数
		wg      sync.WaitGroup
		results = make([]*TranslatedItem, len(sentences))
		// errChan = make(chan error, 1)
		// mutex   sync.Mutex
	)

	for i, sentence := range sentences {
		wg.Add(1)
		signal <- struct{}{}

		go func(index int, originText string) {
			defer wg.Done()
			defer func() { <-signal }()

			contextSentenceNum := 3

			// 生成前面3个句子的string
			var previousSentences string
			if index > 0 {
				start := 0
				if index-contextSentenceNum > 0 {
					start = index - contextSentenceNum
				}
				for i := start; i < index; i++ {
					previousSentences += sentences[i] + "\n"
				}
			}

			// 生成后面3个句子的string
			var nextSentences string
			if index < len(sentences)-1 {
				end := len(sentences) - 1
				if index+contextSentenceNum < end {
					end = index + contextSentenceNum
				}
				for i := index + 1; i <= end; i++ {
					if i > index+1 {
						nextSentences += "\n"
					}
					nextSentences += sentences[i]
				}
			}

			prompt := fmt.Sprintf(types.SplitTextWithContextPrompt, types.GetStandardLanguageName(targetLang), previousSentences, originText, nextSentences)

			translatedText, err := t.translateWithRetry(prompt, originText, originLang, targetLang)
			if err != nil {
				log.GetLogger().Error("splitTextAndTranslate llm translate error after retries", zap.Error(err), zap.Any("original text", originText))
				results[index] = &TranslatedItem{
					OriginText:     originText,
					TranslatedText: originText,
				}
			} else {
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

func (t *Translator) splitOriginLongSentence(sentence string) ([]string, error) {
	prompt := fmt.Sprintf(types.SplitOriginLongSentencePrompt, sentence)

	var response string
	var err error
	shortSentences := make([]string, 0)
	// 尝试调用3次
	for i := range 3 {
		response, err = t.chatCompleter.ChatCompletion(prompt)
		if err != nil {
			log.GetLogger().Error("splitOriginLongSentence chat completion error", zap.Error(err), zap.String("sentence", sentence), zap.Any("time", i))
			continue
		}
		var splitResult struct {
			ShortSentences []struct {
				Text string `json:"text"`
			} `json:"short_sentences"`
		}

		cleanResponse := util.CleanMarkdownCodeBlock(response)
		if err = json.Unmarshal([]byte(cleanResponse), &splitResult); err != nil {
			log.GetLogger().Error("splitOriginLongSentence parse split result error", zap.Error(err), zap.Any("response", response))
			continue
		}

		for _, shortSentence := range splitResult.ShortSentences {
			// 清理文本，移除多余的引号
			cleanText := strings.TrimSpace(shortSentence.Text)
			cleanText = strings.Trim(cleanText, `"'`)
			if cleanText != "" {
				shortSentences = append(shortSentences, cleanText)
			}
		}
		break
	}

	if err != nil {
		return nil, fmt.Errorf("parse split result error: %w", err)
	}

	return shortSentences, nil
}

// recursiveSplitSentence 递归拆分句子直到满足长度要求
func (t *Translator) recursiveSplitSentence(sentence string, depth int) []string {
	const maxDepth = 5 // 防止无限递归，最多拆分5层

	// 如果句子已经满足长度要求，直接返回
	if util.CountEffectiveChars(sentence) <= config.Conf.App.MaxSentenceLength {
		return []string{sentence}
	}

	// 如果递归深度过深，强制返回原句子（避免无限递归）
	if depth >= maxDepth {
		log.GetLogger().Warn("recursive split reached max depth, returning original sentence",
			zap.String("sentence", sentence),
			zap.Int("depth", depth),
			zap.Int("charCount", util.CountEffectiveChars(sentence)))
		return []string{sentence}
	}

	// 使用大模型拆分句子
	log.GetLogger().Info("recursive split long sentence",
		zap.String("sentence", sentence),
		zap.Int("depth", depth),
		zap.Int("charCount", util.CountEffectiveChars(sentence)))

	splitItems, err := t.splitOriginLongSentence(sentence)
	if err != nil {
		log.GetLogger().Error("recursive split error, returning original sentence",
			zap.Error(err),
			zap.String("sentence", sentence),
			zap.Int("depth", depth))
		return []string{sentence}
	}

	// 如果拆分失败（返回空或只有一个与原句相同的项），返回原句子
	if len(splitItems) == 0 || (len(splitItems) == 1 && strings.TrimSpace(splitItems[0]) == strings.TrimSpace(sentence)) {
		log.GetLogger().Warn("llm split returned same sentence, stopping recursion",
			zap.String("sentence", sentence),
			zap.Int("depth", depth))
		return []string{sentence}
	}

	// 递归处理拆分后的每个子句
	result := make([]string, 0)
	for _, item := range splitItems {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		// 递归拆分子句
		subItems := t.recursiveSplitSentence(item, depth+1)
		result = append(result, subItems...)
	}

	return result
}

// translateWithRetry 带重试和翻译质量检查的翻译方法
func (t *Translator) translateWithRetry(prompt, originText string, originLang, targetLang types.StandardLanguageCode) (string, error) {
	const maxRetries = 3
	var lastErr error

	for attempt := 0; attempt < maxRetries; attempt++ {
		translatedText, err := t.chatCompleter.ChatCompletion(prompt)
		if err != nil {
			lastErr = err
			log.GetLogger().Warn("translate attempt failed",
				zap.Error(err),
				zap.Int("attempt", attempt+1),
				zap.String("originText", originText))
			continue
		}

		// 清理翻译结果
		translatedText = strings.TrimSpace(translatedText)
		translatedText = strings.Trim(translatedText, `"'`)

		// 检查翻译质量
		if t.isTranslationValid(originText, translatedText, originLang, targetLang) {
			log.GetLogger().Debug("translation successful",
				zap.Int("attempt", attempt+1),
				zap.String("originText", originText),
				zap.String("translatedText", translatedText))
			return translatedText, nil
		}

		log.GetLogger().Warn("translation quality check failed, retrying",
			zap.Int("attempt", attempt+1),
			zap.String("originText", originText),
			zap.String("translatedText", translatedText))

		// 为下一次重试修改提示词，增加强调
		if attempt < maxRetries-1 {
			prompt = t.enhanceTranslationPrompt(prompt, originText, translatedText, targetLang)
		}
	}

	if lastErr != nil {
		return "", lastErr
	}

	return "", fmt.Errorf("translation quality check failed after %d attempts", maxRetries)
}

// isTranslationValid 检查翻译是否有效
func (t *Translator) isTranslationValid(originText, translatedText string, originLang, targetLang types.StandardLanguageCode) bool {
	// 1. 翻译不能为空
	if strings.TrimSpace(translatedText) == "" {
		return false
	}

	// 2. 翻译不能与原文完全相同（除非是特殊情况）
	if strings.TrimSpace(originText) == strings.TrimSpace(translatedText) {
		// 检查是否是专有名词、数字或特殊符号
		if t.isSpecialContent(originText) {
			return true // 专有名词等可以保持原文
		}
		return false
	}

	// 3. 检查语言特征（简单的启发式检查）
	if !t.hasTargetLanguageCharacteristics(translatedText, targetLang) {
		return false
	}

	// 4. 长度合理性检查（翻译结果不应该过长或过短）
	originLen := len(strings.TrimSpace(originText))
	translatedLen := len(strings.TrimSpace(translatedText))

	// 翻译结果长度应该在原文的0.3-3倍之间（考虑语言特性）
	if float64(translatedLen) < float64(originLen)*0.3 || float64(translatedLen) > float64(originLen)*3 {
		// 但对于很短的文本，允许更大的变化范围
		if originLen < 10 {
			return true
		}
		return false
	}

	return true
}

// isSpecialContent 检查是否是专有名词、数字等特殊内容
func (t *Translator) isSpecialContent(text string) bool {
	text = strings.TrimSpace(text)
	if len(text) == 0 {
		return false
	}

	// 检查是否主要包含数字、符号、英文名词等
	nonAlphaCount := 0
	for _, r := range text {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')) {
			nonAlphaCount++
		}
	}

	// 如果超过一半的字符不是字母，可能是特殊内容
	if float64(nonAlphaCount) > float64(len(text))*0.5 {
		return true
	}

	// 检查常见的专有名词模式
	commonProperNouns := []string{
		"Dr.", "Mr.", "Mrs.", "Ms.", "Prof.",
		"Andrew", "Huberman", "OpenAI", "ChatGPT", "YouTube",
	}

	textLower := strings.ToLower(text)
	for _, noun := range commonProperNouns {
		if strings.Contains(textLower, strings.ToLower(noun)) {
			return true
		}
	}

	return false
}

// hasTargetLanguageCharacteristics 检查文本是否具有目标语言特征
func (t *Translator) hasTargetLanguageCharacteristics(text string, targetLang types.StandardLanguageCode) bool {
	switch targetLang {
	case types.LanguageNameSimplifiedChinese, types.LanguageNameTraditionalChinese: // 中文
		// 检查是否包含中文字符
		for _, r := range text {
			if r >= '\u4e00' && r <= '\u9fff' { // 基本汉字范围
				return true
			}
		}
		return false

	case types.LanguageNameEnglish: // 英文
		// 检查是否主要包含拉丁字母
		letterCount := 0
		for _, r := range text {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
				letterCount++
			}
		}
		// 至少50%的字符应该是字母
		return float64(letterCount) >= float64(len(strings.ReplaceAll(text, " ", "")))*0.5

	case types.LanguageNameJapanese: // 日文
		// 检查是否包含平假名、片假名或汉字
		for _, r := range text {
			if (r >= '\u3040' && r <= '\u309f') || // 平假名
				(r >= '\u30a0' && r <= '\u30ff') || // 片假名
				(r >= '\u4e00' && r <= '\u9fff') { // 汉字
				return true
			}
		}
		return false

	default:
		// 对于其他语言，暂时返回true
		return true
	}
}

// enhanceTranslationPrompt 增强翻译提示词
func (t *Translator) enhanceTranslationPrompt(originalPrompt, originText, failedTranslation string, targetLang types.StandardLanguageCode) string {
	enhancement := fmt.Sprintf(`

IMPORTANT: The previous translation was inadequate. Please ensure:
1. Translate "%s" into %s (NOT the same as original text)
2. Previous failed attempt: "%s"
3. Provide a natural, accurate %s translation
4. Do NOT return the original text unchanged
5. Do NOT translate proper nouns like names, unless culturally appropriate

`, originText, types.GetStandardLanguageName(targetLang), failedTranslation, types.GetStandardLanguageName(targetLang))

	return originalPrompt + enhancement
}
