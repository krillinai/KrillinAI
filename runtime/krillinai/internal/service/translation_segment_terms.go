package service

import (
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"slices"
	"strings"
)

// 决定只覆盖同一父句的词义；请求副本不能污染并行批次和原始计划。
func segmentEffectiveContext(input pairedTranslationInput, parents []pairedSentence) *translationBatchSemanticContext {
	if input.SemanticContext == nil {
		return nil
	}
	result := *input.SemanticContext
	result.Terms = nil
	for _, term := range input.SemanticContext.Terms {
		local := term
		local.SentenceIDs = slices.Clone(term.SentenceIDs)
		for _, parent := range parents {
			for _, decision := range parent.SegmentState.TermDecisions {
				if !strings.EqualFold(decision.Source, term.Source) || !slices.Contains(local.SentenceIDs, parent.ID) {
					continue
				}
				local.SentenceIDs = slices.DeleteFunc(local.SentenceIDs, func(id string) bool { return id == parent.ID })
				corrected := term
				corrected.Target, corrected.Meaning = decision.Target, decision.Reason
				corrected.SentenceIDs = []string{parent.ID}
				result.Terms = append(result.Terms, corrected)
			}
		}
		if len(local.SentenceIDs) > 0 {
			result.Terms = append(result.Terms, local)
		}
	}
	return &result
}
func validateSegmentTermDecisions(decisions []segmentTermDecision, parent pairedSentence, input pairedTranslationInput, language types.StandardLanguageCode) string {
	if len(decisions) > 12 {
		return "too many terminology decisions"
	}
	seen := map[string]bool{}
	for _, d := range decisions {
		key := strings.ToLower(d.Source)
		known := false
		if input.SemanticContext != nil {
			for _, term := range input.SemanticContext.Terms {
				known = known || strings.EqualFold(term.Source, d.Source) && slices.Contains(term.SentenceIDs, parent.ID)
			}
		}
		if seen[key] || !known || !translationContainsTerm(parent.FullSource, d.Source, language) || !hasSubtitleContent(d.Target) || !hasSubtitleContent(d.Reason) || len(d.Target) > 100 || len(d.Reason) > 360 || hasSubtitleLineBreak(d.Target) || hasSubtitleLineBreak(d.Reason) {
			return "invalid or unscoped terminology decision"
		}
		seen[key] = true
	}
	return ""
}
func mergeSegmentTermDecisions(old, updates []segmentTermDecision) []segmentTermDecision {
	result := slices.Clone(old)
	for _, update := range updates {
		result = slices.DeleteFunc(result, func(d segmentTermDecision) bool { return strings.EqualFold(d.Source, update.Source) })
		result = append(result, update)
	}
	return result
}

// 接受单一明确别名，拒绝冲突值；持久化始终只写规范 target 字段。
func (d *segmentTermDecision) UnmarshalJSON(data []byte) error {
	type canonical segmentTermDecision
	var value struct {
		canonical
		Corrected string `json:"corrected_target"`
	}
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	if value.Target != "" && value.Corrected != "" && value.Target != value.Corrected {
		return fmt.Errorf("conflicting terminology targets")
	}
	*d = segmentTermDecision(value.canonical)
	if d.Target == "" {
		d.Target = value.Corrected
	}
	return nil
}
