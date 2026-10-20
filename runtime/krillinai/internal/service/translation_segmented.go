package service

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

// 独立实验路径。只有同输入实测通过后才切换默认值，不增加用户配置。
var translationFlowDefault = "legacy"

//go:embed translation_segment_faithful.txt
var segmentFaithfulPrompt string

//go:embed translation_segment_expressive.txt
var segmentExpressivePrompt string

//go:embed translation_segment_review.txt
var segmentReviewPrompt string

//go:embed translation_segment_cut.txt
var segmentCutPrompt string

//go:embed translation_segment_split.txt
var segmentSplitPrompt string

type segmentedTranslationUnit struct {
	ID        string   `json:"segment_id"`
	OriginIDs []string `json:"source_segment_ids,omitempty"`
	Start     int      `json:"source_start_byte"`
	End       int      `json:"source_end_byte"`
	Source    string   `json:"source"`
	Direct    string   `json:"direct,omitempty"`
	Target    string   `json:"target_text,omitempty"`
}
type segmentedTranslationState struct {
	Version         string                     `json:"version"`
	Stage           string                     `json:"stage"`
	Units           []segmentedTranslationUnit `json:"units"`
	Issue           string                     `json:"issue,omitempty"`
	BoundaryIssue   string                     `json:"last_boundary_issue,omitempty"`
	TermDecisions   []segmentTermDecision      `json:"term_decisions,omitempty"`
	AlignmentDrafts []segmentPromptUnit        `json:"before_alignment,omitempty"`
	RejectedCuts    []segmentRejectedCut       `json:"rejected_cuts,omitempty"`
}
type segmentRejectedCut struct {
	Source string   `json:"source"`
	Parts  []string `json:"parts"`
}
type segmentTermDecision struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Reason string `json:"reason"`
}

type segmentRequestParent struct {
	ID              string              `json:"sentence_id"`
	Source          string              `json:"full_source"`
	Units           []segmentPromptUnit `json:"segments"`
	Issue           string              `json:"issue,omitempty"`
	BeforeAlignment []segmentPromptUnit `json:"before_alignment,omitempty"`
}

// 原文位置只用于本地保护和词时间映射；模型只需稳定ID与文本。
type segmentPromptUnit struct {
	ID     string `json:"segment_id"`
	Source string `json:"source"`
	Direct string `json:"direct,omitempty"`
	Target string `json:"target_text,omitempty"`
}
type segmentRequest struct {
	SourceLanguage  string                           `json:"source_language"`
	TargetLanguage  string                           `json:"target_language"`
	SoftLimit       int                              `json:"soft_display_target,omitempty"`
	HardLimit       int                              `json:"hard_display_limit,omitempty"`
	Before          []string                         `json:"context_before,omitempty"`
	After           []string                         `json:"context_after,omitempty"`
	SemanticContext *translationBatchSemanticContext `json:"semantic_context,omitempty"`
	Parents         []segmentRequestParent           `json:"sentences"`
}
type segmentResponse struct {
	Sentences []segmentResponseParent `json:"sentences"`
}
type segmentResponseParent struct {
	ID            string                `json:"sentence_id"`
	Analysis      string                `json:"analysis"`
	TermDecisions []segmentTermDecision `json:"term_decisions"`
	Segments      []segmentResponseUnit `json:"segments"`
}
type segmentResponseUnit struct {
	ID      string   `json:"segment_id"`
	IDs     []string `json:"segment_ids"`
	Source  string   `json:"source"`
	Direct  string   `json:"direct"`
	Reflect string   `json:"reflect"`
	Target  string   `json:"target_text"`
	Text    string   `json:"text"` // 兼容明确的单一别名；有冲突则拒绝。
}

func segmentedFlowVersion() string {
	sum := sha256.Sum256([]byte("segments-v12-fillers\n" + translationFillerPolicy + segmentFaithfulPrompt + segmentExpressivePrompt + segmentReviewPrompt + segmentSplitPrompt + segmentCutPrompt + translationSourceCutWorker))
	return hex.EncodeToString(sum[:])
}

