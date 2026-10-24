package service

import (
	"context"
	"encoding/json"
	"krillin-ai/internal/types"
	"strings"
)

// 在连续原文上识别语义意群，避免先按请求字节预算拆断短语。
// 返回值直接成为翻译 ID；每个 ID 仍沿用既有内容恢复和字幕时间映射。
func (t *Translator) prepareSemanticTranslationUnits(ctx context.Context, texts []string, language types.StandardLanguageCode) ([]string, error) {
	normalized := make([]string, 0, len(texts))
	for _, text := range texts {
		if text = strings.Join(strings.Fields(text), " "); hasSubtitleContent(text) {
			normalized = append(normalized, text)
		}
	}
	groups, err := t.prepareTranslationNLPHints(ctx, normalized, language)
	if err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		// 复用可用的标点、连接词及词边界降级；NLP 不可用不阻断翻译。
		return t.prepareTranslationSentences(ctx, normalized, language)
	}
	// 复用本地依存分析合并不安全切口，不增加模型审查请求。
	if t.nlpRuntime != nil {
		type request struct {
			Source string   `json:"source"`
			Parts  []string `json:"parts"`
		}
		requests := make([]request, len(normalized))
		for i := range requests {
			requests[i] = request{normalized[i], groups[i]}
		}
		data, _ := json.Marshal(struct {
			Language types.StandardLanguageCode `json:"language"`
			Requests []request                  `json:"source_unit_requests"`
		}{types.NormalizeLanguage(string(language)), requests})
		response, repairErr := t.nlpRuntime.exchange(ctx, data)
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		var repaired translationNLPResult
		if repairErr == nil && json.Unmarshal(response, &repaired) == nil && len(repaired.Segments) == len(normalized) {
			for i, parts := range repaired.Segments {
				if len(parts) == 1 && subtitleSegmentsPreserveText(normalized[i], parts) ||
					validTranslationSentencePartsWithBudget(normalized[i], parts, language, len(parts), max(len(normalized[i]), translationSentenceBytes)) {
					groups[i] = parts
				}
			}
		}
	}
	var units []string
	for _, group := range groups {
		for _, text := range group {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			parts, err := splitTranslationSentenceForBudget(text, translationSentenceBytes, language)
			if err != nil {
				return nil, err
			}
			units = append(units, parts...)
		}
	}
	return units, nil
}
