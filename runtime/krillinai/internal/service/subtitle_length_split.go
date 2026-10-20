package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
)

// 生成时仍使用配置的软目标；译后逐条检查的上限独立于软目标。
const subtitleFinalDisplayLimit = 75

var errFinalLayoutExhausted = errors.New("单行排版重试耗尽")

//go:embed subtitle_length_split_prompt.txt
var subtitleLengthSplitPrompt string

type subtitleLengthSplitInput struct {
	pairedTranslationInput
	ParentSource        string                 `json:"parent_source_text"`
	ParentTarget        string                 `json:"parent_target_text"`
	ParentNLPHints      []string               `json:"parent_nlp_segments_hint,omitempty"`
	OriginalTarget      string                 `json:"original_target_text"`
	DisplayTarget       int                    `json:"display_target"`
	MaxDisplayUnits     int                    `json:"max_display_units"`
	MinSegments         int                    `json:"minimum_segments"`
	AllowTargetRewrite  bool                   `json:"allow_target_rewrite"`
	PreviousIssue       string                 `json:"previous_issue,omitempty"`
	MeasuredSourceHints []subtitleMeasuredSpan `json:"measured_source_hints,omitempty"`
}

type subtitleMeasuredSpan struct {
	Text         string `json:"text"`
	DisplayUnits int    `json:"display_units"`
}

// 只提供可验证的宽度参考，切口仍由模型按两种语言的意群决定。
func measuredSubtitleSourceHints(text string, target int) []subtitleMeasuredSpan {
	parts, _ := splitSubtitleSourceHint(text, min(target, subtitleFinalDisplayLimit))
	var hints []subtitleMeasuredSpan
	for _, part := range parts {
		hints = append(hints, subtitleMeasuredSpan{part, subtitleTargetLength(part)})
	}
	return hints
}

// 旧译文只出现一次的实质片段，局部修复不能在父句内生成两份。
// 保留本来就有的强调重复，不依赖特定语言、词表或模型判断。
func newPairedTargetRepetition(original string, targets []string) bool {
	counts := make(map[string]int)
	for _, target := range targets {
		key := compactSubtitleText(strings.TrimSpace(target))
		if subtitleTargetLength(key) < 12 {
			continue
		}
		counts[key]++
		if counts[key] > max(1, strings.Count(compactSubtitleText(original), key)) {
			return true
		}
	}
	return false
}

func pairedFinalLengthIssue(sentence pairedSentence) error {
	if len(sentence.Source) == 0 || len(sentence.Source) != len(sentence.Target) {
		return fmt.Errorf("句子%s原译段数不一致或缺少字幕", sentence.ID)
	}
	for i := range sentence.Source {
		source, target := subtitleTargetLength(sentence.Source[i]), subtitleTargetLength(sentence.Target[i])
		if source > subtitleFinalDisplayLimit || target > subtitleFinalDisplayLimit {
			return fmt.Errorf("句子%s第%d段超过单行上限%d：原文%d、译文%d显示单位", sentence.ID, i+1, subtitleFinalDisplayLimit, source, target)
		}
	}
	return nil
}