// 约1000个源文显示单位/20个意群合批；完整父句永不被拆到不同请求。
func segmentTranslationBatches(inputs []pairedTranslationInput, texts []string, plan *translationSemanticPlan) []pairedTranslationInput {
	var result []pairedTranslationInput
	for _, input := range inputs {
		batch := input
		batch.Sentences = nil
		size, units := 0, 0
		flush := func() {
			if len(batch.Sentences) == 0 {
				return
			}
			start, _ := strconv.Atoi(batch.Sentences[0].ID)
			end, _ := strconv.Atoi(batch.Sentences[len(batch.Sentences)-1].ID)
			batch.Before, batch.After = translationBatchContext(texts, start-1, end)
			batch.SemanticContext = plan.forSources(batch.Sentences)
			result = append(result, batch)
			batch = input
			batch.Sentences = nil
			size, units = 0, 0
		}
		for _, source := range input.Sentences {
			count := max(1, len(source.NLPSourceHint))
			if len(batch.Sentences) > 0 && (size+subtitleTargetLength(source.Text) > 1000 || units+count > 20) {
				flush()
			}
			batch.Sentences = append(batch.Sentences, source)
			size += subtitleTargetLength(source.Text)
			units += count
		}
		flush()
	}
	return result
}

func sourceSegmentedSentence(source pairedTranslationSource, languages ...types.StandardLanguageCode) (pairedSentence, error) {
	parts := source.NLPSourceHint
	if len(parts) == 0 {
		parts = []string{source.Text}
	}
	units, err := positionSegmentUnits(source.ID, source.Text, parts, 0)
	if err != nil {
		return pairedSentence{}, err
	}
	if len(languages) > 0 {
		units = mergeHesitationSourceUnits(source.Text, units, languages[0])
	}
	return pairedSentence{ID: source.ID, FullSource: source.Text, NLPSourceHint: source.NLPSourceHint, SegmentState: &segmentedTranslationState{Version: segmentedFlowVersion(), Stage: "source", Units: units}}, nil
}
func positionSegmentUnits(prefix, text string, parts []string, offset int) ([]segmentedTranslationUnit, error) {
	if !subtitleSegmentsPreserveText(text, parts) || !subtitleSegmentsHaveSafeBoundaries(parts) {
		return nil, fmt.Errorf("%s原文分段未完整覆盖或字素不安全", prefix)
	}
	var units []segmentedTranslationUnit
	cursor := 0
	for i, part := range parts {
		part = strings.TrimSpace(part)
		// 只允许段间空白，禁止用模糊匹配或比例对齐寻找原文位置。
		cursor += len(text[cursor:]) - len(strings.TrimLeftFunc(text[cursor:], unicode.IsSpace))
		if !strings.HasPrefix(text[cursor:], part) || !hasSubtitleContent(part) {
			return nil, fmt.Errorf("%s原文位置不匹配", prefix)
		}
		id := prefix + "." + strconv.Itoa(i+1)
		units = append(units, segmentedTranslationUnit{ID: id, OriginIDs: []string{id}, Start: offset + cursor, End: offset + cursor + len(part), Source: part})
		cursor += len(part)
	}
	return units, nil
}
func materializeSegmentedSentence(sentence pairedSentence, targetLang types.StandardLanguageCode) pairedSentence {
	sentence.Source, sentence.Target = nil, nil
	for _, unit := range sentence.SegmentState.Units {
		sentence.Source = append(sentence.Source, unit.Source)
		sentence.Target = append(sentence.Target, unit.Target)
	}
	sentence.FullTarget = joinPairedTargetSegments(sentence.Target, targetLang)
	sentence.SemanticReviewed = sentence.SegmentState.Stage == "reviewed"
	sentence.LayoutReviewed = sentence.SemanticReviewed
	sentence.LayoutFallback = pairedFinalLengthIssue(sentence) != nil
	return sentence
}
func (t *Translator) validateSegmentedSentence(sentence pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) error {
	state := sentence.SegmentState
	if sentence.OmittedHesitation || state == nil || state.Version != segmentedFlowVersion() || sentence.ID != source.ID || sentence.FullSource != source.Text || !slices.Equal(sentence.NLPSourceHint, source.NLPSourceHint) {
		return fmt.Errorf("分段版本或源文不一致")
	}
	if state.Stage != "source" && state.Stage != "faithful" && state.Stage != "expressive" && state.Stage != "repair" && state.Stage != "reviewed" {
		return fmt.Errorf("未知翻译阶段")
	}
	seenTerms := map[string]bool{}
	for _, d := range state.TermDecisions {
		key := strings.ToLower(d.Source)
		if seenTerms[key] || !translationContainsTerm(source.Text, d.Source, originLang) || !hasSubtitleContent(d.Target) || !hasSubtitleContent(d.Reason) || len(d.Target) > 100 || len(d.Reason) > 360 || hasSubtitleLineBreak(d.Target) || hasSubtitleLineBreak(d.Reason) {
			return fmt.Errorf("术语决定无效")
		}
		seenTerms[key] = true
	}
	seen := map[string]bool{}
	var sources, targets []string
	last := 0
	for _, unit := range state.Units {
		if seen[unit.ID] || !strings.HasPrefix(unit.ID, source.ID+".") || unit.Start < last || unit.End <= unit.Start || unit.End > len(source.Text) || source.Text[unit.Start:unit.End] != unit.Source || strings.TrimSpace(source.Text[last:unit.Start]) != "" || hasSubtitleLineBreak(unit.Source) || !hasSubtitleContent(unit.Source) {
			return fmt.Errorf("分段ID、位置或原文不合法")
		}
		seen[unit.ID] = true
		last = unit.End
		sources = append(sources, unit.Source)
		targets = append(targets, unit.Target)
		fillerOnly := nonSemanticHesitationOnly(unit.Source, originLang)
		if state.Stage != "source" && ((!hasSubtitleContent(unit.Direct) && !(fillerOnly && unit.Direct == "")) || hasSubtitleLineBreak(unit.Direct)) {
			return fmt.Errorf("缺少初译")
		}
		if state.Stage != "source" && state.Stage != "faithful" && ((!hasSubtitleContent(unit.Target) && !(fillerOnly && unit.Target == "")) || hasSubtitleLineBreak(unit.Target) || len(unit.Target) > 4*len(source.Text)+1024) {
			return fmt.Errorf("缺少合法译文")
		}
	}
	if len(sources) == 0 || !subtitleSegmentsPreserveText(source.Text, sources) || !subtitleSegmentsHaveSafeBoundaries(sources) || len(sources) > 1 && !validTranslationSentencePartsWithLimit(source.Text, sources, originLang, len(sources)) {
		return fmt.Errorf("原文未覆盖或切开受保护文字")
	}
	if state.Stage != "source" && state.Stage != "faithful" {
		full := joinPairedTargetSegments(targets, targetLang)
		if !subtitleSegmentsHaveSafeBoundaries(targets) || !t.isTranslationValid(source.Text, full, originLang, targetLang) {
			return fmt.Errorf("目标语或字素不合法")
		}
	}
	return nil
}
func (t *Translator) recoverSegmentedSentence(sentence pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) (pairedSentence, bool) {
	if t.validateSegmentedSentence(sentence, source, originLang, targetLang) != nil {
		return pairedSentence{}, false
	}
	// 始终由已验证的意群构建输出，不信任缓存中的旧布局标志。
	sentence = materializeSegmentedSentence(sentence, targetLang)
	return sentence, true
}
func makeSegmentRequest(input pairedTranslationInput, parents []pairedSentence) segmentRequest {
	value := segmentRequest{SourceLanguage: input.SourceLanguage, TargetLanguage: input.TargetLanguage, Before: input.Before, After: input.After, SemanticContext: segmentEffectiveContext(input, parents)}
	for _, sentence := range parents {
		var units []segmentPromptUnit
		for _, unit := range sentence.SegmentState.Units {
			units = append(units, segmentPromptUnit{unit.ID, unit.Source, unit.Direct, unit.Target})
		}
		value.Parents = append(value.Parents, segmentRequestParent{ID: sentence.ID, Source: sentence.FullSource, Units: units, Issue: sentence.SegmentState.Issue})
	}
	return value
}
func cloneSegmentedSentence(sentence pairedSentence) pairedSentence {
	state := *sentence.SegmentState
	state.Units = slices.Clone(state.Units)
	state.TermDecisions = slices.Clone(state.TermDecisions)
	state.AlignmentDrafts = slices.Clone(state.AlignmentDrafts)
	state.RejectedCuts = slices.Clone(state.RejectedCuts)
	for i := range state.RejectedCuts {
		state.RejectedCuts[i].Parts = slices.Clone(state.RejectedCuts[i].Parts)
	}
	sentence.SegmentState = &state
	return sentence
}
func selectedSegmentParents(input pairedTranslationInput, parents map[string]pairedSentence, stages ...string) []pairedSentence {
	var result []pairedSentence
	for _, source := range input.Sentences {
		if sentence, ok := parents[source.ID]; ok && slices.Contains(stages, sentence.SegmentState.Stage) {
			result = append(result, sentence)
		}
	}
	return result
}

