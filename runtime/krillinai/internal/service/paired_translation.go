package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"unicode"
	"unicode/utf8"

	"golang.org/x/sync/errgroup"
)

//go:embed paired_translation_prompt.txt
var pairedTranslationPrompt string

//go:embed paired_translation_retry.txt
var pairedTranslationRetry string

type pairedSentence struct {
	TranslationFallbackReason string                     `json:"translation_fallback_reason,omitempty"`
	OmittedHesitation         bool                       `json:"omitted_nonsemantic_hesitation,omitempty"`
	SegmentState              *segmentedTranslationState `json:"segment_translation,omitempty"`
	ID                        string                     `json:"sentence_id"`
	DraftTarget               string                     `json:"draft_target_text,omitempty"`
	RevisionVersion           string                     `json:"revision_version,omitempty"`
	FullSource                string                     `json:"source_text,omitempty"`
	FullTarget                string                     `json:"target_text"`
	NLPSourceHint             []string                   `json:"nlp_segments_hint,omitempty"`
	Target                    []string                   `json:"target_segments"`
	Source                    []string                   `json:"source_segments"`
	LayoutReviewed            bool                       `json:"layout_reviewed,omitempty"`
	LayoutVersion             int                        `json:"layout_version,omitempty"`
	LayoutTarget              int                        `json:"layout_target,omitempty"`
	LayoutFallback            bool                       `json:"layout_fallback,omitempty"`
	SemanticReviewed          bool                       `json:"semantic_reviewed,omitempty"`
}

type pairedTranslationOutput struct {
	Sentences []pairedTranslationOutputSentence `json:"sentences"`
}

type pairedTranslationOutputSentence struct {
	ID         string                     `json:"sentence_id"`
	FullTarget string                     `json:"target_text"`
	Segments   []pairedTranslationSegment `json:"segments"`
}

type pairedTranslationSegment struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

func flattenPairedSentences(sentences []pairedSentence) []*TranslatedItem {
	var items []*TranslatedItem
	for _, sentence := range sentences {
		for i, source := range sentence.Source {
			if sentence.OmittedHesitation || sentence.SegmentState != nil && sentence.Target[i] == "" {
				continue
			}
			items = append(items, &TranslatedItem{OriginText: strings.TrimSpace(source), TranslatedText: strings.TrimSpace(sentence.Target[i])})
		}
	}
	return items
}

type pairedTranslationInput struct {
	PreserveFinalBoundaries bool `json:"-"`
	// 最终重拆可暂存仅长度超标的候选，完整性与切口检查仍须执行。
	AllowLengthOverflow bool                             `json:"-"`
	SourceLanguage      string                           `json:"source_language"`
	TargetLanguage      string                           `json:"target_language"`
	MaxTargetChars      int                              `json:"max_target_display_units"`
	MaxSourceChars      int                              `json:"max_source_display_units"`
	MaxFullwidthChars   int                              `json:"max_fullwidth_chars"`
	Sentences           []pairedTranslationSource        `json:"sentences"`
	SemanticContext     *translationBatchSemanticContext `json:"semantic_context,omitempty"`
	Before              []string                         `json:"context_before,omitempty"`
	After               []string                         `json:"context_after,omitempty"`
}

type pairedTranslationSource struct {
	FailureReason string   `json:"-"`
	ID            string   `json:"sentence_id"`
	Text          string   `json:"text"`
	SourceHint    []string `json:"source_segments_hint,omitempty"`
	NLPSourceHint []string `json:"nlp_segments_hint,omitempty"`
	Before        []string `json:"context_before,omitempty"`
	After         []string `json:"context_after,omitempty"`
	TargetText    string   `json:"target_text,omitempty"`
}

const (
	translationSentenceBytes = 800
	translationRequestBytes  = 16000
	translationOutputBudget  = 6500 // 为 8192 token 响应留出 JSON 和纠错余量。
)

type budgetedChatCompleter interface {
	ChatCompletionContextWithMaxTokens(context.Context, string, int) (string, error)
}