// 只处理超长配对；既有父句、上下文、NLP建议和其余合格配对保持不变。
func (t *Translator) splitLongPairedSubtitles(ctx context.Context, input pairedTranslationInput, sentences map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	if err := t.batchLongPairedSubtitles(ctx, input, sentences, originLang, targetLang, save); err != nil {
		return err
	}
	for _, source := range input.Sentences {
		original, exists := sentences[source.ID]
		if !exists {
			continue
		}
		if len(original.Source) == 0 || len(original.Source) != len(original.Target) || !subtitleSegmentsPreserveText(original.FullTarget, original.Target) {
			return fmt.Errorf("句子%s缺少可恢复的完整配对", source.ID)
		}
		if pairedFinalLengthIssue(original) == nil {
			if err := save(original, true); err != nil {
				return err
			}
			continue
		}
		// 超长内容仅保存为待排版进度，不将回退的整句当作最终字幕交付。
		wasReviewed := original.LayoutReviewed
		original.LayoutFallback = true
		if err := save(original, false); err != nil {
			return err
		}
		updated := original
		updated.LayoutReviewed = true
		updated.Source, updated.Target = nil, nil
		targetChunks := subtitleExactChunks(original.FullTarget, original.Target)
		for i, text := range original.Source {
			if subtitleTargetLength(text) <= subtitleFinalDisplayLimit && subtitleTargetLength(original.Target[i]) <= subtitleFinalDisplayLimit {
				updated.Source = append(updated.Source, text)
				updated.Target = append(updated.Target, original.Target[i])
				updated.LayoutReviewed = updated.LayoutReviewed && wasReviewed
				continue
			}
			local := source
			local.Text, local.TargetText, local.SourceHint, local.NLPSourceHint = text, original.Target[i], nil, nil
			parts, err := t.splitLongPairedSegment(ctx, input, original, local, originLang, targetLang)
			if err != nil {
				if !errors.Is(err, errFinalLayoutExhausted) || len(original.Source) < 2 {
					return err
				}
				// 译文中心词可能跨越已有配对。局部无法修复时回到完整父句，
				// 允许重组全部译文，再独立核验全部信息与每道边界。
				whole := source
				whole.Text, whole.TargetText = original.FullSource, original.FullTarget
				whole.SourceHint, whole.NLPSourceHint = nil, original.NLPSourceHint
				parts, err = t.splitLongPairedSegment(ctx, input, original, whole, originLang, targetLang, true)
				if err != nil {
					return err
				}
				updated = parts
				updated.DraftTarget, updated.RevisionVersion = original.DraftTarget, original.RevisionVersion
				targetChunks = []string{parts.FullTarget}
				break
			}
			updated.Source = append(updated.Source, parts.Source...)
			updated.Target = append(updated.Target, parts.Target...)
			updated.LayoutReviewed = updated.LayoutReviewed && parts.LayoutReviewed
			if parts.FullTarget != original.Target[i] {
				// 原有段间空白从完整译文取回，不重写其他合格片段。
				suffix := targetChunks[i][len(strings.TrimSpace(original.Target[i])):]
				targetChunks[i] = parts.FullTarget + suffix
			}
		}
		updated.FullTarget = strings.TrimSpace(strings.Join(targetChunks, ""))
		updated.LayoutFallback = false
		updated.LayoutVersion, updated.LayoutTarget = pairedLayoutVersion, input.MaxTargetChars
		if !subtitleSegmentsPreserveText(updated.FullSource, updated.Source) || !subtitleSegmentsPreserveText(updated.FullTarget, updated.Target) {
			return fmt.Errorf("句子%s超长分段未保持完整原译，已保存原译进度", source.ID)
		}
		if err := pairedFinalLengthIssue(updated); err != nil {
			return err
		}
		sentences[source.ID] = updated
		if err := save(updated, true); err != nil {
			return err
		}
	}
	return nil
}