// 忠实初译与表达定稿使用同一组稳定ID。有效父句立即保存，格式错误只重试失败父句。
func (t *Translator) generateSegmentTranslations(ctx context.Context, input pairedTranslationInput, parents map[string]pairedSentence, faithful bool, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	stages := []string{"faithful", "repair"}
	prompt, task := segmentExpressivePrompt, "translation_segment_expressive"
	if faithful {
		stages = []string{"source"}
		prompt, task = segmentFaithfulPrompt, "translation_segment_faithful"
	}
	pending := selectedSegmentParents(input, parents, stages...)
	feedback := ""
	for attempt := 0; attempt < 3 && len(pending) > 0; attempt++ {
		payload := makeSegmentRequest(input, pending)
		// 已表达的候选不与direct并列重复发送；失败原因和当前候选足够修复。
		if faithful {
			for i := range payload.Parents {
				payload.Parents[i].Units = slices.Clone(payload.Parents[i].Units)
				for j := range payload.Parents[i].Units {
					payload.Parents[i].Units[j].Direct = ""
					payload.Parents[i].Units[j].Target = ""
				}
			}
		} else {
			for i := range payload.Parents {
				payload.Parents[i].Units = slices.Clone(payload.Parents[i].Units)
				for j := range payload.Parents[i].Units {
					unit := &payload.Parents[i].Units[j]
					if unit.Direct == unit.Target {
						unit.Target = ""
					} else {
						unit.Direct = ""
					}
				}
			}
		}
		request := "任务：" + task + "\n" + prompt
		if t.filterNonSemanticFillers {
			request += "\nOmit meaningless um/uh/ah in the target only; preserve meaningful emphasis, hesitation and quoted speech.\n"
		}
		if faithful {
			data, _ := json.Marshal(payload)
			request += "\n输入 JSON：\n" + string(data)
		} else {
			request = "任务：" + task + "\n" + makeSegmentEditorPrompt(payload, t.filterNonSemanticFillers)
		}
		request += feedback
		if len(request) > translationRequestBytes {
			return fmt.Errorf("意群翻译请求超过预算，进度已保存")
		}
		response, err := t.requestTranslation(ctx, request, translationOutputBudget)
		if err != nil {
			if translationOutputError(err) {
				if len(pending) > 1 {
					return t.generateSegmentSubBatches(ctx, input, pending, parents, faithful, originLang, targetLang, save)
				}
				feedback = "\nPrevious JSON was truncated. Return compact complete JSON for current IDs only."
				continue
			}
			return err
		}
		var output segmentResponse
		decodeErr := decodeSegmentJSON(response, &output)
		if !faithful {
			decodeErr = decodeSegmentEditorJSON(response, payload, &output)
		}
		if decodeErr != nil && len(pending) > 1 {
			return t.generateSegmentSubBatches(ctx, input, pending, parents, faithful, originLang, targetLang, save)
		}
		indexes := map[string]int{}
		duplicates := map[string]bool{}
		for i, value := range output.Sentences {
			if _, ok := indexes[value.ID]; ok {
				duplicates[value.ID] = true
			}
			indexes[value.ID] = i
		}
		var next []pairedSentence
		var issues []string
		for _, original := range pending {
			index, exists := indexes[original.ID]
			problem := ""
			candidate := cloneSegmentedSentence(original)
			if decodeErr != nil || !exists || duplicates[original.ID] {
				problem = "missing, duplicate or invalid JSON parent ID"
			} else {
				item := output.Sentences[index]

				position := 0
				var updated []segmentedTranslationUnit
				for _, value := range item.Segments {
					ids := value.IDs
					if len(ids) == 0 {
						ids = []string{value.ID}
					}
					if len(ids) > 1 && faithful {
						problem = "faithful draft must retain original IDs"
						break
					}
					if position+len(ids) > len(candidate.SegmentState.Units) {
						problem = "extra or duplicate segment IDs"
						break
					}
					unit := candidate.SegmentState.Units[position]
					var directs []string
					unit.OriginIDs = nil
					for j, id := range ids {
						part := candidate.SegmentState.Units[position+j]
						if id != part.ID {
							problem = "segment ID or order changed"
							break
						}
						unit.End = part.End
						unit.OriginIDs = append(unit.OriginIDs, part.OriginIDs...)
						directs = append(directs, part.Direct)
					}
					if problem != "" {
						break
					}
					unit.Source = candidate.FullSource[unit.Start:unit.End]
					unit.Direct = joinPairedTargetSegments(directs, targetLang)
					position += len(ids)
					text := value.Target
					if text == "" {
						text = value.Text
					} else if value.Text != "" && value.Text != text {
						problem = "conflicting text/target_text"
						break
					}
					if faithful {
						text = value.Direct
						if text == "" {
							text = value.Target
						}
						if text == "" {
							text = value.Text
						}
					}
					fillerOnly := nonSemanticHesitationOnly(unit.Source, originLang)
					if fillerOnly {
						text = ""
					}
					if !hasSubtitleContent(text) && !fillerOnly || hasSubtitleLineBreak(text) || len(text) > 4*len(candidate.FullSource)+1024 {
						problem = "empty, multiline or excessive translation"
						break
					}
					if faithful {
						unit.Direct = text
						unit.Target = text
					} else {
						unit.Target = text
					}
					updated = append(updated, unit)
				}
				if problem == "" && position != len(candidate.SegmentState.Units) {
					problem = "missing segment IDs; empty targets are forbidden, use explicit adjacent segment_ids for an inseparable block"
				}
				candidate.SegmentState.Units = updated
				if problem == "" && !faithful {
					problem = validateSegmentTermDecisions(item.TermDecisions, original, input, originLang)
					if problem == "" {
						candidate.SegmentState.TermDecisions = mergeSegmentTermDecisions(candidate.SegmentState.TermDecisions, item.TermDecisions)
					}
				}
			}
			if problem == "" {
				candidate.SegmentState.Stage = "expressive"
				if faithful {
					candidate.SegmentState.Stage = "faithful"
				}
				candidate.SegmentState.Issue = ""
				problemErr := t.validateSegmentedSentence(candidate, pairedTranslationSource{ID: original.ID, Text: original.FullSource, NLPSourceHint: original.NLPSourceHint}, originLang, targetLang)
				if problemErr != nil {
					problem = problemErr.Error()
				}
			}
			if problem != "" {
				next = append(next, original)
				issues = append(issues, original.ID+": "+problem)
				continue
			}
			candidate = materializeSegmentedSentence(candidate, targetLang)
			parents[candidate.ID] = candidate
			if err := save(candidate, false); err != nil {
				return err
			}
		}
		pending = next
		feedback = "\nFix current failed IDs only: " + strings.Join(issues, "; ")
	}
	if len(pending) > 0 {
		return segmentValidationFailure("意群翻译响应未通过校验，已保存有效父句：%s", pending[0].ID)
	}
	return nil
}

