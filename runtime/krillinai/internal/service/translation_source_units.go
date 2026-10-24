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

	"github.com/clipperhouse/uax29/v2/words"
)

//go:embed translation_source_split_prompt.txt
var translationSourceSplitPrompt string

const translationSourceUnitsVersion = "source-units-v1"

// 坐标相对于空白规范化后的源文；原句组用于组批，不能再成为翻译前置边界。
type translationSourceUnit struct {
	Text  string `json:"text"`
	Group int    `json:"source_group"`
	Start int    `json:"source_start_byte"`
	End   int    `json:"source_end_byte"`
}

func sourceUnitGroups(units []translationSourceUnit) []int {
	if len(units) == 0 {
		return nil
	}
	groups := make([]int, len(units))
	for i, unit := range units {
		groups[i] = unit.Group
	}
	return groups
}

func sourceUnitTexts(units []translationSourceUnit) []string {
	texts := make([]string, len(units))
	for i, unit := range units {
		texts[i] = unit.Text
	}
	return texts
}

func validSourceUnits(source string, units []translationSourceUnit) bool {
	if len(units) == 0 || !subtitleSegmentsPreserveText(source, sourceUnitTexts(units)) {
		return false
	}
	position, group := 0, 0
	for _, unit := range units {
		if unit.Group < 1 || unit.Group < group || unit.Start < position || unit.End <= unit.Start || unit.End > len(source) ||
			source[unit.Start:unit.End] != unit.Text || strings.TrimSpace(source[position:unit.Start]) != "" ||
			len(unit.Text) > translationSentenceBytes || !hasSubtitleContent(unit.Text) || hasSubtitleLineBreak(unit.Text) {
			return false
		}
		position, group = unit.End, unit.Group
	}
	return strings.TrimSpace(source[position:]) == ""
}

// 标点初分 → NLP 意群 → 剩余长段模型细分 → 最终预算保护。
// 最终清单（包括降级结果）先冻结，续跑不能因为 NLP 恢复可用而改变句子 ID。
func (t *Translator) prepareSourceTranslation(ctx context.Context, texts []string, language types.StandardLanguageCode) (*preparedTranslationContext, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	source := strings.Join(strings.Fields(strings.Join(texts, " ")), " ")
	prepared := &preparedTranslationContext{}
	if source == "" {
		return prepared, nil
	}
	cachePath := ""
	if t.checkpointDir != "" {
		identity, _ := json.Marshal([]any{translationSourceUnitsVersion, translationNLPWorker, translationSourceSplitPrompt,
			language, source, config.Conf.Llm.Model, config.Conf.Llm.BaseUrl})
		hash := sha256.Sum256(identity)
		cachePath = filepath.Join(t.checkpointDir, "translation-source-units", hex.EncodeToString(hash[:])+".json")
		var units []translationSourceUnit
		if data, err := os.ReadFile(cachePath); err == nil && json.Unmarshal(data, &units) == nil && validSourceUnits(source, units) {
			prepared.SourceUnits, prepared.Texts = units, sourceUnitTexts(units)
			return prepared, ctx.Err()
		}
	}
	initial := splitTranslationSentences(source, language)
	segmenter := t.nlpSegmenter
	if segmenter == nil {
		segmenter = runTranslationNLP
		if t.nlpRuntime != nil {
			segmenter = t.nlpRuntime.segment
		}
	}
	nlp, nlpErr := segmenter(ctx, initial, language)
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	nlpAvailable := nlpErr == nil && nlp.Unavailable == "" && nlp.Model != "" && len(nlp.Segments) == len(initial) && len(nlp.Tokens) == len(initial)
	position := 0
	for i, sentence := range initial {
		parts, counts := []string{sentence}, []int{sourceTokenEstimate(sentence)}
		// 一个原句的 NLP 输出损坏，不应丢掉其他原句的有效结果。
		if nlpAvailable && len(nlp.Segments[i]) == len(nlp.Tokens[i]) && validSourceSplit(sentence, nlp.Segments[i], language, max(1, len(nlp.Segments[i]))) == nil {
			validCounts := true
			for _, count := range nlp.Tokens[i] {
				validCounts = validCounts && count > 0
			}
			if validCounts {
				parts, counts = nlp.Segments[i], nlp.Tokens[i]
			}
		}
		for j, part := range parts {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			refined := []string{strings.TrimSpace(part)}
			if counts[j] > translationNLPTokenTarget {
				var err error
				refined, err = t.refineSourceUnit(ctx, part, language)
				if err != nil {
					return nil, err
				}
			}
			for _, text := range refined {
				// 800 字节只在最后保护实际翻译请求，不抢先截断 NLP 输入。
				budgeted, err := splitTranslationSentenceForBudget(text, translationSentenceBytes, language)
				if err != nil {
					budgeted, err = splitSubtitleText(text, func(s string) bool { return len(s) <= translationSentenceBytes })
				}
				if err != nil {
					return nil, err
				}
				for _, piece := range budgeted {
					start := position + len(source[position:]) - len(strings.TrimLeft(source[position:], " "))
					if !strings.HasPrefix(source[start:], piece) {
						return nil, fmt.Errorf("源文意群没有连续覆盖原文")
					}
					position = start + len(piece)
					prepared.SourceUnits = append(prepared.SourceUnits, translationSourceUnit{piece, i + 1, start, position})
				}
			}
		}
		t.translationProgress.prepared((i + 1) * 40 / len(initial))
	}
	if !validSourceUnits(source, prepared.SourceUnits) {
		return nil, fmt.Errorf("源文意群清单缺少完整原文或有效坐标")
	}
	if cachePath != "" {
		if err := saveTranslationPresegmentationJSON(cachePath, prepared.SourceUnits); err != nil {
			return nil, fmt.Errorf("保存源文意群检查点失败: %w", err)
		}
	}
	prepared.Texts = sourceUnitTexts(prepared.SourceUnits)
	return prepared, ctx.Err()
}

