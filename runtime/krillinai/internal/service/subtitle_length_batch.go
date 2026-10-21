package service

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
)

type longPairedWork struct {
	source    pairedTranslationSource
	parent    pairedSentence
	index     int
	issue     string
	candidate *pairedSentence
}

// 最终检查按小批处理超长配对。生成与复核仍独立，成功项不随失败项重试。
// 少量无法解决的配对继续使用原有局部/父句恢复，不影响已通过的字幕。
func (t *Translator) batchLongPairedSubtitles(ctx context.Context, input pairedTranslationInput, sentences map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	var work []*longPairedWork
	for _, source := range input.Sentences {
		parent, ok := sentences[source.ID]
		if !ok || len(parent.Source) != len(parent.Target) || !subtitleSegmentsPreserveText(parent.FullSource, parent.Source) || !subtitleSegmentsPreserveText(parent.FullTarget, parent.Target) {
			continue
		}
		for i, text := range parent.Source {
			if subtitleTargetLength(text) <= 75 && subtitleTargetLength(parent.Target[i]) <= 75 {
				continue
			}
			local := source
			local.ID = fmt.Sprintf("%s_%d", source.ID, i)
			local.Text, local.TargetText, local.SourceHint, local.NLPSourceHint = text, parent.Target[i], nil, nil
			work = append(work, &longPairedWork{source: local, parent: parent, index: i})
		}
	}
	if len(work) < 2 {
		return nil
	}
	// 保留初译及全部尚未处理的配对，取消或接口失败可以恢复。
	for _, item := range work {
		parent := item.parent
		parent.LayoutFallback = true
		if err := save(parent, false); err != nil {
			return err
		}
	}
	for start := 0; start < len(work); start += 4 {
		group := work[start:min(start+4, len(work))]
		pending := group
		for attempt := 0; attempt < 3 && len(pending) > 0; attempt++ {
			rewrite := attempt > 0
			var requests []subtitleLengthSplitInput
			for _, item := range pending {
				local := input
				local.PreserveFinalBoundaries = true
				local.MaxSourceChars, local.MaxTargetChars, local.MaxFullwidthChars = 75, 75, 37
				local.Before, local.After, local.SemanticContext = nil, nil, nil
				source := item.source
				if rewrite {
					source.TargetText = ""
				}
				local.Sentences = []pairedTranslationSource{source}
				requests = append(requests, subtitleLengthSplitInput{pairedTranslationInput: local, ParentSource: item.parent.FullSource, ParentTarget: item.parent.FullTarget, ParentNLPHints: item.parent.NLPSourceHint, OriginalTarget: item.source.TargetText, DisplayTarget: min(input.MaxTargetChars, 75), MaxDisplayUnits: 75, MinSegments: max(2, (max(subtitleTargetLength(source.Text), subtitleTargetLength(item.source.TargetText))+74)/75), AllowTargetRewrite: rewrite, PreviousIssue: item.issue, MeasuredSourceHints: measuredSubtitleSourceHints(source.Text, input.MaxTargetChars)})
			}
			payload, _ := json.Marshal(struct {
				Requests []subtitleLengthSplitInput `json:"requests"`
			}{requests})
			prompt := "任务：translation_length_split_batch\n" + subtitleLengthSplitMode(rewrite) + subtitleLengthSplitPrompt + "\n本次输入requests包含多个独立超长配对。逐条遵守各自父句及previous_issue，返回同一个sentences数组，使用各自sentences[0].sentence_id，不混淆ID，不挪动内容。只返回segments，不回显target_text。\n输入 JSON：\n" + string(payload)
			if len(prompt) > translationRequestBytes {
				break
			} // 超预算交回逐条恢复。
			response, err := t.requestTranslation(ctx, prompt, 8192)
			if err != nil {
				if ctx.Err() != nil {
					return ctx.Err()
				}
				t.translationNotice("批量字幕修正请求重试后仍不可用，已保留原译继续逐句处理")
				return nil
			}
			var output pairedTranslationOutput
			if json.Unmarshal([]byte(util.ExtractJSONObject(response, "sentences")), &output) != nil {
				continue
			}
			items := make(map[string]pairedTranslationOutputSentence)
			duplicates := make(map[string]bool)
			for _, value := range output.Sentences {
				if _, exists := items[value.ID]; exists {
					duplicates[value.ID] = true
				}
				items[value.ID] = value
			}
			candidates := make(map[string]pairedSentence)
			for i, item := range pending {
				value, exists := items[item.source.ID]
				if !exists || duplicates[item.source.ID] {
					item.issue = "缺失或重复的ID"
					continue
				}
				data, _ := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{value}})
				normalized := normalizeLengthSplitResponse(string(data), item.source, targetLang, rewrite)
				parsed, err := t.parsePairedTranslation(normalized, requests[i].pairedTranslationInput, originLang, targetLang)
				if err == nil && !validTranslationSentencePartsWithLimit(item.source.Text, parsed[0].Source, originLang, len(parsed[0].Source)) {
					err = fmt.Errorf("切口拆开单词、专名或受保护文字")
				}
				if err == nil && sourceTranslationChanged(item.source, parsed[0].FullTarget) {
					if !rewrite {
						err = fmt.Errorf("冻结模式不能改写译文")
					} else if input.SemanticContext != nil {
						for _, term := range input.SemanticContext.Terms {
							if slices.Contains(term.SentenceIDs, item.parent.ID) && translationContainsTerm(item.source.TargetText, term.Target, targetLang) && !translationContainsTerm(parsed[0].FullTarget, term.Target, targetLang) {
								err = fmt.Errorf("不能丢失已确认术语：%s", term.Target)
								break
							}
						}
					}
				}
				if err != nil {
					item.issue = subtitleTextPreview(err.Error(), 1400)
					continue
				}
				candidates[item.source.ID] = parsed[0]
			}
			if len(candidates) > 0 {
				if err := t.reviewLongPairedBatch(ctx, input, pending, candidates); err != nil {
					return err
				}
			}
			next := make([]*longPairedWork, 0, len(pending))
			for _, item := range pending {
				if item.candidate == nil {
					next = append(next, item)
				}
			}
			pending = next
			// 每次复核后立即保存成功项；其他配对仍保留原始完整文本。
			if err := saveLongPairedCandidates(input, work, sentences, save); err != nil {
				return err
			}
		}
	}
	return nil
}

