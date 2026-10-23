package service

import (
	"context"
	"fmt"
	"krillin-ai/internal/types"
	"strings"
)

type translationSemanticCorrection struct {
	ID         string `json:"sentence_id"`
	TermSource string `json:"term_source"`
	Reason     string `json:"reason"`
	TargetText string `json:"target_text"`
}

// 未完成术语审校的完整译文也保存，恢复时仅审校/排版，避免重新翻译。
func (t *Translator) translateSemanticBatch(ctx context.Context, input pairedTranslationInput, plan *translationSemanticPlan, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) (pairedTranslationInput, error) {
	if t.segmentTranslation {
		remaining := input
		remaining.Sentences = nil
		return remaining, t.completeSegmentedBatch(ctx, input, nil, originLang, targetLang, save)
	}
	accepted := make(map[string]pairedSentence)
	remaining, err := t.translateContentBatch(ctx, input, originLang, targetLang, func(sentence pairedSentence, complete bool) error {
		if complete {
			accepted[sentence.ID] = sentence
		}
		return save(sentence, false)
	})
	if err != nil {
		return remaining, err
	}
	// 单句初译耗尽时明确标记沿用原文，其余句子继续审校和导出。
	for _, source := range remaining.Sentences {
		if err := ctx.Err(); err != nil {
			return remaining, err
		}
		sentence := originalTranslationFallback(source, source.FailureReason)
		accepted[source.ID] = sentence
		if err := save(sentence, false); err != nil {
			return remaining, err
		}
	}
	remaining.Sentences = nil
	if err := t.completeSemanticBatch(ctx, input, accepted, plan, originLang, targetLang, save); err != nil {
		return remaining, err
	}
	return remaining, nil
}