// NLP 不可用时只用 Unicode 词元估算是否值得模型细分，不套用英文空格词规则。
func sourceTokenEstimate(text string) int {
	count := 0
	iter := words.FromString(text)
	for iter.Next() {
		if hasSubtitleContent(iter.Value()) {
			count++
		}
	}
	return max(1, count)
}

func validSourceSplit(text string, parts []string, language types.StandardLanguageCode, maxParts int) error {
	if len(parts) == 0 || len(parts) > maxParts || !subtitleSegmentsPreserveText(text, parts) || !subtitleSegmentsHaveSafeBoundaries(parts) {
		return fmt.Errorf("Return nonempty consecutive source slices covering the original exactly, without omissions, repetitions or rewrites.")
	}
	for _, part := range parts {
		if !hasSubtitleContent(part) || hasSubtitleLineBreak(part) {
			return fmt.Errorf("Every segment must contain source text on one line.")
		}
	}
	if len(parts) > 1 && !validTranslationSentencePartsWithBudget(text, parts, language, maxParts, max(translationSentenceBytes, len(text))) {
		return fmt.Errorf("Keep words, names, dates, numbers with units and Unicode graphemes together.")
	}
	return nil
}

func (t *Translator) refineSourceUnit(ctx context.Context, text string, language types.StandardLanguageCode) ([]string, error) {
	fallback := []string{strings.TrimSpace(text)}
	if t.chatCompleter == nil {
		return fallback, ctx.Err()
	}
	input := struct {
		Language string `json:"source_language"`
		Text     string `json:"text"`
		Target   int    `json:"target_tokens"`
		Issue    string `json:"previous_issue,omitempty"`
	}{string(types.NormalizeLanguage(string(language))), text, translationNLPTokenTarget, ""}
	cachePath := ""
	if t.checkpointDir != "" {
		identity, _ := json.Marshal([]any{translationSourceUnitsVersion, translationSourceSplitPrompt, input, config.Conf.Llm.Model, config.Conf.Llm.BaseUrl})
		hash := sha256.Sum256(identity)
		cachePath = filepath.Join(t.checkpointDir, "translation-source-splits", hex.EncodeToString(hash[:])+".json")
		var cached []string
		if data, err := os.ReadFile(cachePath); err == nil && json.Unmarshal(data, &cached) == nil && validSourceSplit(text, cached, language, len(cached)) == nil {
			return cached, ctx.Err()
		}
	}
	finish := func(parts []string) ([]string, error) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if cachePath != "" {
			if err := saveTranslationPresegmentationJSON(cachePath, parts); err != nil {
				return nil, fmt.Errorf("保存局部源文拆分检查点失败: %w", err)
			}
		}
		return parts, nil
	}
	for attempt := 0; attempt < 2; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		payload, _ := json.Marshal(input)
		prompt := "Task: translation_source_split\n" + translationSourceSplitPrompt + "\nInput JSON:\n" + string(payload)
		if len(prompt) > translationRequestBytes {
			break
		}
		var response string
		var err error
		if budgeted, ok := t.chatCompleter.(budgetedChatCompleter); ok {
			response, err = budgeted.ChatCompletionContextWithMaxTokens(ctx, prompt, min(translationOutputBudget, max(1024, 2*len(text)+256)))
		} else {
			response, err = chatCompletionWithContext(ctx, t.chatCompleter, prompt)
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		// 服务故障不再重开拆句请求；冻结降级结果，正文翻译仍可继续。
		if err != nil {
			break
		}
		var result struct {
			Segments []string `json:"segments"`
		}
		if err := json.Unmarshal([]byte(util.ExtractJSONObject(response, "segments")), &result); err != nil {
			input.Issue = "Return valid JSON with a segments array of consecutive original source slices."
			continue
		}
		if err := validSourceSplit(text, result.Segments, language, len(result.Segments)); err != nil {
			input.Issue = err.Error()
			continue
		}
		for i := range result.Segments {
			result.Segments[i] = strings.TrimSpace(result.Segments[i])
		}
		// 不以 20 token 或分段数为失败条件；没有安全切口可以保留一段。
		return finish(result.Segments)
	}
	return finish(fallback)
}