func (t *Translator) reviewLongPairedBatch(ctx context.Context, input pairedTranslationInput, work []*longPairedWork, candidates map[string]pairedSentence) error {
	type reviewItem struct {
		ID           string         `json:"sentence_id"`
		Source       string         `json:"source_text"`
		Original     string         `json:"original_target_text"`
		ParentSource string         `json:"parent_source_text"`
		ParentTarget string         `json:"parent_target_text"`
		ResultTarget string         `json:"resulting_parent_target_text"`
		Candidate    pairedSentence `json:"candidate"`
	}
	var items []reviewItem
	for _, item := range work {
		if candidate, ok := candidates[item.source.ID]; ok {
			chunks := subtitleExactChunks(item.parent.FullTarget, item.parent.Target)
			suffix := chunks[item.index][len(strings.TrimSpace(item.source.TargetText)):]
			chunks[item.index] = candidate.FullTarget + suffix
			resultTarget := strings.TrimSpace(strings.Join(chunks, ""))
			var targets []string
			targets = append(targets, item.parent.Target[:item.index]...)
			targets = append(targets, candidate.Target...)
			targets = append(targets, item.parent.Target[item.index+1:]...)
			if newPairedTargetRepetition(item.parent.FullTarget, targets) {
				item.issue = "局部修复在父句中新增重复译文；必须回到父句调整已有配对，不能重复补译"
				delete(candidates, item.source.ID)
				continue
			}
			items = append(items, reviewItem{item.source.ID, item.source.Text, item.source.TargetText, item.parent.FullSource, item.parent.FullTarget, resultTarget, candidate})
		}
	}
	if len(items) == 0 {
		return nil
	}
	var output struct {
		Reviews []struct {
			ID         string `json:"sentence_id"`
			Equivalent *bool  `json:"equivalent"`
			Acceptable *bool  `json:"acceptable"`
			Reason     string `json:"reason"`
		} `json:"reviews"`
	}
	payload := struct {
		SourceLanguage string       `json:"source_language"`
		TargetLanguage string       `json:"target_language"`
		Items          []reviewItem `json:"items"`
	}{input.SourceLanguage, input.TargetLanguage, items}
	prompt := "Independently verify EACH subtitle item without rewriting. Check BOTH equivalent and acceptable. Verify resulting_parent_target_text against ALL parent_source_text and parent_target_text, not only the local pair: local repairs must not add a second translation of information already expressed by another cue, omit content, or leave contradictory order. equivalent: preserve all source meaning, facts, names, quantities, negation, degree, uncertainty, conditions, time, causality, shared components and terminology, with no omission/addition. Natural paraphrase and word-order changes are allowed; moving a condition alone does not change its logic—check the actual condition and result. acceptable: every source/target pair corresponds, cuts follow natural groups, and the whole target reads fluently. Complete purpose/condition/cause clauses may occupy successive cues; each cue need not stand alone. Reject internal breaks in words, names, idioms, modifier/head, subject/predicate, verb/preposition objects or coordinated quantities, dangling tails, mismatches and unnatural syntax. ‘都摆满了/部分读完的书’ and ‘出版社的/书’ are bad cuts. Recognize genuine speech repairs and interruptions: an already interrupted source phrase is not a newly introduced grammar break, but preserve its actual meaning. Correct full meaning does not excuse incorrect pair alignment. If uncertain, return false for the relevant check. Return each ID once as JSON: {\"reviews\":[{\"sentence_id\":\"ID\",\"equivalent\":true or false,\"acceptable\":true or false,\"reason\":\"specific evidence or problem\"}]}."
	ok, err := t.semanticJSON(ctx, "translation_length_batch_review", prompt, payload, "reviews", &output, func() bool {
		if output.Reviews == nil || len(output.Reviews) != len(items) {
			return false
		}
		seen := make(map[string]bool)
		for _, review := range output.Reviews {
			if _, exists := candidates[review.ID]; !exists || seen[review.ID] || review.Equivalent == nil || review.Acceptable == nil || strings.TrimSpace(review.Reason) == "" {
				return false
			}
			seen[review.ID] = true
		}
		return true
	})
	if err != nil {
		return err
	}
	for _, item := range work {
		if _, exists := candidates[item.source.ID]; !exists {
			continue
		}
		item.issue = "独立含义与意群复核未完成"
		if !ok {
			continue
		}
		for _, review := range output.Reviews {
			if review.ID == item.source.ID {
				if *review.Equivalent && *review.Acceptable {
					candidate := candidates[review.ID]
					candidate.LayoutReviewed = true
					item.candidate = &candidate
				} else {
					item.issue = review.Reason
				}
			}
		}
	}
	return nil
}