func (t *Translator) splitLongPairedSegment(ctx context.Context, input pairedTranslationInput, parent pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode, rewriteFromStart ...bool) (pairedSentence, error) {
	layout := input
	layout.PreserveFinalBoundaries = true
	layout.MaxSourceChars, layout.MaxTargetChars, layout.MaxFullwidthChars = subtitleFinalDisplayLimit, subtitleFinalDisplayLimit, subtitleFinalDisplayLimit/2
	layout.Sentences = []pairedTranslationSource{source}
	issue := fmt.Sprintf("原文%d、译文%d显示单位；超过%d必须继续拆分", subtitleTargetLength(source.Text), subtitleTargetLength(source.TargetText), subtitleFinalDisplayLimit)
	for attempt := 0; attempt < 3; attempt++ {
		if err := ctx.Err(); err != nil {
			return pairedSentence{}, err
		}
		// 局部冻结与改写均已失败，父句恢复直接允许重组，不重复
		// 已证明无法保持逐段对应的冻结尝试；仍使用同样三次预算和全部核验。
		allowRewrite := attempt > 0 || len(rewriteFromStart) > 0 && rewriteFromStart[0]
		local := layout
		local.Sentences = append([]pairedTranslationSource(nil), layout.Sentences...)
		if allowRewrite {
			local.Sentences[0].TargetText = ""
		}
		request := subtitleLengthSplitInput{
			pairedTranslationInput: local, ParentSource: parent.FullSource, ParentTarget: parent.FullTarget, ParentNLPHints: parent.NLPSourceHint,
			OriginalTarget: source.TargetText, DisplayTarget: min(input.MaxTargetChars, subtitleFinalDisplayLimit),
			MaxDisplayUnits: subtitleFinalDisplayLimit, AllowTargetRewrite: allowRewrite, PreviousIssue: issue,
			MinSegments:         max(2, (max(subtitleTargetLength(source.Text), subtitleTargetLength(source.TargetText))+subtitleFinalDisplayLimit-1)/subtitleFinalDisplayLimit),
			MeasuredSourceHints: measuredSubtitleSourceHints(source.Text, input.MaxTargetChars),
		}
		payload, _ := json.Marshal(request)
		mode := subtitleLengthSplitMode(allowRewrite)
		prompt := "任务：translation_length_split\n" + mode + subtitleLengthSplitPrompt + "\n输入 JSON：\n" + string(payload)
		if len(prompt) > translationRequestBytes {
			return pairedSentence{}, fmt.Errorf("句子%s超长字幕重排超过请求预算，完整译文已保存", source.ID)
		}
		response, err := t.requestTranslation(ctx, prompt, min(8192, max(2048, pairedTranslationResponseBudget(source.Text, subtitleFinalDisplayLimit)+1024)))
		if err != nil {
			return pairedSentence{}, fmt.Errorf("句子%s单行排版未完成，完整译文已保存：%w", source.ID, err)
		}
		response = normalizeLengthSplitResponse(response, source, targetLang, allowRewrite)
		parts, err := t.parsePairedTranslation(response, local, originLang, targetLang)
		if err == nil {
			var targets []string
			if source.Text == parent.FullSource {
				targets = parts[0].Target
			} else {
				for i, text := range parent.Source {
					if text == source.Text {
						targets = append(targets, parts[0].Target...)
					} else {
						targets = append(targets, parent.Target[i])
					}
				}
			}
			if newPairedTargetRepetition(parent.FullTarget, targets) {
				err = fmt.Errorf("局部修复在父句内新增重复译文，需回到完整父句调整配对")
			}
		}
		if err == nil {
			err = pairedFinalLengthIssue(parts[0])
		}
		if err == nil && len(parts[0].Source) > 1 && !validTranslationSentencePartsWithLimit(source.Text, parts[0].Source, originLang, len(parts[0].Source)) {
			err = fmt.Errorf("原文切口拆开单词、专名或受保护文字，请在自然意群边界重新拆分")
		}
		if err == nil && sourceTranslationChanged(source, parts[0].FullTarget) {
			if !allowRewrite {
				err = fmt.Errorf("只允许插入边界，不允许改写完整译文")
			} else {
				ok, reason, reviewErr := t.reviewLengthRewrite(ctx, input, parent, source, parts[0].FullTarget, targetLang)
				if reviewErr != nil {
					return pairedSentence{}, reviewErr
				}
				if !ok {
					err = fmt.Errorf("局部改写未通过语义或术语保持复核：%s", reason)
				}
			}
		}
		if err == nil {
			parts[0].SemanticReviewed = parent.SemanticReviewed
			if !sourceTranslationChanged(source, parts[0].FullTarget) {
				parts[0].FullTarget = source.TargetText
			}
			// 新增切口只做检查，不允许审校重新合并为超长字幕或改动其他配对。
			ok, reason, reviewErr := t.reviewLengthBoundaries(ctx, local, parent, parts[0])
			if reviewErr != nil {
				return pairedSentence{}, reviewErr
			}
			if ok {
				parts[0].LayoutReviewed = true
				return parts[0], nil
			}
			err = fmt.Errorf("新增切口未通过意群与逐段对应检查：%s", reason)
		}
		issue = subtitleTextPreview(err.Error(), 2500)
	}
	return pairedSentence{}, fmt.Errorf("%w：句子%s经过3次拆分仍未满足%d单行上限，完整译文已保存，可恢复排版：%s", errFinalLayoutExhausted, source.ID, subtitleFinalDisplayLimit, issue)
}