func (t *Translator) completeSemanticBatch(ctx context.Context, input pairedTranslationInput, accepted map[string]pairedSentence, plan *translationSemanticPlan, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	if t.segmentTranslation {
		return t.completeSegmentedBatch(ctx, input, accepted, originLang, targetLang, save)
	}
	var err error
	input, err = t.finishFallbackSentences(input, accepted, originLang, targetLang, save)
	if err != nil {
		return err
	}
	if t.reviseTranslation {
		if err := t.reviseContentBatch(ctx, input, accepted, originLang, targetLang, save); err != nil {
			return err
		}
		for _, source := range input.Sentences {
			sentence, ok := accepted[source.ID]
			if ok && sentence.RevisionVersion != revisionVersion() && unchangedTranslationNeedsReview(source, sentence, originLang, targetLang) {
				fallback := originalTranslationFallback(source, "原样返回的文本未能完成翻译审校，已保留原文")
				fallback.DraftTarget = sentence.DraftTarget
				accepted[source.ID] = fallback
			}
		}
		input, err = t.finishFallbackSentences(input, accepted, originLang, targetLang, save)
		if err != nil {
			return err
		}
	}
	// 只审校有证据术语的句子；其他句子不增加第二遍翻译。
	var reviewSources []pairedTranslationSource
	for _, source := range input.Sentences {
		sentence, exists := accepted[source.ID]
		if !exists {
			continue
		}
		semantic := plan.forSources([]pairedTranslationSource{source})
		if !sentence.SemanticReviewed && semantic != nil && len(semantic.Terms) > 0 {
			source.TargetText = sentence.FullTarget
			source.SourceHint, source.NLPSourceHint = nil, nil
			reviewSources = append(reviewSources, source)
		}
	}
	corrections := make(map[string]translationSemanticCorrection)
	reviewed := true
	if len(reviewSources) > 0 {
		var result struct {
			Corrections []translationSemanticCorrection `json:"corrections"`
		}
		reviewInput := struct {
			SourceLanguage  string                           `json:"source_language"`
			TargetLanguage  string                           `json:"target_language"`
			SemanticContext *translationBatchSemanticContext `json:"semantic_context"`
			Sentences       []pairedTranslationSource        `json:"sentences"`
		}{string(originLang), string(targetLang), plan.forSources(reviewSources), reviewSources}
		var err error
		reviewed, err = t.semanticJSON(ctx, "translation_term_review", translationSemanticReviewPrompt, reviewInput, "corrections", &result, func() bool {
			if result.Corrections == nil {
				return false
			}
			seen := make(map[string]bool)
			for _, correction := range result.Corrections {
				sentence, exists := accepted[correction.ID]
				if !exists || seen[correction.ID] || !hasSubtitleContent(correction.TargetText) || hasSubtitleLineBreak(correction.TargetText) ||
					len(correction.TargetText) > 4*len(sentence.FullTarget)+1024 || strings.TrimSpace(correction.Reason) == "" {
					return false
				}
				seen[correction.ID] = true
				found := false
				for _, source := range reviewSources {
					if source.ID != correction.ID {
						continue
					}
					for _, term := range plan.forSources([]pairedTranslationSource{source}).Terms {
						found = found || term.Source == correction.TermSource
					}
					if !hasUsableTranslation(correction.TargetText) {
						return false
					}
				}
				if !found {
					return false
				}
			}
			return true
		})
		if err != nil {
			return err
		}
		if !reviewed {
			t.translationNotice("部分术语一致性检查暂未完成，已保留完整译文，恢复任务时可继续检查")
		} else {
			for _, correction := range result.Corrections {
				corrections[correction.ID] = correction
			}
		}
	}
	// 先应用内容修正，再把需要显示拆分的句子合批排版。
	layout := input
	layout.Sentences = nil
	for _, source := range input.Sentences {
		sentence, exists := accepted[source.ID]
		if !exists {
			continue
		}
		if correction, exists := corrections[source.ID]; exists && correction.TargetText != sentence.FullTarget {
			sentence.FullTarget = correction.TargetText
			sentence.Source, sentence.Target = []string{source.Text}, []string{correction.TargetText}
			sentence.LayoutVersion, sentence.LayoutReviewed = 0, false
			sentence.LayoutBaseTarget, sentence.LayoutAttempts = "", 0
			sentence.LayoutApproximate = false
		}
		sentence.SemanticReviewed = sentence.SemanticReviewed || reviewed || plan.forSources([]pairedTranslationSource{source}) == nil
		if t.semanticSourceUnits {
			accepted[source.ID] = sentence
			continue
		}
		if sentence.LayoutVersion != pairedLayoutVersion || sentence.LayoutTarget != input.MaxTargetChars {
			source.TargetText = sentence.FullTarget
			one := input
			one.Sentences = []pairedTranslationSource{source}
			encoded, _ := encodePairedSentenceForLayout(sentence)
			// 多段NLP建议必须参与排版；短单段句由代码直接配对。
			parsed, err := t.parsePairedTranslation(encoded, one, originLang, targetLang)
			if err == nil && (len(source.NLPSourceHint) < 2 || len(parsed[0].Source) > 1) {
				parsed[0].SemanticReviewed = sentence.SemanticReviewed
				parsed[0].DraftTarget, parsed[0].RevisionVersion = sentence.DraftTarget, sentence.RevisionVersion
				sentence = parsed[0]
			} else {
				layout.Sentences = append(layout.Sentences, source)
			}
		}
		accepted[source.ID] = sentence
		if err := save(sentence, false); err != nil {
			return err
		}
	}
	if t.semanticSourceUnits {
		return t.layoutFrozenSubtitles(ctx, input, accepted, originLang, targetLang, save)
	}
	if len(layout.Sentences) > 0 {
		// 排版不需要整批术语和前后文，完整父句与冻结译文已经足够。
		layout.SemanticContext, layout.Before, layout.After = nil, nil, nil
		groups, err := pairedLayoutBatches(layout)
		if err != nil {
			// 已保存的译文即使超出排版请求预算，也不能重新变成初译失败。
			// 保留现有配对，交给后续有限拆分；仍不可处理时沿用原译。
			t.translationNotice(fmt.Sprintf("字幕排版请求超过预算，已保留完整初译继续生成字幕：%v", err))
		}
		for _, group := range groups {
			_, err := t.translatePairedBatch(ctx, group, originLang, targetLang, func(value pairedSentence, _ bool) error {
				value.SemanticReviewed = accepted[value.ID].SemanticReviewed
				value.DraftTarget, value.RevisionVersion = accepted[value.ID].DraftTarget, accepted[value.ID].RevisionVersion
				accepted[value.ID] = value
				return save(value, false)
			})
			if err != nil {
				return fmt.Errorf("完整译文已保存，字幕排版未完成: %w", err)
			}
		}
	}

	if err := t.reviewPairedLayouts(ctx, input, accepted, originLang, targetLang, func(sentence pairedSentence, _ bool) error { return save(sentence, false) }); err != nil {
		return err
	}
	return t.splitLongPairedSubtitles(ctx, input, accepted, originLang, targetLang, save)
}