func saveLongPairedCandidates(input pairedTranslationInput, work []*longPairedWork, sentences map[string]pairedSentence, save func(pairedSentence, bool) error) error {
	parents := make(map[string]pairedSentence)
	for _, item := range work {
		if item.candidate != nil {
			parents[item.parent.ID] = item.parent
		}
	}
	for id, original := range parents {
		updated := original
		updated.Source, updated.Target = nil, nil
		chunks := subtitleExactChunks(original.FullTarget, original.Target)
		for i, source := range original.Source {
			var candidate *pairedSentence
			for _, item := range work {
				if item.parent.ID == id && item.index == i {
					candidate = item.candidate
				}
			}
			if candidate == nil {
				updated.Source = append(updated.Source, source)
				updated.Target = append(updated.Target, original.Target[i])
				continue
			}
			updated.Source = append(updated.Source, candidate.Source...)
			updated.Target = append(updated.Target, candidate.Target...)
			suffix := chunks[i][len(strings.TrimSpace(original.Target[i])):]
			chunks[i] = candidate.FullTarget + suffix
		}
		updated.FullTarget = strings.TrimSpace(strings.Join(chunks, ""))
		updated.LayoutVersion, updated.LayoutTarget = pairedLayoutVersion, input.MaxTargetChars
		updated.LayoutFallback = pairedFinalLengthIssue(updated) != nil
		sentences[id] = updated
		if err := save(updated, !updated.LayoutFallback); err != nil {
			return err
		}
	}
	return nil
}
