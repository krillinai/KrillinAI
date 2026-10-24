package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"slices"
	"strings"
)

type segmentOverflow struct {
	ParentID     string `json:"parent_id"`
	ID           string `json:"sentence_id"`
	ParentSource string `json:"parent_text"`
	// 不重发direct和初译历史；提供相邻最终译文以防局部改写重复补译。
	ParentPairs   []segmentPromptUnit    `json:"parent_pairs"`
	SourceParts   []string               `json:"source_parts,omitempty"`
	SourceOptions [][]string             `json:"source_options,omitempty"`
	RejectedParts [][]string             `json:"-"`
	Source        string                 `json:"source"`
	Target        string                 `json:"target_text"`
	SourceWidth   int                    `json:"source_display_units"`
	TargetWidth   int                    `json:"target_display_units"`
	Hints         []subtitleMeasuredSpan `json:"measured_source_hints"`
	TargetHints   []subtitleMeasuredSpan `json:"measured_target_hints"`
	MinPieces     int                    `json:"minimum_pieces"`
	Attempt       int                    `json:"attempt"`
	Issue         string                 `json:"previous_issue,omitempty"`
}

func segmentOverflows(input pairedTranslationInput, parents map[string]pairedSentence) []segmentOverflow {
	var work []segmentOverflow
	for _, source := range input.Sentences {
		sentence, exists := parents[source.ID]
		if !exists {
			continue
		}
		for _, unit := range sentence.SegmentState.Units {
			sw, tw := subtitleTargetLength(unit.Source), subtitleTargetLength(unit.Target)
			if sw <= 75 && tw <= 75 {
				continue
			}
			item := segmentOverflow{ParentID: sentence.ID, ID: unit.ID, ParentSource: sentence.FullSource, ParentPairs: segmentParentPairs(sentence), Source: unit.Source, Target: unit.Target, SourceWidth: sw, TargetWidth: tw, Hints: measuredSubtitleSourceHints(unit.Source, input.MaxTargetChars), TargetHints: measuredSubtitleSourceHints(unit.Target, input.MaxTargetChars), MinPieces: max(2, (max(sw, tw)+74)/75), Issue: sentence.SegmentState.BoundaryIssue}
			for _, cut := range sentence.SegmentState.RejectedCuts {
				if cut.Source == unit.Source {
					item.RejectedParts = append(item.RejectedParts, cut.Parts)
				}
			}
			work = append(work, item)
		}
	}
	return work
}

func (t *Translator) splitSegmentOverflows(ctx context.Context, input pairedTranslationInput, parents map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	return t.splitSegmentOverflowRound(ctx, input, parents, originLang, targetLang, save, 0)
}

