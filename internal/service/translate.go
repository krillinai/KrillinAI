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

func (t *Translator) SplitTextAndTranslate(basePath, inputText string, originLang, targetLang types.StandardLanguageCode, enableModalFilter bool, id int) ([]*TranslatedItem, error) {
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
	//判断句子如果还是过长，就继续用大模型拆句
	for _, sentence := range sentences {
		if sentence == "" {
			continue
		}
		if util.CountEffectiveChars(sentence) <= config.Conf.App.MaxSentenceLength {
			shortSentences = append(shortSentences, sentence)
			continue
		}

		// 调用大模型进行分割
		log.GetLogger().Info("use llm split origin long sentence", zap.Any("sentence", sentence))
		splitItems, err := t.splitOriginLongSentence(sentence)
		if err != nil {
			log.GetLogger().Error("splitTranslateItem splitLongSentence error", zap.Error(err), zap.Any("sentence", sentence))
		}
		//拆完之后还长，就再拆一次
		for _, item := range splitItems {
			if util.CountEffectiveChars(item) <= config.Conf.App.MaxSentenceLength {
				shortSentences = append(shortSentences, item)
				continue
			}

			// 调用大模型进行分割
			log.GetLogger().Info("use llm split origin long sentence", zap.Any("item", item))
			splitItems, err := t.splitOriginLongSentence(item)
			if err != nil {
				log.GetLogger().Error("splitTranslateItem splitLongSentence error", zap.Error(err), zap.Any("item", item))
			}

			shortSentences = append(shortSentences, splitItems...)
		}
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
			shortSentences = append(shortSentences, shortSentence.Text)
		}
		break
	}

	if err != nil {
		return nil, fmt.Errorf("parse split result error: %w", err)
	}

	return shortSentences, nil
}