func subtitleLengthSplitMode(allowRewrite bool) string {
	if !allowRewrite {
		return "FROZEN MODE: target segments must be consecutive slices of original_target_text, in order. Do not return target_text.\n"
	}
	return "REWRITE MODE: frozen alignment failed. Re-express the complete meaning in natural target language suitable for successive corresponding cues. The old translation is reference, not fixed wording/order. Return segments only; the program constructs one full candidate and independently checks meaning and boundaries. Keep shared heads with their matching source group, not stranded after long lists. Use natural transitions or forward references, never literal source syntax. Recognize genuine source speech repairs and interrupted starts without inventing new content. Cues may be complete groups of one continuing sentence; preserve every detail and make the whole target read naturally, with appropriate punctuation. For a trailing condition, use an idiomatic continuation: ‘It will be easier / if you practice every day.’ can be ‘这样会更容易， / 如果每天练习的话。’. This is an example only; use the actual target language's syntax. Both sides must stay within max_display_units, with at least minimum_segments. Resolve previous_issue.\n"
}

// 排版只返回segments这一份候选。冻结模式从既有全文校验覆盖，
// 改写模式从片段形成唯一候选后仍须独立对照原文核验全部含义。
func normalizeLengthSplitResponse(response string, source pairedTranslationSource, targetLang types.StandardLanguageCode, allowRewrite bool) string {
	var output pairedTranslationOutput
	if json.Unmarshal([]byte(util.ExtractJSONObject(response, "sentences")), &output) != nil || len(output.Sentences) != 1 || output.Sentences[0].ID != source.ID {
		return response
	}
	item := &output.Sentences[0]
	if allowRewrite {
		var targets []string
		for _, pair := range item.Segments {
			if !hasSubtitleContent(pair.Target) || hasSubtitleLineBreak(pair.Target) {
				return response
			}
			targets = append(targets, pair.Target)
		}
		if len(targets) < 2 {
			return response
		}
		item.FullTarget = joinPairedTargetSegments(targets, targetLang)
	} else {
		if item.FullTarget == "" {
			item.FullTarget = source.TargetText
		}
		if item.FullTarget == source.TargetText {
			*item, _ = restorePairedTargetBoundaryPunctuation(*item)
		}
	}
	data, _ := json.Marshal(output)
	return string(data)
}

func (t *Translator) reviewLengthBoundaries(ctx context.Context, input pairedTranslationInput, parent, candidate pairedSentence) (bool, string, error) {
	var result struct {
		Acceptable *bool  `json:"acceptable"`
		Reason     string `json:"reason"`
	}
	var terms []translationSemanticTerm
	if input.SemanticContext != nil {
		for _, term := range input.SemanticContext.Terms {
			if slices.Contains(term.SentenceIDs, parent.ID) {
				terms = append(terms, term)
			}
		}
	}
	payload := struct {
		SourceLanguage string                    `json:"source_language"`
		TargetLanguage string                    `json:"target_language"`
		ParentSource   string                    `json:"parent_source_text"`
		ParentTarget   string                    `json:"parent_target_text"`
		Terms          []translationSemanticTerm `json:"terms,omitempty"`
		Candidate      pairedSentence            `json:"candidate"`
	}{input.SourceLanguage, input.TargetLanguage, parent.FullSource, parent.FullTarget, terms, candidate}
	ok, err := t.semanticJSON(ctx, "translation_length_boundary_review", "逐段审查刚拆出的连续双语字幕，不改写、不返回修正。完整译文的词义与事实另有独立核验；本阶段专查实际切口、跨段错位和自然承接，不重新按字典偏好或文学风格判词。允许不改变角色/事实的名词动词转换、主被动转换、补出目标语承接词和同义表达；不能仅因句法形式与原文不同而判对应错误。仍须拒绝把作者、对象、时间、条件等实际内容放到错误的原文片段。检查每对source_segments/target_segments是否表达对应内容，切口是否为自然意群，整组连读是否通顺。完整父句与适用术语供理解，原文仍为准。判断译词自身的完整含义：词义中隐含的角色不等于借用了邻段的同名成分，必须结合该源词及术语释义核对，不能按字面出现位置判定。字幕是连续播放的，一个完整从句、目的/条件/原因意群可单独显示，不要求每条独立成句；不能仅因后一条以连接词或条件词开头而判错。长度合格不代表切分合格：拒绝修饰语与中心词、主谓、动宾、介宾、助动词、固定表达、专名或并列数量短语的内部断裂；拒绝悬空短尾、病句、语序冲突或逐段错配。主句与完整状语从句之间的切口不等于拆开主谓/动宾，必须据具体语法判断。例如‘让我先谈谈把阅读视为 / 完成一本书的行为这一概念’、‘都摆满了 / 部分完成的书’、‘a / large collection’均不合格；独立回答可以短。完整后置修饰短语可以承接上一条的中心词独立显示，只要短语内部完整且目标语承接自然。例如“a collection of paintings / from different eras”可以对应“一批画作，/ 来自不同时代。”，这不是“a / large collection”式内部断裂；不能因自然译法使用动词承接就判作增义。但不能移借别段内容，作者、主题等并列信息仍须逐对核对。不能仅因完整全文含义正确就放过逐段错配。存在问题或无法确认时返回false，并指出具体切口或配对；全部通过才返回true。仅输出JSON：{\"acceptable\":true或false,\"reason\":\"具体理由\"}。", payload, "acceptable", &result, func() bool { return result.Acceptable != nil && strings.TrimSpace(result.Reason) != "" })
	if !ok && result.Reason == "" {
		result.Reason = "新增边界审查暂未完成"
	}
	return ok && result.Acceptable != nil && *result.Acceptable, result.Reason, err
}