func (t *Translator) splitSegmentOverflowRound(ctx context.Context, input pairedTranslationInput, parents map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error, round int) error {
	work := segmentOverflows(input, parents)
	if len(work) == 0 {
		return nil
	}
	if round >= 3 {
		return segmentValidationFailure("局部重拆与含义修复三轮后仍存在超长，进度已保存：%s", work[0].ID)
	}
	for start := 0; start < len(work); start += 4 {
		pending := work[start:min(start+4, len(work))]
		for attempt := 0; attempt < 3 && len(pending) > 0; attempt++ {
			for i := range pending {
				pending[i].Attempt = attempt + 1
			}
			payload := struct {
				SourceLanguage  string                           `json:"source_language"`
				TargetLanguage  string                           `json:"target_language"`
				SoftLimit       int                              `json:"soft_display_target"`
				SemanticContext *translationBatchSemanticContext `json:"semantic_context,omitempty"`
				Requests        []segmentOverflow                `json:"requests"`
			}{input.SourceLanguage, input.TargetLanguage, min(input.MaxTargetChars, 75), segmentEffectiveContext(input, selectedSegmentParents(input, parents, "faithful", "expressive", "repair", "reviewed")), pending}

			// 先独立确定源文切口，再固定切口对齐已有译文。源文任务不接收译文与术语锚点。
			cuts, err := t.cutSegmentOverflowSources(ctx, input, pending, originLang)
			if err != nil {
				var validation *segmentValidationError
				if errors.As(err, &validation) {
					for _, item := range pending {
						if item.Issue == "" {
							continue
						}
						parent := cloneSegmentedSentence(parents[item.ParentID])
						parent.SegmentState.BoundaryIssue = item.Issue
						for _, parts := range item.RejectedParts {
							known := false
							for _, prior := range parent.SegmentState.RejectedCuts {
								known = known || prior.Source == item.Source && slices.Equal(prior.Parts, parts)
							}
							if !known {
								parent.SegmentState.RejectedCuts = append(parent.SegmentState.RejectedCuts, segmentRejectedCut{Source: item.Source, Parts: parts})
							}
						}
						parents[parent.ID] = parent
						if saveErr := save(parent, false); saveErr != nil {
							return saveErr
						}
					}
				}
				return err
			}
			for i := range pending {
				pending[i].SourceParts = cuts[pending[i].ID]
			}
			payload.Requests = pending
			data, _ := json.Marshal(payload)
			prompt := "任务：translation_segment_split\n" + segmentSplitPrompt + "\n输入 JSON：\n" + string(data)
			if len(prompt) > translationRequestBytes {
				return fmt.Errorf("局部意群重拆请求超过预算")
			}
			response, err := t.requestTranslation(ctx, prompt, translationOutputBudget)
			if err != nil {
				return err
			}
			var output segmentResponse
			decodeErr := decodeSegmentJSON(response, &output)
			indexes, duplicate := map[string]int{}, map[string]bool{}
			for i, item := range output.Sentences {
				if _, exists := indexes[item.ID]; exists {
					duplicate[item.ID] = true
				}
				indexes[item.ID] = i
			}
			var next []segmentOverflow
			for _, item := range pending {
				problem := ""
				lengthProblem := ""
				var sources, targets []string
				index, exists := indexes[item.ID]
				if decodeErr != nil || !exists || duplicate[item.ID] {
					problem = "missing or duplicate ID / invalid JSON"
				} else {
					for _, part := range output.Sentences[index].Segments {
						target := part.Target
						if target == "" {
							target = part.Text
						} else if part.Text != "" && part.Text != target {
							problem = "conflicting target_text/text"
						}
						fillerOnly := nonSemanticHesitationOnly(part.Source, originLang)
						if fillerOnly {
							target = ""
						}
						sources = append(sources, strings.TrimSpace(part.Source))
						targets = append(targets, strings.TrimSpace(target))
						if !hasSubtitleContent(target) && !fillerOnly || hasSubtitleLineBreak(target) || hasSubtitleLineBreak(part.Source) {
							problem = "empty or multiline piece"
						} else if sw, tw := subtitleTargetLength(part.Source), subtitleTargetLength(target); sw > 75 || tw > 75 {
							lengthProblem = fmt.Sprintf("piece %d source=%d target=%d display units, hard limit=75. Rejected source=%q target=%q. Choose an earlier natural cut or more pieces; do not repeat this split.", len(sources), sw, tw, part.Source, target)
						}
					}
					if !segmentAlignmentSourceAllowed(item, sources) {
						problem = "alignment must use one complete validated source option verbatim"
					}
					if len(sources) < 2 || !validTranslationSentencePartsWithLimit(item.Source, sources, originLang, len(sources)) || !subtitleSegmentsHaveSafeBoundaries(targets) {
						problem = "source coverage, protected word or grapheme boundary failed"
					}
				}
				// 先用实测反馈重试一次。若仍仅有长度失败，保存完整合法的
				// 配对候选，下一轮只重拆超长子段，避免反复重发同一大段。
				// 此时仍为expressive，不能审查或发布超长候选。
				if problem == "" && lengthProblem != "" && attempt == 0 {
					problem = lengthProblem
				}
				if problem != "" {
					item.Issue = problem
					if exists && strings.Contains(problem, "hard limit=75") {
						item.MinPieces = max(item.MinPieces+1, len(output.Sentences[index].Segments)+1)
					}
					next = append(next, item)
					continue
				}
				parent := cloneSegmentedSentence(parents[item.ParentID])
				position := -1
				for i, unit := range parent.SegmentState.Units {
					if unit.ID == item.ID {
						position = i
						break
					}
				}
				if position < 0 {
					return fmt.Errorf("局部重拆ID丢失：%s", item.ID)
				}
				old := parent.SegmentState.Units[position]
				units, err := positionSegmentUnits(old.ID, item.Source, sources, old.Start)
				if err != nil {
					item.Issue = err.Error()
					next = append(next, item)
					continue
				}
				for i := range units {
					units[i].OriginIDs = append([]string(nil), old.OriginIDs...)
					units[i].Target = targets[i]
					units[i].Direct = targets[i]
				}
				if joinPairedTargetSegments(targets, targetLang) != old.Target {
					found := false
					for _, draft := range parent.SegmentState.AlignmentDrafts {
						found = found || draft.ID == old.ID
					}
					if !found {
						parent.SegmentState.AlignmentDrafts = append(parent.SegmentState.AlignmentDrafts, segmentPromptUnit{ID: old.ID, Source: old.Source, Target: old.Target})
					}
				}
				updated := append([]segmentedTranslationUnit{}, parent.SegmentState.Units[:position]...)
				updated = append(updated, units...)
				updated = append(updated, parent.SegmentState.Units[position+1:]...)
				parent.SegmentState.Units = updated
				parent.SegmentState.Stage = "expressive"
				parent.SegmentState.Issue = ""
				source := pairedTranslationSource{ID: parent.ID, Text: parent.FullSource, NLPSourceHint: parent.NLPSourceHint}
				if err := t.validateSegmentedSentence(parent, source, originLang, targetLang); err != nil {
					item.Issue = err.Error()
					next = append(next, item)
					continue
				}
				parent = materializeSegmentedSentence(parent, targetLang)
				parents[parent.ID] = parent
				if err := save(parent, false); err != nil {
					return err
				}
			}
			pending = next
		}
		if len(pending) > 0 {
			return segmentValidationFailure("局部重拆仍未通过本地校验：%s %s", pending[0].ID, pending[0].Issue)
		}
	}
	if len(segmentOverflows(input, parents)) > 0 {
		return t.splitSegmentOverflowRound(ctx, input, parents, originLang, targetLang, save, round+1)
	}
	// 同一父句若有多个超长段，统一审查最终父句，防止改写引入跨段遗漏或重复。
	for round := 0; round < 3; round++ {
		if err := t.reviewSegmentTranslations(ctx, input, parents, targetLang, save); err != nil {
			return err
		}
		if len(selectedSegmentParents(input, parents, "repair")) == 0 {
			break
		}
		if err := t.generateSegmentTranslations(ctx, input, parents, false, originLang, targetLang, save); err != nil {
			return err
		}
	}
	// 最后一轮修复之后必须再次通过审核，不能把新候选直接标为完成。
	if err := t.reviewSegmentTranslations(ctx, input, parents, targetLang, save); err != nil {
		return err
	}
	if failed := selectedSegmentParents(input, parents, "repair"); len(failed) > 0 {
		return segmentValidationFailure("重拆后的独立审查未通过：%s %s", failed[0].ID, failed[0].SegmentState.Issue)
	}
	for _, sentence := range selectedSegmentParents(input, parents, "reviewed") {
		if err := pairedFinalLengthIssue(sentence); err != nil {
			// 审查失败允许修复NLP坏边界，但合并之后必须重新走硬上限检查；
			// 携带上次具体失败原因另选切口，不能直接交付超长或丢弃已通过项。
			return t.splitSegmentOverflowRound(ctx, input, parents, originLang, targetLang, save, round+1)
		}
	}
	return nil
}