func pairedTranslationResponseBudget(text string, limit int) int {
	return 4*len(text) + (3*subtitleTargetLength(text)/max(40, limit)+1)*48
}

func buildPairedTranslationBatches(texts []string, originLang, targetLang types.StandardLanguageCode, limit, batchSize int, plans ...*translationSemanticPlan) ([]pairedTranslationInput, error) {
	return buildPairedTranslationBatchesWithNLP(texts, nil, originLang, targetLang, limit, batchSize, plans...)
}

func buildPairedTranslationBatchesWithNLP(texts []string, hints [][]string, originLang, targetLang types.StandardLanguageCode, limit, batchSize int, plans ...*translationSemanticPlan) ([]pairedTranslationInput, error) {
	return buildPairedTranslationBatchesForMode(texts, hints, originLang, targetLang, limit, batchSize, false, plans...)
}

func buildPairedTranslationBatchesForMode(texts []string, hints [][]string, originLang, targetLang types.StandardLanguageCode, limit, batchSize int, semanticUnits bool, plans ...*translationSemanticPlan) ([]pairedTranslationInput, error) {
	if len(hints) != 0 && len(hints) != len(texts) {
		return nil, fmt.Errorf("NLP边界建议与完整句数量不一致")
	}
	for i, parts := range hints {
		if len(parts) == 0 || len(parts) == 1 && !subtitleSegmentsPreserveText(texts[i], parts) ||
			len(parts) > 1 && !validTranslationSentencePartsWithLimit(texts[i], parts, originLang, len(parts)) {
			return nil, fmt.Errorf("第%d句NLP边界建议未完整覆盖原文或边界不安全", i+1)
		}
	}
	var plan *translationSemanticPlan
	if len(plans) > 0 {
		plan = plans[0]
	}
	var batches []pairedTranslationInput
	if semanticUnits {
		batchSize = min(batchSize, 10)
	}
	contextFor := translationBatchContext
	if semanticUnits {
		contextFor = translationUnitBatchContext
	}
	for start := 0; start < len(texts); {
		input := pairedTranslationInput{
			SourceLanguage: types.GetStandardLanguageName(originLang), TargetLanguage: types.GetStandardLanguageName(targetLang),
			MaxSourceChars: limit, MaxTargetChars: limit, MaxFullwidthChars: limit / 2,
		}
		outputBudget := 0
		sourceChars := 0
		for i := start; i < min(len(texts), start+batchSize); i++ {
			chars := utf8.RuneCountInString(texts[i]) + 1
			if semanticUnits && i > start && sourceChars+chars > 600 {
				break
			}
			source := pairedTranslationSource{ID: strconv.Itoa(i + 1), Text: texts[i]}
			if len(hints) > 0 && len(hints[i]) > 1 {
				source.NLPSourceHint = hints[i]
			} else if subtitleTargetLength(source.Text) > limit {
				// 分段建议不是提交翻译的前置条件，极小长度设置也不能阻止翻译。
				source.SourceHint, _ = splitSubtitleSourceHint(source.Text, limit)
			}

			estimate := 2*len(texts[i]) + 128
			input.Sentences = append(input.Sentences, source)
			input.Before, input.After = contextFor(texts, start, i+1)
			input.SemanticContext = plan.forSources(input.Sentences)
			input = fitPairedTranslationSemanticContext(input)
			payload, err := json.Marshal(input)
			if err != nil {
				return nil, err
			}
			if len(payload)+len(translationContentPrompt)+2500 > translationRequestBytes || outputBudget+estimate > translationOutputBudget {
				input.Sentences = input.Sentences[:len(input.Sentences)-1]
				input.Before, input.After = contextFor(texts, start, i)
				input.SemanticContext = plan.forSources(input.Sentences)
				input = fitPairedTranslationSemanticContext(input)
				break
			}
			outputBudget += estimate
			sourceChars += chars
		}
		if len(input.Sentences) == 0 {
			return nil, fmt.Errorf("第%d句超过翻译请求预算，无法安全提交", start+1)
		}
		start += len(input.Sentences)
		batches = append(batches, input)
	}
	return batches, nil
}