func (t *Translator) reviewLengthRewrite(ctx context.Context, input pairedTranslationInput, parent pairedSentence, source pairedTranslationSource, target string, targetLang types.StandardLanguageCode) (bool, string, error) {
	if input.SemanticContext != nil {
		for _, term := range input.SemanticContext.Terms {
			if slices.Contains(term.SentenceIDs, source.ID) && translationContainsTerm(source.TargetText, term.Target, targetLang) && !translationContainsTerm(target, term.Target, targetLang) {
				return false, "不能丢失已确认术语：" + term.Target, nil
			}
		}
	}
	var result struct {
		Equivalent *bool  `json:"equivalent"`
		Reason     string `json:"reason"`
	}
	resultTarget := target
	if source.Text != parent.FullSource {
		chunks := subtitleExactChunks(parent.FullTarget, parent.Target)
		for i, text := range parent.Source {
			if text == source.Text && parent.Target[i] == source.TargetText {
				suffix := chunks[i][len(strings.TrimSpace(parent.Target[i])):]
				chunks[i] = target + suffix
				break
			}
		}
		resultTarget = strings.TrimSpace(strings.Join(chunks, ""))
	}
	payload := struct {
		SourceLanguage  string                           `json:"source_language"`
		TargetLanguage  string                           `json:"target_language"`
		Source          string                           `json:"source_text"`
		Original        string                           `json:"original_target_text"`
		Rewritten       string                           `json:"rewritten_target_text"`
		ParentSource    string                           `json:"parent_source_text"`
		ParentTarget    string                           `json:"parent_target_text"`
		ResultTarget    string                           `json:"resulting_parent_target_text"`
		SemanticContext *translationBatchSemanticContext `json:"semantic_context,omitempty"`
	}{input.SourceLanguage, input.TargetLanguage, source.Text, source.TargetText, target, parent.FullSource, parent.FullTarget, resultTarget, input.SemanticContext}
	ok, err := t.semanticJSON(ctx, "translation_length_rewrite_review", "只检查超长字幕改写是否忠实原文并保留已有译文的全部含义，原文为依据。必须同时将resulting_parent_target_text对照完整parent_source_text，检查与其他片段合并后是否重复补译、遗漏或破坏逻辑，不能仅因局部片段正确就通过。允许为连续双语配对调整语序和精简冗余表达；条件从句前置或后置本身不改变条件逻辑，必须核对实际条件、结果及限定是否保留，不能仅因语序变化拒绝。语法流畅及字幕切口另有独立审查，本次专门核验含义；禁止删减或改变事实、专名、数字、否定、可能性、条件、时间和因果，检查共享成分及术语。参考完整父句和语境。不能只因更短或更流畅就通过。有遗漏、增译、含义变化或无法确认时返回false。仅输出JSON：{\"equivalent\":true或false,\"reason\":\"具体理由\"}。", payload, "equivalent", &result, func() bool { return result.Equivalent != nil && strings.TrimSpace(result.Reason) != "" })
	if !ok && result.Reason == "" {
		result.Reason = "语义复核暂未完成"
	}
	return ok && result.Equivalent != nil && *result.Equivalent, result.Reason, err
}
