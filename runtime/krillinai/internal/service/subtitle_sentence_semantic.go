package service

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/clipperhouse/uax29/v2/words"
)

//go:embed subtitle_sentence_split_prompt.txt
var translationSentenceSplitPrompt string

func (t *Translator) prepareTranslationSentences(ctx context.Context, texts []string, language types.StandardLanguageCode) ([]string, error) {
	var prepared []string
	for _, text := range texts {
		for _, sentence := range splitTranslationSentences(text, language) {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			sentence = strings.Join(strings.Fields(sentence), " ")
			// 模型预算与字幕排版独立；所有入口只在这里进行一次预分句。
			parts, err := splitTranslationSentenceForBudget(sentence, translationSentenceBytes, language)
			if err != nil {
				parts, err = splitSubtitleText(sentence, func(s string) bool { return len(s) <= translationSentenceBytes })
			}
			if err != nil {
				return nil, err
			}
			if len(parts) > 1 && len(sentence) <= 4*translationSentenceBytes && translationNeedsSemanticSplit(parts, language) {
				parts, err = t.refineTranslationSentence(ctx, sentence, parts, language)
				if err != nil {
					return nil, err
				}
			}
			prepared = append(prepared, parts...)
		}
	}
	// 完整句/预算保护后的语义段才是翻译单位。NLP 只提供句内显示边界，
	// 不能在这里展平成独立 ID，否则共享成分和目标语言语序被切断。
	return prepared, nil
}

func translationNeedsSemanticSplit(parts []string, language types.StandardLanguageCode) bool {
	for i, part := range parts[:len(parts)-1] {
		left := strings.TrimSpace(part)
		last, _ := utf8.DecodeLastRuneInString(left)
		if strings.ContainsRune(",;:，；：、،؛", last) {
			continue
		}
		right := strings.TrimSpace(parts[i+1])
		rules := translationSentenceLanguages[types.NormalizeLanguage(string(language))]
		if rules.connector != nil {
			match := rules.connector.FindStringIndex(right)
			if match != nil && match[0] == 0 && (!types.LanguageUsesWordSpaces(language) || !translationWordContinues(right, match[1])) {
				continue
			}
		}
		return true
	}
	return false
}

func validTranslationSentenceParts(text string, parts []string, language types.StandardLanguageCode) bool {
	return validTranslationSentencePartsWithLimit(text, parts, language, 2*((len(text)+translationSentenceBytes-1)/translationSentenceBytes)+1)
}

func validTranslationSentencePartsWithLimit(text string, parts []string, language types.StandardLanguageCode, maxParts int) bool {
	return validTranslationSentencePartsWithBudget(text, parts, language, maxParts, translationSentenceBytes)
}

func validTranslationSentencePartsWithBudget(text string, parts []string, language types.StandardLanguageCode, maxParts, maxBytes int) bool {
	if len(parts) < 2 || len(parts) > maxParts || !subtitleSegmentsPreserveText(text, parts) || !subtitleSegmentsHaveSafeBoundaries(parts) {
		return false
	}
	protected := translationProtectedSpans(text, language)
	wordSpans := []translationTextSpan{}
	iter := words.FromString(text)
	for iter.Next() {
		wordSpans = append(wordSpans, translationTextSpan{iter.Start(), iter.End()})
	}
	position := 0
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if !hasSubtitleContent(part) || len(part) > maxBytes {
			return false
		}
		position += len(part)
		if !translationBudgetBoundaryAllowed(protected, position, maxBytes) || !translationBudgetBoundaryAllowed(wordSpans, position, maxBytes) {
			return false
		}
		position += len(text[position:]) - len(strings.TrimLeftFunc(text[position:], unicode.IsSpace))
	}
	return true
}

func (t *Translator) refineTranslationSentence(ctx context.Context, text string, fallback []string, language types.StandardLanguageCode) ([]string, error) {
	return t.refineTranslationSentenceWithPrompt(ctx, text, fallback, language, translationSentenceSplitPrompt, 2*((len(text)+translationSentenceBytes-1)/translationSentenceBytes)+1)
}

func (t *Translator) refineTranslationSentenceWithPrompt(ctx context.Context, text string, fallback []string, language types.StandardLanguageCode, instructions string, maxParts int) ([]string, error) {
	input, err := json.Marshal(struct {
		Language string   `json:"source_language"`
		MaxBytes int      `json:"max_utf8_bytes"`
		Text     string   `json:"text"`
		Fallback []string `json:"suggested_segments"`
	}{string(types.NormalizeLanguage(string(language))), translationSentenceBytes, text, fallback})
	if err != nil {
		return nil, err
	}
	prompt := instructions + "\n" + string(input)
	if len(prompt) > translationRequestBytes {
		return fallback, nil // 可选分句失败不阻止翻译；之后仍做本地预算保护。
	}
	valid := func(parts []string) bool {
		return (len(fallback) == 1 && len(text) <= translationSentenceBytes && len(parts) == 1 && parts[0] == text) || validTranslationSentencePartsWithLimit(text, parts, language, maxParts)
	}
	cachePath := ""
	if t.checkpointDir != "" {
		identity := prompt + "\n" + config.Conf.Llm.Model + "\n" + config.Conf.Llm.BaseUrl
		hash := sha256.Sum256([]byte(identity))
		cachePath = filepath.Join(t.checkpointDir, "translation-presegmentation", hex.EncodeToString(hash[:])+".json")
		if data, err := os.ReadFile(cachePath); err == nil {
			var cached []string
			if json.Unmarshal(data, &cached) == nil && valid(cached) {
				return cached, nil
			}
		}
	}
	// 语义分句只建议边界，一次失败即可回退；不占用翻译的内容纠错重试。
	var response string
	if budgeted, ok := t.chatCompleter.(budgetedChatCompleter); ok {
		response, err = budgeted.ChatCompletionContextWithMaxTokens(ctx, prompt, translationOutputBudget)
	} else {
		response, err = chatCompletionWithContext(ctx, t.chatCompleter, prompt)
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	chosen := fallback
	if err == nil {
		var result struct {
			Segments []string `json:"segments"`
		}
		if json.Unmarshal([]byte(util.ExtractJSONObject(response, "segments")), &result) == nil && valid(result.Segments) {
			chosen = result.Segments
		}
	}
	for i := range chosen {
		chosen[i] = strings.TrimSpace(chosen[i])
	}
	if cachePath != "" {
		if err := saveTranslationSentenceParts(cachePath, chosen); err != nil {
			return nil, fmt.Errorf("保存预分句检查点失败: %w", err)
		}
	}
	return chosen, nil
}

func saveTranslationSentenceParts(path string, parts []string) error {
	return saveTranslationPresegmentationJSON(path, parts)
}

func saveTranslationPresegmentationJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".sentence-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, err = file.Write(data)
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), path)
}
