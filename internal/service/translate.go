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

			translatedText, err := t.chatCompleter.ChatCompletion(prompt)
			if err != nil {
				log.GetLogger().Error("splitTextAndTranslate llm translate error", zap.Error(err), zap.Any("original text", originText))
				results[index] = &TranslatedItem{
					OriginText:     originText,
					TranslatedText: originText,
				}
			} else {
				translatedText = strings.TrimSpace(translatedText)
				// 清理翻译结果中的多余引号
				translatedText = strings.Trim(translatedText, `"'`)
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
