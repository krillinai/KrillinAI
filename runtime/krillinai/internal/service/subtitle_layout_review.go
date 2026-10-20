package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"krillin-ai/internal/types"
)

//go:embed subtitle_layout_review_prompt.txt
var subtitleLayoutReviewPrompt string

// 只审查有边界的句子，不重新翻译。结构检查通过不代表意群完整。
func (t *Translator) reviewPairedLayouts(ctx context.Context, input pairedTranslationInput, sentences map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	var pending []pairedSentence
	for _, source := range input.Sentences {
		if sentence, ok := sentences[source.ID]; ok && len(sentence.Source) > 1 && !sentence.LayoutReviewed {
			// 审校只消费当前原译与边界，不重复发送初译、版本和恢复状态。
			sentence.DraftTarget, sentence.RevisionVersion = "", ""
			sentence.SemanticReviewed, sentence.LayoutFallback = false, false
			sentence.LayoutVersion, sentence.LayoutTarget = 0, 0
			pending = append(pending, sentence)
		}
	}
	if len(pending) > 0 {
		var result struct {
			Reviews []struct {
				ID      string `json:"sentence_id"`
				Aligned *bool  `json:"aligned"`
				Natural *bool  `json:"natural_boundaries"`
				Reason  string `json:"reason"`
			} `json:"reviews"`
			Corrections []struct {
				ID       string                     `json:"sentence_id"`
				Reason   string                     `json:"reason"`
				Rewrite  bool                       `json:"rewrite"`
				Segments []pairedTranslationSegment `json:"segments"`
			} `json:"corrections"`
		}
		reviewInput := struct {
			SourceLanguage string           `json:"source_language"`
			TargetLanguage string           `json:"target_language"`
			DisplayTarget  int              `json:"display_target"`
			Sentences      []pairedSentence `json:"sentences"`
		}{input.SourceLanguage, input.TargetLanguage, input.MaxTargetChars, pending}
		corrected := make(map[string]pairedSentence)
		invalid := make(map[string]bool)
		rewritten := make(map[string]bool)
		// 成功状态已写入句级检查点；不缓存含失效修正的整批响应，
		// 恢复时只重新审查失败句，避免一个错误使整批重复处理。
		reviewer := *t
		reviewer.checkpointDir = ""
		reviewed, err := reviewer.semanticJSON(ctx, "translation_layout_review", subtitleLayoutReviewPrompt, reviewInput, "corrections", &result, func() bool {
			if result.Corrections == nil || len(result.Reviews) != len(pending) {
				return false
			}
			corrected = make(map[string]pairedSentence)
			invalid = make(map[string]bool)
			rewritten = make(map[string]bool)
			seen := make(map[string]bool)
			for _, review := range result.Reviews {
				found := false
				for _, sentence := range pending {
					found = found || sentence.ID == review.ID
				}
				if !found || seen[review.ID] || review.Aligned == nil || review.Natural == nil || review.Reason == "" {
					return false
				}
				seen[review.ID] = true
				if !*review.Aligned || !*review.Natural {
					invalid[review.ID] = true
				}
			}
			clear(seen)
			for _, correction := range result.Corrections {
				original, exists := sentences[correction.ID]
				if !exists || original.LayoutReviewed || len(original.Source) < 2 || seen[correction.ID] || correction.Reason == "" {
					return false
				}
				seen[correction.ID] = true
				item := pairedTranslationOutputSentence{ID: correction.ID, FullTarget: original.FullTarget, Segments: correction.Segments}
				if correction.Rewrite {
					var targets []string
					for _, pair := range correction.Segments {
						targets = append(targets, pair.Target)
					}
					item.FullTarget = joinPairedTargetSegments(targets, targetLang)
				} else {
					item, _ = restorePairedTargetBoundaryPunctuation(item)
				}
				payload, _ := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{item}})
				single := input
				single.Sentences = []pairedTranslationSource{{ID: original.ID, Text: original.FullSource, TargetText: original.FullTarget, NLPSourceHint: original.NLPSourceHint}}
				if correction.Rewrite {
					single.Sentences[0].TargetText = ""
				}
				parsed, err := t.parsePairedTranslation(string(payload), single, originLang, targetLang)
				if err != nil {
					invalid[correction.ID] = true
					continue
				}
				parsed[0].SemanticReviewed = original.SemanticReviewed
				parsed[0].DraftTarget, parsed[0].RevisionVersion = original.DraftTarget, original.RevisionVersion
				corrected[original.ID] = parsed[0]
				rewritten[original.ID] = correction.Rewrite
				delete(invalid, original.ID)
			}
			return true
		})
		if err != nil {
			return err
		}
		// 生成模型不能自行批准改写。只有原文含义和实际新切口均经
		// 独立核验的候选才可替换冻结译文；失败保留旧值及待审状态。
		for _, original := range pending {
			candidate, exists := corrected[original.ID]
			if !reviewed || !exists || !rewritten[original.ID] {
				continue
			}
			original = sentences[original.ID]
			if newPairedTargetRepetition(original.FullTarget, candidate.Target) {
				delete(corrected, original.ID)
				invalid[original.ID] = true
				continue
			}
			source := pairedTranslationSource{ID: original.ID, Text: original.FullSource, TargetText: original.FullTarget}
			ok, _, err := t.reviewLengthRewrite(ctx, input, original, source, candidate.FullTarget, targetLang)
			if err != nil {
				return err
			}
			if ok {
				ok, _, err = t.reviewLengthBoundaries(ctx, input, original, candidate)
				if err != nil {
					return err
				}
			}
			if !ok {
				delete(corrected, original.ID)
				invalid[original.ID] = true
			}
		}
		if !reviewed || len(invalid) > 0 {
			t.translationNotice("部分字幕意群边界审校暂未完成，已保留完整原译和时间，恢复时可继续审校")
		}
		for _, original := range pending {
			sentence := sentences[original.ID]
			if value, ok := corrected[original.ID]; reviewed && ok {
				sentence = value
			}
			sentence.LayoutReviewed = reviewed && !invalid[sentence.ID]
			sentences[sentence.ID] = sentence
		}
	}
	for _, source := range input.Sentences {
		if sentence, ok := sentences[source.ID]; ok {
			if len(sentence.Source) == 1 {
				sentence.LayoutReviewed = true
				sentences[source.ID] = sentence
			}
			if err := save(sentence, true); err != nil {
				return err
			}
		}
	}
	return nil
}