func fitPairedTranslationSemanticContext(input pairedTranslationInput) pairedTranslationInput {
	fits := func() bool {
		payload, _ := json.Marshal(input)
		return len(payload)+len(translationContentPrompt)+2500 <= translationRequestBytes
	}
	if !fits() {
		input.SemanticContext = compactTranslationSemanticContext(input.SemanticContext)
	}
	if len(input.Sentences) == 1 && !fits() {
		// 额外语境不能让原本能提交的单句失败；译后仍使用完整计划审校术语。
		input.SemanticContext = nil
	}
	return input
}

// 原文和译文使用相同的单行显示目标。
func subtitleTargetLimit() int {
	limit := config.Conf.App.MaxSentenceLength
	if limit <= 0 {
		limit = 60
	}
	return limit
}

func compactSubtitleText(text string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, text)
}

func hasSubtitleContent(text string) bool {
	return strings.ContainsFunc(text, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsSymbol(r) })
}

func (t *Translator) translatePairedSentences(ctx context.Context, texts []string, originLang, targetLang types.StandardLanguageCode, limit, batchSize int, onBatch func([]pairedSentence, int, int) error, onProgress ...func(completed, total int)) ([]pairedSentence, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if limit < 1 || batchSize < 1 {
		return nil, fmt.Errorf("目标长度和批次大小必须大于0")
	}
	if (t.segmentTranslation || t.semanticSourceUnits) && t.nlpRuntime == nil {
		local := *t
		local.nlpRuntime = newTranslationNLPRuntime(ctx)
		defer local.nlpRuntime.close()
		t = &local
	}
	var err error
	var plan *translationSemanticPlan
	var hints [][]string
	if t.preparedTranslation != nil {
		texts, plan = t.preparedTranslation.Texts, t.preparedTranslation.Plan
		hints = t.preparedTranslation.NLPHints
	} else {
		if t.semanticSourceUnits {
			texts, err = t.prepareSemanticTranslationUnits(ctx, texts, originLang)
		} else {
			texts, err = t.prepareTranslationSentences(ctx, texts, originLang)
		}
		if err != nil {
			return nil, err
		}
		if !t.semanticSourceUnits {
			hints, err = t.prepareTranslationNLPHints(ctx, texts, originLang)
			if err != nil {
				return nil, err
			}
		}
		plan, err = t.prepareTranslationSemanticPlan(ctx, texts, originLang, targetLang)
		if err != nil {
			return nil, err
		}
	}
	inputs, err := buildPairedTranslationBatchesForMode(texts, hints, originLang, targetLang, limit, batchSize, t.semanticSourceUnits, plan)
	if err != nil {
		return nil, err
	}
	if t.segmentTranslation {
		inputs = segmentTranslationBatches(inputs, texts, plan)
	}
	for _, input := range inputs {
		if input.SemanticContext == nil && plan.forSources(input.Sentences) != nil {
			t.translationNotice("部分字幕的额外语境超出请求预算，已使用局部上下文翻译，并保留译后术语检查")
			break
		}
	}
	checkpoint, err := t.openTranslationCheckpoint(texts, originLang, targetLang, plan)
	if err != nil {
		return nil, err
	}
	var mu sync.Mutex
	resolved := make(map[string]pairedSentence)
	committed := 0
	committedInputs := 0
	report := func() {
		for _, callback := range onProgress {
			if callback != nil && len(texts) > 0 {
				callback(len(resolved), len(texts))
			}
		}
	}
	// 检查点独立于按顺序提交的旧回调，后面的成功句不会因前句出错而丢失。
	save := func(sentence pairedSentence, complete bool) error {
		mu.Lock()
		defer mu.Unlock()
		if err := checkpoint.save(sentence); err != nil {
			return err
		}
		if complete {
			if _, exists := resolved[sentence.ID]; !exists {
				resolved[sentence.ID] = sentence
				report()
			}
		}
		return nil
	}
	commit := func() error {
		mu.Lock()
		defer mu.Unlock()
		for committedInputs < len(inputs) {
			var batch []pairedSentence
			for _, source := range inputs[committedInputs].Sentences {
				sentence, exists := resolved[source.ID]
				if !exists {
					return nil
				}
				batch = append(batch, sentence)
			}
			committed += len(batch)
			committedInputs++
			if onBatch != nil {
				if err := onBatch(batch, committed, len(texts)); err != nil {
					return err
				}
			}
		}
		return nil
	}
	// 明确只有无语义犹豫音的父句由本地处理。保留源文证据，导出时
	// 消费原文位置但不创建空字幕；也不发送模型来编造非空译文。
	var translationInputs []pairedTranslationInput
	for _, input := range inputs {
		remaining := input
		remaining.Sentences = nil
		for _, source := range input.Sentences {
			if nonSemanticHesitationOnly(source.Text, originLang) {
				sentence := pairedSentence{ID: source.ID, FullSource: source.Text, Source: []string{source.Text}, Target: []string{""}, OmittedHesitation: true}
				if err := save(sentence, true); err != nil {
					return nil, err
				}
			} else {
				remaining.Sentences = append(remaining.Sentences, source)
			}
		}
		if len(remaining.Sentences) > 0 {
			translationInputs = append(translationInputs, remaining)
		}
	}
	if err := commit(); err != nil {
		return nil, err
	}
	if t.segmentTranslation {
		if err := t.runSegmentedInputs(ctx, translationInputs, checkpoint, originLang, targetLang, save, commit); err != nil {
			return nil, err
		}
		result := make([]pairedSentence, len(texts))
		for i := range result {
			result[i] = resolved[strconv.Itoa(i+1)]
		}
		return t.finishTranslationResult(ctx, result, checkpoint)
	}
	var pending []pairedTranslationInput
	for _, input := range translationInputs {
		remaining := input
		remaining.Sentences = nil
		recoveredSentences := make(map[string]pairedSentence)
		for _, source := range input.Sentences {
			if cached, exists := checkpoint.sentences[source.ID]; exists {
				var recovered pairedSentence
				var ok bool
				if t.segmentTranslation {
					recovered, ok = t.recoverSegmentedSentence(cached, source, originLang, targetLang)
				} else {
					recovered, ok = t.recoverPairedSentence(cached, source, originLang, targetLang)
				}
				if ok {
					if recovered.LayoutFallback {
						recovered.LayoutVersion = 0
					}
					recoveredSentences[source.ID] = recovered
					continue
				}
			}
			remaining.Sentences = append(remaining.Sentences, source)
		}
		if err := t.completeSemanticBatch(ctx, input, recoveredSentences, plan, originLang, targetLang, save); err != nil {
			return nil, err
		}
		if len(remaining.Sentences) > 0 {
			pending = append(pending, remaining)
		}
	}
	report()
	if err := commit(); err != nil {
		return nil, err
	}
	var deferred []pairedTranslationInput
	var rateLimited atomic.Bool
	workerTranslator := *t
	workerTranslator.onRateLimit = func() {
		if rateLimited.CompareAndSwap(false, true) {
			t.translationNotice("翻译服务暂时限流，后续请求已降低为串行处理")
		}
	}
	parallel := translationParallelism()
	for start := 0; start < len(pending); {
		if rateLimited.Load() {
			parallel = 1
		}
		count := min(parallel, len(pending)-start)
		retry := make([]pairedTranslationInput, count)
		group, batchCtx := errgroup.WithContext(ctx)
		for i := range count {
			group.Go(func() error {
				var batchErr error
				retry[i], batchErr = workerTranslator.translateSemanticBatch(batchCtx, pending[start+i], plan, originLang, targetLang, save)
				return batchErr
			})
		}
		if err := group.Wait(); err != nil {
			return nil, err
		}
		for _, input := range retry {
			if len(input.Sentences) > 0 {
				deferred = append(deferred, input)
			}
		}
		if err := commit(); err != nil {
			return nil, err
		}
		start += count
	}
	// 初译的三次预算已在内容阶段耗尽。其他句先保存完成，不能重新开始无限恢复。
	if len(deferred) > 0 {
		var missing []string
		for _, input := range deferred {
			for _, source := range input.Sentences {
				missing = append(missing, source.ID)
			}
		}
		return nil, fmt.Errorf("句子%s初译已用尽%d次尝试，仍未取得可用翻译文本；检查点和其他字幕已保存", strings.Join(missing, ","), translationMaxAttempts)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	result := make([]pairedSentence, len(texts))
	for i := range result {
		result[i] = resolved[strconv.Itoa(i+1)]
	}
	return t.finishTranslationResult(ctx, result, checkpoint)
}

func (t *Translator) parsePairedTranslation(response string, input pairedTranslationInput, originLang, targetLang types.StandardLanguageCode) ([]pairedSentence, error) {
	var output pairedTranslationOutput
	if err := json.Unmarshal([]byte(util.ExtractJSONObject(response, "sentences")), &output); err != nil {
		return nil, fmt.Errorf("无效JSON: %w", err)
	}
	if len(output.Sentences) != len(input.Sentences) {
		return nil, fmt.Errorf("句子数量为%d，要求%d", len(output.Sentences), len(input.Sentences))
	}
	var result []pairedSentence
	var issues []error
	for i, item := range output.Sentences {
		sentence := pairedSentence{ID: item.ID, FullTarget: item.FullTarget}
		for _, segment := range item.Segments {
			sentence.Source = append(sentence.Source, segment.Source)
			sentence.Target = append(sentence.Target, segment.Target)
		}
		result = append(result, sentence)
		original := input.Sentences[i]
		result[len(result)-1].FullSource = original.Text
		result[len(result)-1].NLPSourceHint = original.NLPSourceHint
		if sentence.ID != original.ID {
			issues = append(issues, fmt.Errorf("句子ID或顺序错误：收到%q，要求%q", sentence.ID, original.ID))
			continue
		}
		if len(item.Segments) == 0 {
			issues = append(issues, fmt.Errorf("句子%s缺少segments原译配对，必须返回至少一条含source和target的字幕", sentence.ID))
		}
		if !hasSubtitleContent(sentence.FullTarget) || hasSubtitleLineBreak(sentence.FullTarget) {
			issues = append(issues, fmt.Errorf("句子%s缺少有效的完整译文target_text，必须先完整翻译一次，再只插入分段边界", sentence.ID))
		} else if !subtitleSegmentsPreserveText(sentence.FullTarget, sentence.Target) {
			issues = append(issues, fmt.Errorf("句子%s译文分段覆盖错误，存在重复、遗漏、改写或乱序。完整译文=%q；错误的译文拼接=%q。请丢弃该句错误的target分段，只从完整译文按顺序插入分割边界，禁止改动任何文字和标点。若原译语序不适合对应，先统一重写该句target_text，再从这份译文顺序分段，不可分别翻译", sentence.ID, sentence.FullTarget, strings.Join(sentence.Target, "")))
		}
		for j := 0; j < max(len(sentence.Source), len(sentence.Target)); j++ {
			var source, target string
			if j < len(sentence.Source) {
				source = sentence.Source[j]
			}
			if j < len(sentence.Target) {
				target = sentence.Target[j]
			}
			if !hasSubtitleContent(source) || !hasSubtitleContent(target) {
				issues = append(issues, fmt.Errorf("句子%s第%d对缺少实际文字，source=%q target=%q；不能用空白或标点占位，请从完整原文和target_text重新划分该句的全部segments", sentence.ID, j+1, source, target))
			}
			if hasSubtitleLineBreak(source) || hasSubtitleLineBreak(target) {
				issues = append(issues, fmt.Errorf("句子%s第%d对存在换行，必须为单行", sentence.ID, j+1))
			}
		}
		if !subtitleSegmentsHaveSafeBoundaries(sentence.Source) || !subtitleSegmentsHaveSafeBoundaries(sentence.Target) {
			issues = append(issues, fmt.Errorf("句子%s在字素簇内部切分，必须保留组合字符、连接符、Emoji和文字方向控制字符", sentence.ID))
		}
		if !subtitleSegmentsPreserveText(original.Text, sentence.Source) {
			issues = append(issues, fmt.Errorf("句子%s原文覆盖错误，存在改写、遗漏、重复、乱序或段内词间空格变化。仅译文可以调整语序，segments的source只能在以下正确原文中插入分割边界，禁止移动任何词或修改段内空格。正确原文=%q；错误的原文拼接=%q。请丢弃该句错误的source分段，直接从正确原文按顺序重新切成%d段", sentence.ID, original.Text, strings.Join(sentence.Source, " "), len(sentence.Target)))
		}
		// 只检查完整文本可用性及排版时译文冻结，不以语言特征否定已有初译。
		if !hasUsableTranslation(sentence.FullTarget) || sourceTranslationChanged(original, sentence.FullTarget) {
			issues = append(issues, fmt.Errorf("句子%s缺少可用翻译文本或修改了冻结译文", sentence.ID))
		}
	}
	if len(issues) > 0 {
		return nil, errors.Join(issues...)
	}
	for i, sentence := range result {
		item := pairedTranslationOutputSentence{ID: sentence.ID, FullTarget: sentence.FullTarget}
		for j := range sentence.Source {
			item.Segments = append(item.Segments, pairedTranslationSegment{Source: sentence.Source[j], Target: sentence.Target[j]})
		}
		if !input.PreserveFinalBoundaries {
			item, _ = optimizePairedLayout(item, sentence.FullSource, input.MaxTargetChars, sentence.NLPSourceHint)
		}
		result[i].Source, result[i].Target = nil, nil
		for _, pair := range item.Segments {
			result[i].Source = append(result[i].Source, pair.Source)
			result[i].Target = append(result[i].Target, pair.Target)
		}
		result[i].LayoutVersion, result[i].LayoutTarget = pairedLayoutVersion, input.MaxTargetChars
		// 最终重拆使用独立意群复核，允许调用方暂存仅长度超标的候选；
		// 软长度的短片段启发式不能再次回并这些边界。
		var layoutErr error
		if input.PreserveFinalBoundaries {
			if !input.AllowLengthOverflow {
				layoutErr = pairedFinalLengthIssueAtLimit(result[i], subtitleDisplayLimit(input))
			}
			if layoutErr == nil {
				for j := 0; j+1 < len(result[i].Source); j++ {
					if subtitleBoundaryLeavesComplement(result[i].Source[j]) || subtitleBoundaryLeavesComplement(result[i].Target[j]) {
						layoutErr = fmt.Errorf("句子%s第%d段在需要宾语的补语标记后断开，必须移动切口或重组父句", result[i].ID, j+1)
						break
					}
				}
			}
		} else {
			layoutErr = pairedLayoutIssue(result[i], input.MaxTargetChars)
		}
		if err := layoutErr; err != nil {
			issues = append(issues, err)
		}
	}
	if len(issues) > 0 {
		return nil, errors.Join(issues...)
	}

	return result, nil
}

func joinPairedTargetSegments(segments []string, targetLang types.StandardLanguageCode) string {
	compact := subtitleLanguageWithoutWordSpaces(targetLang)
	var text strings.Builder
	var previous byte
	previousSpace := false
	isWordByte := func(c byte) bool {
		return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
	}
	for _, segment := range segments {
		leadingSpace := len(segment) > 0 && strings.TrimLeftFunc(segment, unicode.IsSpace) != segment
		trailingSpace := len(segment) > 0 && strings.TrimRightFunc(segment, unicode.IsSpace) != segment
		segment = strings.TrimSpace(segment)
		if segment == "" {
			continue
		}
		if text.Len() > 0 && (previousSpace || leadingSpace || !compact || isWordByte(previous) && isWordByte(segment[0])) {
			text.WriteByte(' ')
		}
		text.WriteString(segment)
		previous = segment[len(segment)-1]
		previousSpace = trailingSpace
	}
	return text.String()
}

func subtitleLanguageWithoutWordSpaces(language types.StandardLanguageCode) bool {
	return !types.LanguageUsesWordSpaces(language)
}

func canJoinPairedTargetSegments(segments []string, language types.StandardLanguageCode) bool {
	for i := 1; i < len(segments); i++ {
		previous, next := segments[i-1], segments[i]
		if strings.TrimRightFunc(previous, unicode.IsSpace) != previous || strings.TrimLeftFunc(next, unicode.IsSpace) != next {
			continue
		}
		last, _ := utf8.DecodeLastRuneInString(previous)
		first, _ := utf8.DecodeRuneInString(next)
		latinWord := func(r rune) bool { return unicode.In(r, unicode.Latin) || unicode.IsDigit(r) }
		if !subtitleLanguageWithoutWordSpaces(language) || latinWord(last) && latinWord(first) {
			return false
		}
	}
	return true
}

type subtitleTimingSpan struct {
	from, to   int
	start, end int64
}

func subtitleWordTimingSpans(words []VttWord, expected string) ([]subtitleTimingSpan, error) {
	var raw []subtitleTimingSpan
	var wordTexts []string
	position := 0
	for _, word := range words {
		length := utf8.RuneCountInString(compactSubtitleText(word.Text))
		if length == 0 {
			continue
		}
		start, end, err := parseSRTTimeline(strings.ReplaceAll(word.Start+" --> "+word.End, ".", ","))
		if err != nil || start < 0 || start-end > 20 {
			return nil, fmt.Errorf("词级字幕时间无效: %q (%s --> %s)", word.Text, word.Start, word.End)
		}
		raw = append(raw, subtitleTimingSpan{position, position + length, start, end})
		position += length
		wordTexts = append(wordTexts, word.Text)
	}
	if compactSubtitleText(strings.Join(wordTexts, "")) != compactSubtitleText(expected) {
		return nil, fmt.Errorf("词级时间与完整原文不匹配")
	}
	var spans []subtitleTimingSpan
	for i, span := range raw {
		if span.end <= span.start {
			// 平台有时把相邻词放在同一时间点；共享邻词区间并保留全部字符。
			next := i + 1
			for next < len(raw) && raw[next].end <= raw[next].start && raw[next].start == span.start {
				next++
			}
			if next < len(raw) && raw[next].start == span.start && raw[next].end > raw[next].start {
				raw[next].from = min(raw[next].from, span.from)
				continue
			}
			if len(spans) > 0 && spans[len(spans)-1].end == span.start {
				spans[len(spans)-1].to = span.to
				continue
			}
			return nil, fmt.Errorf("词级字幕时间无法与相邻词对齐: %q", wordTexts[i])
		}
		if len(spans) > 0 && spans[len(spans)-1].start == span.start && spans[len(spans)-1].end == span.end {
			spans[len(spans)-1].to = span.to
		} else {
			spans = append(spans, span)
		}
	}
	return spans, nil
}

func subtitlePositionTime(spans []subtitleTimingSpan, position int, ending bool) int64 {
	index := sort.Search(len(spans), func(i int) bool { return position < spans[i].to || ending && position == spans[i].to })
	if index == len(spans) {
		return spans[len(spans)-1].end
	}
	span := spans[index]
	return span.start + (span.end-span.start)*int64(max(0, position-span.from))/int64(span.to-span.from)
}

// BatchTranslateSrtBlocks 按完整句子翻译，以两侧单行长度重新生成成对字幕和共享时间轴。
// 有词级时间时沿用词时间；仅有 cue 时间时在原 cue 内按原文字符位置估算边界。
func (t *Translator) BatchTranslateSrtBlocks(ctx context.Context, blocks []*util.SrtBlock, originLang, targetLang string, taskPtr *types.SubtitleTask, wordTimings ...[]VttWord) ([]*util.SrtBlock, error) {
	local := *t
	local.translationTask = taskPtr
	t = &local
	var texts []string
	var spans []subtitleTimingSpan
	position := 0
	for _, block := range blocks {
		if block == nil || !hasSubtitleContent(block.OriginLanguageSentence) {
			return nil, fmt.Errorf("输入字幕缺少原文")
		}
		start, end, err := parseSRTTimeline(block.Timestamp)
		if err != nil || start < 0 || end <= start {
			return nil, fmt.Errorf("第%d条原文字幕时间无效", block.Index)
		}
		text := strings.Join(strings.Fields(block.OriginLanguageSentence), " ")
		length := utf8.RuneCountInString(compactSubtitleText(text))
		spans = append(spans, subtitleTimingSpan{position, position + length, start, end})
		position += length
		texts = append(texts, text)
	}
	// cue 是时间边界，不是语义句界；先连起全文，让同一分句器看到跨 cue 的缩写和姓名。
	if len(texts) > 0 {
		if t.segmentTranslation {
			// 无空格语言的cue边界不能在词中插入空格；嵌入的拉丁词仍保留分隔。
			texts = []string{joinPairedTargetSegments(texts, types.StandardLanguageCode(originLang))}
		} else {
			texts = []string{strings.Join(texts, " ")}
		}
	}
	if len(wordTimings) > 0 && len(wordTimings[0]) > 0 {
		wordSpans, err := subtitleWordTimingSpans(wordTimings[0], strings.Join(texts, ""))
		if err != nil {
			t.translationNotice("词级时间无法完整匹配，已保留全部字幕并改用原字幕时间区间")
		} else {
			spans = wordSpans
		}
	}
	batchSize := config.Conf.App.VttBatchSize
	if batchSize <= 0 {
		batchSize = 10
	}
	// 批次由模型预算限制，不再把已配置的批次强行缩为三个父句。
	paired, err := t.translatePairedSentences(ctx, texts, types.StandardLanguageCode(originLang), types.StandardLanguageCode(targetLang), subtitleTargetLimit(), batchSize, nil, taskPtr.SetTranslationProgress)
	if err != nil {
		if len(blocks) > 0 {
			return nil, fmt.Errorf("字幕%d-%d: %w", blocks[0].Index, blocks[len(blocks)-1].Index, err)
		}
		return nil, err
	}
	var output []*util.SrtBlock
	position = 0
	for _, sentence := range paired {
		sentenceStart, outputStart := position, len(output)
		invalidTiming := false
		for i, source := range sentence.Source {
			start := subtitlePositionTime(spans, position, false)
			position += utf8.RuneCountInString(compactSubtitleText(source))
			end := subtitlePositionTime(spans, position, true)
			if sentence.OmittedHesitation || sentence.SegmentState != nil && sentence.Target[i] == "" {
				continue
			}
			if end <= start {
				invalidTiming = true
			}
			output = append(output, &util.SrtBlock{
				Index:                  len(output) + 1,
				Timestamp:              formatSRTTimeline(start, end),
				OriginLanguageSentence: strings.TrimSpace(source),
				TargetLanguageSentence: strings.TrimSpace(sentence.Target[i]),
			})
		}
		if invalidTiming {
			// 合并回退也只显示有内容的片段；被省略发声仍占用其源位置。
			var visibleSources []string
			for i, source := range sentence.Source {
				if sentence.Target[i] != "" {
					visibleSources = append(visibleSources, source)
				}
			}
			start, end := subtitlePositionTime(spans, sentenceStart, false), subtitlePositionTime(spans, position, true)
			if end <= start {
				return nil, fmt.Errorf("句子%s没有可用的字幕时间区间", sentence.ID)
			}
			output = append(output[:outputStart], &util.SrtBlock{Index: outputStart + 1, Timestamp: formatSRTTimeline(start, end), OriginLanguageSentence: joinPairedTargetSegments(visibleSources, types.StandardLanguageCode(originLang)), TargetLanguageSentence: sentence.FullTarget})
			t.translationNotice(fmt.Sprintf("第%s句分段时间不足，已合并为完整句字幕继续处理", sentence.ID))
		}
	}
	if len(output) == 0 {
		return nil, fmt.Errorf("字幕只有无语义犹豫音，没有需要翻译的正文")
	}
	return output, nil
}