type segmentReviewIssue struct {
	ID         string   `json:"sentence_id"`
	SegmentIDs []string `json:"segment_ids"`
	Reason     string   `json:"reason"`
	Kind       string   `json:"kind,omitempty"`
}

func (t *Translator) reviewSegmentTranslations(ctx context.Context, input pairedTranslationInput, parents map[string]pairedSentence, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	pending := selectedSegmentParents(input, parents, "expressive")
	if len(pending) == 0 {
		return nil
	}
	payload := makeSegmentRequest(input, pending)
	// 独立审查只看原文和当前候选，防止以初译为金标；也避免重复历史。
	expected := map[string]map[string]bool{}
	for i := range payload.Parents {
		payload.Parents[i].BeforeAlignment = slices.Clone(pending[i].SegmentState.AlignmentDrafts)
		payload.Parents[i].Units = slices.Clone(payload.Parents[i].Units)
		units := map[string]bool{}
		for j := range payload.Parents[i].Units {
			payload.Parents[i].Units[j].Direct = ""
			units[payload.Parents[i].Units[j].ID] = true
		}
		expected[payload.Parents[i].ID] = units
	}
	var result struct {
		Checked []string             `json:"checked_ids"`
		Issues  []segmentReviewIssue `json:"issues"`
	}
	valid := func() bool {
		if result.Checked == nil || result.Issues == nil || len(result.Checked) != len(expected) {
			return false
		}
		seen := map[string]bool{}
		for _, id := range result.Checked {
			if _, ok := expected[id]; !ok || seen[id] {
				return false
			}
			seen[id] = true
		}
		for _, issue := range result.Issues {
			units, ok := expected[issue.ID]
			if !ok || len(issue.SegmentIDs) == 0 || strings.TrimSpace(issue.Reason) == "" {
				return false
			}
			for _, id := range issue.SegmentIDs {
				if !units[id] {
					return false
				}
			}
		}
		return true
	}
	ok := false
	for attempt := 0; attempt < 2 && !ok; attempt++ {
		var err error
		ok, err = t.semanticJSON(ctx, "translation_segment_review", segmentReviewPrompt, payload, "checked_ids", &result, valid)
		if err != nil {
			return err
		}
	}
	if !ok {
		return segmentValidationFailure("意群独立审查未完成，候选已保存，不能作为合格字幕输出")
	}
	issues := map[string]segmentReviewIssue{}
	for _, issue := range result.Issues {
		// A model may report the two audit dimensions as separate issues.
		// Keep every evidenced defect instead of retrying or overwriting one.
		if previous, exists := issues[issue.ID]; exists {
			for _, id := range previous.SegmentIDs {
				if !slices.Contains(issue.SegmentIDs, id) {
					issue.SegmentIDs = append(issue.SegmentIDs, id)
				}
			}
			issue.Reason = previous.Reason + "; " + issue.Reason
		}
		issues[issue.ID] = issue
	}
	for _, original := range pending {
		sentence := cloneSegmentedSentence(original)
		sentence.SegmentState.Stage = "reviewed"
		sentence.SegmentState.Issue = ""
		if issue, exists := issues[sentence.ID]; exists {
			sentence.SegmentState.Stage = "repair"
			sentence.SegmentState.Issue = strings.Join(issue.SegmentIDs, ",") + ": " + issue.Reason
			sentence.SegmentState.BoundaryIssue = sentence.SegmentState.Issue
			prepareSegmentReviewRepair(&sentence, result.Issues, targetLang)
		}
		sentence = materializeSegmentedSentence(sentence, targetLang)
		parents[sentence.ID] = sentence
		if err := save(sentence, sentence.SemanticReviewed && !sentence.LayoutFallback); err != nil {
			return err
		}
	}
	return nil
}
func (t *Translator) completeSegmentedBatch(ctx context.Context, input pairedTranslationInput, parents map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	if parents == nil {
		parents = map[string]pairedSentence{}
		for _, source := range input.Sentences {
			sentence, err := sourceSegmentedSentence(source, originLang)
			if err != nil {
				return err
			}
			parents[source.ID] = sentence
		}
	}
	if len(parents) == 0 {
		return nil
	}
	if err := t.generateSegmentTranslations(ctx, input, parents, true, originLang, targetLang, save); err != nil {
		return err
	}
	if err := t.generateSegmentTranslations(ctx, input, parents, false, originLang, targetLang, save); err != nil {
		return err
	}
	// 在最终独立审查前完成超长重拆；审查完整父句的最终配对一次即可，
	// 避免先审核即将废弃的超长布局、重拆后再审核同一父句。
	if err := t.splitSegmentOverflows(ctx, input, parents, originLang, targetLang, save); err != nil {
		return err
	}
	// 审查失败回表达阶段；不再进入旧完整修订、冻结排版和排版审查链。
	for round := 0; round < 3; round++ {
		if err := t.generateSegmentTranslations(ctx, input, parents, false, originLang, targetLang, save); err != nil {
			return err
		}
		if err := t.reviewSegmentTranslations(ctx, input, parents, targetLang, save); err != nil {
			return err
		}
		if len(selectedSegmentParents(input, parents, "repair")) == 0 {
			break
		}
	}
	if failed := selectedSegmentParents(input, parents, "repair"); len(failed) > 0 {
		return segmentValidationFailure("句子%s独立审查仍未通过：%s；进度已保存", failed[0].ID, failed[0].SegmentState.Issue)
	}
	if err := t.splitSegmentOverflows(ctx, input, parents, originLang, targetLang, save); err != nil {
		return err
	}
	for _, sentence := range selectedSegmentParents(input, parents, "reviewed") {
		if err := pairedFinalLengthIssue(sentence); err != nil {
			return err
		}
		sentence.LayoutTarget = input.MaxTargetChars
		if err := save(sentence, true); err != nil {
			return err
		}
	}
	return nil
}
