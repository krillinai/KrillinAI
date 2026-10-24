package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"slices"
	"strings"
)

// 普通排版仍使用配置的软目标；最终逐条检查原译双方的上限。
const subtitleFinalDisplayLimit = 75

//go:embed subtitle_length_split_prompt.txt
var subtitleLengthSplitPrompt string

// 纯切分只发送当前配对及程序实测长度，不发送父句、术语、NLP或全文语境。
type subtitleLengthSplitInput struct {
	Source             string `json:"source"`
	Target             string `json:"target"`
	SourceDisplayUnits int    `json:"source_display_units"`
	TargetDisplayUnits int    `json:"target_display_units"`
	MaxDisplayUnits    int    `json:"max_display_units"`
	PreviousIssue      string `json:"previous_issue,omitempty"`
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

// 只比较已经通过内容和意群核验的布局；优先缩短最长条，再减少总超长量。
func betterPairedLayout(candidate, previous pairedSentence) bool {
	score := func(sentence pairedSentence) (longest, overflow int) {
		for _, segments := range [][]string{sentence.Source, sentence.Target} {
			for _, text := range segments {
				width := subtitleTargetLength(text)
				longest = max(longest, width)
				overflow += max(0, width-subtitleFinalDisplayLimit)
			}
		}
		return
	}
	cl, co := score(candidate)
	pl, po := score(previous)
	return cl < pl || cl == pl && co < po
}

// 已合格的配对不再发送。切分失败保留译文和待调整状态，不阻断整片导出。
func (t *Translator) splitLongPairedSubtitles(ctx context.Context, input pairedTranslationInput, sentences map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	for _, source := range input.Sentences {
		if err := ctx.Err(); err != nil {
			return err
		}
		original, exists := sentences[source.ID]
		if !exists {
			continue
		}
		if len(original.Source) == 0 || len(original.Source) != len(original.Target) || !subtitleSegmentsPreserveText(original.FullSource, original.Source) || !subtitleSegmentsPreserveText(original.FullTarget, original.Target) {
			return fmt.Errorf("句子%s缺少可恢复的完整配对", source.ID)
		}
		if pairedFinalLengthIssue(original) == nil {
			original.LayoutFallback = false
			sentences[source.ID] = original
			if err := save(original, true); err != nil {
				return err
			}
			continue
		}
		original.LayoutFallback = true
		if err := save(original, false); err != nil {
			return err
		}
		updated, err := t.repairLongPairedSubtitle(ctx, input, original, source, originLang, targetLang)
		if err != nil {
			return err
		}
		if updated.LayoutFallback {
			t.translationNotice(fmt.Sprintf("第%s句字幕切分重试已耗尽，已保留原译和原分段或已成功切短的配对继续生成字幕，超长部分仍待调整", source.ID))
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		sentences[source.ID] = updated
		if err := save(updated, true); err != nil {
			return err
		}
	}
	return ctx.Err()
}

func (t *Translator) repairLongPairedSubtitle(ctx context.Context, input pairedTranslationInput, original pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) (pairedSentence, error) {
	updated := original
	updated.Source, updated.Target = nil, nil
	for i, text := range original.Source {
		if err := ctx.Err(); err != nil {
			return pairedSentence{}, err
		}
		if subtitleTargetLength(text) <= subtitleFinalDisplayLimit && subtitleTargetLength(original.Target[i]) <= subtitleFinalDisplayLimit {
			updated.Source = append(updated.Source, text)
			updated.Target = append(updated.Target, original.Target[i])
			continue
		}
		local := pairedTranslationSource{ID: source.ID, Text: text, TargetText: original.Target[i]}
		parts, err := t.splitLongPairedSegment(ctx, input, original, local, originLang, targetLang)
		if err != nil {
			return pairedSentence{}, err
		}
		updated.Source = append(updated.Source, parts.Source...)
		updated.Target = append(updated.Target, parts.Target...)
		// 新切口仅通过程序校验，不能冒充完成独立模型边界审校。
		if len(parts.Source) > 1 {
			updated.LayoutReviewed = false
		}
	}
	// 全文始终保留原值，切分不能悄悄改写或补译。
	if !subtitleSegmentsPreserveText(original.FullSource, updated.Source) || !subtitleSegmentsPreserveText(original.FullTarget, updated.Target) {
		return pairedSentence{}, fmt.Errorf("句子%s切分未保持完整原译", source.ID)
	}
	updated.LayoutVersion, updated.LayoutTarget = pairedLayoutVersion, input.MaxTargetChars
	updated.LayoutFallback = pairedFinalLengthIssue(updated) != nil
	return updated, nil
}

func (t *Translator) splitLongPairedSegment(ctx context.Context, input pairedTranslationInput, parent pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) (pairedSentence, error) {
	current := pairedSentence{ID: source.ID, FullSource: source.Text, FullTarget: source.TargetText, Source: []string{source.Text}, Target: []string{source.TargetText}, SemanticReviewed: parent.SemanticReviewed}
	issues := map[string]string{}
	for attempt := 0; attempt < 3; attempt++ {
		next := current
		next.Source, next.Target = nil, nil
		for i, text := range current.Source {
			target := current.Target[i]
			if subtitleTargetLength(text) <= subtitleFinalDisplayLimit && subtitleTargetLength(target) <= subtitleFinalDisplayLimit {
				next.Source = append(next.Source, text)
				next.Target = append(next.Target, target)
				continue
			}
			if err := ctx.Err(); err != nil {
				return pairedSentence{}, err
			}
			key := text + "\x00" + target
			issue := issues[key]
			if issue != "" {
				issue = fmt.Sprintf("Attempt %d: %s", attempt+1, issue)
			}
			request := subtitleLengthSplitInput{Source: text, Target: target, SourceDisplayUnits: subtitleTargetLength(text), TargetDisplayUnits: subtitleTargetLength(target), MaxDisplayUnits: subtitleFinalDisplayLimit, PreviousIssue: issue}
			payload, _ := json.Marshal(request)
			prompt := "Task: translation_length_split\n" + subtitleLengthSplitPrompt + "\nInput JSON:\n" + string(payload)
			if len(prompt) > translationRequestBytes {
				issues[key] = "The pair exceeds the request budget."
				next.Source = append(next.Source, text)
				next.Target = append(next.Target, target)
				continue
			}
			response, err := t.requestTranslation(ctx, prompt, min(8192, max(1024, pairedTranslationResponseBudget(text, subtitleFinalDisplayLimit))))
			if err != nil {
				if ctx.Err() != nil {
					return pairedSentence{}, ctx.Err()
				}
				// 服务错误不做内容重试，保留本轮及此前已成功切短的片段。
				next.Source = append(next.Source, current.Source[i:]...)
				next.Target = append(next.Target, current.Target[i:]...)
				next.LayoutFallback = pairedFinalLengthIssue(next) != nil
				return next, nil
			}
			if err := ctx.Err(); err != nil {
				return pairedSentence{}, err
			}
			parts, err := parseFrozenSubtitleSplit(response, text, target, originLang)
			if err == nil && !betterPairedLayout(parts, pairedSentence{Source: []string{text}, Target: []string{target}}) {
				err = fmt.Errorf("No length improvement: source=%d, target=%d, maximum=%d. Split the overlong pair further.", subtitleTargetLength(text), subtitleTargetLength(target), subtitleFinalDisplayLimit)
			}
			if err != nil {
				issues[key] = subtitleTextPreview(err.Error(), 600)
				next.Source = append(next.Source, text)
				next.Target = append(next.Target, target)
				continue
			}
			next.Source = append(next.Source, parts.Source...)
			next.Target = append(next.Target, parts.Target...)
			for j, part := range parts.Source {
				if subtitleTargetLength(part) > subtitleFinalDisplayLimit || subtitleTargetLength(parts.Target[j]) > subtitleFinalDisplayLimit {
					issues[part+"\x00"+parts.Target[j]] = fmt.Sprintf("Still over the limit: source=%d, target=%d, maximum=%d. Split only this pair into shorter corresponding groups.", subtitleTargetLength(part), subtitleTargetLength(parts.Target[j]), subtitleFinalDisplayLimit)
				}
			}
		}
		current = next
		if pairedFinalLengthIssue(current) == nil {
			return current, nil
		}
	}
	current.LayoutFallback = pairedFinalLengthIssue(current) != nil
	return current, nil
}

func parseFrozenSubtitleSplit(response, source, target string, originLang types.StandardLanguageCode) (pairedSentence, error) {
	var output struct {
		Segments []pairedTranslationSegment `json:"segments"`
	}
	if err := json.Unmarshal([]byte(util.ExtractJSONObject(response, "segments")), &output); err != nil {
		return pairedSentence{}, fmt.Errorf("Invalid JSON; return a segments array only.")
	}
	if len(output.Segments) < 2 {
		return pairedSentence{}, fmt.Errorf("Return at least two corresponding source/target segments; the input is still too long.")
	}
	candidate := pairedSentence{FullSource: source, FullTarget: target}
	for _, pair := range output.Segments {
		if !hasSubtitleContent(pair.Source) || !hasSubtitleContent(pair.Target) || hasSubtitleLineBreak(pair.Source) || hasSubtitleLineBreak(pair.Target) {
			return pairedSentence{}, fmt.Errorf("Every segment needs nonempty source and target text on one line.")
		}
		candidate.Source = append(candidate.Source, strings.TrimSpace(pair.Source))
		candidate.Target = append(candidate.Target, strings.TrimSpace(pair.Target))
	}
	if !subtitleSegmentsPreserveText(source, candidate.Source) {
		return pairedSentence{}, fmt.Errorf("Source text was changed, omitted, repeated or reordered. Insert boundaries only.")
	}
	if !subtitleSegmentsPreserveText(target, candidate.Target) {
		return pairedSentence{}, fmt.Errorf("Target text was changed, omitted, repeated or reordered. Insert boundaries only; keep the existing translation exactly.")
	}
	if !validTranslationSentencePartsWithLimit(source, candidate.Source, originLang, len(candidate.Source)) || !subtitleSegmentsHaveSafeBoundaries(candidate.Target) {
		return pairedSentence{}, fmt.Errorf("A boundary splits a word, name, protected span or grapheme. Move that boundary.")
	}
	for i := 0; i+1 < len(candidate.Source); i++ {
		if subtitleBoundaryLeavesComplement(candidate.Source[i]) || subtitleBoundaryLeavesComplement(candidate.Target[i]) {
			return pairedSentence{}, fmt.Errorf("Segment %d ends with an incomplete complement. Move that boundary.", i+1)
		}
	}
	return candidate, nil
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
	ok, err := t.semanticJSON(ctx, "translation_length_boundary_review", "长度由程序单独检查并继续优化；不能仅因片段超过显示上限，就否决内容正确、逐段对应且切口自然的候选。逐段审查刚拆出的连续双语字幕，不改写、不返回修正。完整译文的词义与事实另有独立核验；本阶段专查实际切口、跨段错位和自然承接，不重新按字典偏好或文学风格判词。允许不改变角色/事实的名词动词转换、主被动转换、补出目标语承接词和同义表达；不能仅因句法形式与原文不同而判对应错误。仍须拒绝把作者、对象、时间、条件等实际内容放到错误的原文片段。检查每对source_segments/target_segments是否表达对应内容，切口是否为自然意群，整组连读是否通顺。完整父句与适用术语供理解，原文仍为准。判断译词自身的完整含义：词义中隐含的角色不等于借用了邻段的同名成分，必须结合该源词及术语释义核对，不能按字面出现位置判定。字幕是连续播放的，一个完整从句、目的/条件/原因意群可单独显示，不要求每条独立成句；不能仅因后一条以连接词或条件词开头而判错。长度合格不代表切分合格：拒绝修饰语与中心词、主谓、动宾、介宾、助动词、固定表达、专名或并列数量短语的内部断裂；拒绝悬空短尾、病句、语序冲突或逐段错配。主句与完整状语从句之间的切口不等于拆开主谓/动宾，必须据具体语法判断。例如‘让我先谈谈把阅读视为 / 完成一本书的行为这一概念’、‘都摆满了 / 部分完成的书’、‘a / large collection’均不合格；独立回答可以短。完整后置修饰短语可以承接上一条的中心词独立显示，只要短语内部完整且目标语承接自然。例如“a collection of paintings / from different eras”可以对应“一批画作，/ 来自不同时代。”，这不是“a / large collection”式内部断裂；不能因自然译法使用动词承接就判作增义。但不能移借别段内容，作者、主题等并列信息仍须逐对核对。不能仅因完整全文含义正确就放过逐段错配。存在问题或无法确认时返回false，并指出具体切口或配对；全部通过才返回true。仅输出JSON：{\"acceptable\":true或false,\"reason\":\"具体理由\"}。", payload, "acceptable", &result, func() bool { return result.Acceptable != nil && strings.TrimSpace(result.Reason) != "" })
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