func segmentParentPairs(sentence pairedSentence) []segmentPromptUnit {
	var result []segmentPromptUnit
	for _, u := range sentence.SegmentState.Units {
		result = append(result, segmentPromptUnit{ID: u.ID, Source: u.Source, Target: u.Target})
	}
	return result
}

func segmentAlignmentSourceAllowed(item segmentOverflow, parts []string) bool {
	if segmentSourceCutRejected(item, parts) {
		return false
	}
	if slices.Equal(parts, item.SourceParts) {
		return true
	}
	for _, option := range item.SourceOptions {
		if slices.Equal(parts, option) {
			return true
		}
	}
	return false
}

func segmentSourceCutRejected(item segmentOverflow, parts []string) bool {
	for _, rejected := range item.RejectedParts {
		if slices.Equal(rejected, parts) {
			return true
		}
	}
	return false
}

func (t *Translator) cutSegmentOverflowSources(ctx context.Context, input pairedTranslationInput, work []segmentOverflow, language types.StandardLanguageCode) (map[string][]string, error) {
	cuts := map[string][]string{}
	originals := map[string]*segmentOverflow{}
	for i := range work {
		work[i].SourceOptions = nil
		originals[work[i].ID] = &work[i]
	}
	// 优先从实际源语言依存树选择完整短语边界；无可用模型/方案才请求语义切口。
	// 输出协议和已通过父句不变，恢复失败任务可以复用已有翻译。
	if t.nlpBoundaryChecker == nil {
		options, err := chooseParsedSegmentCutOptions(ctx, input, work, language, t.nlpRuntime)
		if err != nil {
			return nil, err
		}
		if options != nil {
			var remaining []segmentOverflow
			for i := range work {
				for _, candidate := range options[work[i].ID] {
					if !segmentSourceCutRejected(work[i], candidate) {
						work[i].SourceOptions = append(work[i].SourceOptions, candidate)
					}
				}
				if len(work[i].SourceOptions) == 0 {
					remaining = append(remaining, work[i])
					continue
				}
				cuts[work[i].ID] = work[i].SourceOptions[0]
			}
			if len(remaining) == 0 {
				return cuts, nil
			}
			work = remaining
		}
	}
	for i := range work {
		work[i].SourceOptions = nil
	}
	type cutRequest struct {
		ID       string                 `json:"sentence_id"`
		Source   string                 `json:"source"`
		Parent   string                 `json:"parent_text"`
		Minimum  int                    `json:"minimum_pieces"`
		Hints    []subtitleMeasuredSpan `json:"measured_source_hints"`
		Issue    string                 `json:"previous_issue,omitempty"`
		Rejected [][]string             `json:"rejected_source_parts,omitempty"`
	}
	var result segmentResponse
	payload := struct {
		Language string       `json:"source_language"`
		Soft     int          `json:"soft_display_target"`
		Requests []cutRequest `json:"requests"`
	}{input.SourceLanguage, min(input.MaxTargetChars, 75), nil}
	for attempt := 0; attempt < 3; attempt++ {
		payload.Requests = nil
		for _, w := range work {
			payload.Requests = append(payload.Requests, cutRequest{w.ID, w.Source, w.ParentSource, w.MinPieces, w.Hints, w.Issue, w.RejectedParts})
		}
		issues := map[int]string{}
		var boundaryErr error
		validate := func() bool {
			clear(issues)
			counts := map[string]int{}
			expected := map[string]bool{}
			for _, w := range work {
				expected[w.ID] = true
			}
			for _, parent := range result.Sentences {
				if !expected[parent.ID] {
					for i := range work {
						issues[i] = "Return requested IDs only; unknown source ID rejected."
					}
					return false
				}
				counts[parent.ID]++
				var parts []string
				for _, unit := range parent.Segments {
					parts = append(parts, strings.TrimSpace(unit.Source))
				}
				cuts[parent.ID] = parts
			}
			var boundaryRequests []translationNLPBoundaryRequest
			var boundaryIndexes []int
			for i, w := range work {
				parts := cuts[w.ID]
				issue := ""
				if counts[w.ID] != 1 || len(parts) < 2 || !validTranslationSentencePartsWithLimit(w.Source, parts, language, len(parts)) {
					issue = "Return each requested ID once with 2+ exact continuous slices; preserve protected words and graphemes."
				}
				if segmentSourceCutRejected(w, parts) {
					issue = "This source cut already failed validation or bilingual review. Choose a different natural boundary; do not repeat rejected_source_parts."
				}
				for j, part := range parts {
					if width := subtitleTargetLength(part); width > 75 {
						issue = fmt.Sprintf("piece %d source=%d target=not-yet-aligned display units, hard limit=75. Choose an earlier natural cut or more pieces.", j+1, width)
					}
				}
				if issue != "" {
					issues[i] = issue
				} else {
					boundaryRequests = append(boundaryRequests, translationNLPBoundaryRequest{w.Source, cuts[w.ID]})
					boundaryIndexes = append(boundaryIndexes, i)
				}
			}
			if len(boundaryRequests) > 0 {
				checker := t.nlpBoundaryChecker
				if checker == nil {
					checker = runTranslationNLPBoundaryCheck
					if t.nlpRuntime != nil {
						checker = t.nlpRuntime.boundaries
					}
				}
				var problems []string
				problems, boundaryErr = checker(ctx, boundaryRequests, language)
				if boundaryErr != nil {
					return false
				}
				if len(problems) != len(boundaryRequests) {
					boundaryErr = fmt.Errorf("源文切口句法响应缺失")
					return false
				}
				for i, issue := range problems {
					if issue != "" {
						index := boundaryIndexes[i]
						issues[index] = issue
						item := &work[index]
						original := originals[item.ID]
						parts := cuts[item.ID]
						if !segmentSourceCutRejected(*original, parts) {
							original.RejectedParts = append(original.RejectedParts, slices.Clone(parts))
						}
						item.RejectedParts = original.RejectedParts
					}
				}
			}

			return len(issues) == 0
		}
		ok, err := t.semanticJSON(ctx, "translation_segment_cut", segmentCutPrompt, payload, "sentences", &result, validate)
		if err != nil {
			return nil, err
		}
		if boundaryErr != nil {
			return nil, boundaryErr
		}
		if ok {
			return cuts, nil
		}
		var next []segmentOverflow
		for i, w := range work {
			issue, failed := issues[i]
			// 无效JSON时回调未执行，不能把尚未校验的条目当作通过。
			if len(issues) == 0 {
				failed, issue = true, "Return complete JSON with each requested source ID exactly once."
			}
			if failed {
				w.Issue = issue
				originals[w.ID].Issue = issue
				next = append(next, w)
				delete(cuts, w.ID)
			}
		}
		work = next
	}

	return nil, segmentValidationFailure("源文自然切口未通过验证：%s %s；保留原始配对，未发布候选", work[0].ID, work[0].Issue)
}
