package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	openaiapi "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

//go:embed paired_translation_prompt.txt
var pairedTranslationPrompt string

//go:embed paired_translation_retry.txt
var pairedTranslationRetry string

type pairedSentence struct {
	ID         string   `json:"sentence_id"`
	FullTarget string   `json:"target_text"`
	Target     []string `json:"target_segments"`
	Source     []string `json:"source_segments"`
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
			items = append(items, &TranslatedItem{OriginText: strings.TrimSpace(source), TranslatedText: strings.TrimSpace(sentence.Target[i])})
		}
	}
	return items
}

type pairedTranslationInput struct {
	SourceLanguage    string                    `json:"source_language"`
	TargetLanguage    string                    `json:"target_language"`
	MaxTargetChars    int                       `json:"max_target_display_units"`
	MaxSourceChars    int                       `json:"max_source_display_units"`
	MaxFullwidthChars int                       `json:"max_fullwidth_chars"`
	Sentences         []pairedTranslationSource `json:"sentences"`
}

type pairedTranslationSource struct {
	ID         string   `json:"sentence_id"`
	Text       string   `json:"text"`
	SourceHint []string `json:"source_segments_hint,omitempty"`
	Before     []string `json:"context_before"`
	After      []string `json:"context_after"`
}

const (
	translationSentenceBytes = 1024
	translationRequestBytes  = 16000
	translationOutputBudget  = 6500 // 为 8192 token 响应留出 JSON 和纠错余量。
)

type budgetedChatCompleter interface {
	ChatCompletionContextWithMaxTokens(context.Context, string, int) (string, error)
}

func pairedTranslationResponseBudget(text string, limit int) int {
	return 4*len(text) + (3*subtitleTargetLength(text)/limit+1)*48
}

func buildPairedTranslationBatches(texts []string, originLang, targetLang types.StandardLanguageCode, limit, batchSize int) ([]pairedTranslationInput, error) {
	var batches []pairedTranslationInput
	for start := 0; start < len(texts); {
		input := pairedTranslationInput{
			SourceLanguage: types.GetStandardLanguageName(originLang), TargetLanguage: types.GetStandardLanguageName(targetLang),
			MaxSourceChars: limit, MaxTargetChars: limit, MaxFullwidthChars: limit / 2,
		}
		outputBudget := 0
		for i := start; i < min(len(texts), start+batchSize); i++ {
			source := pairedTranslationSource{ID: strconv.Itoa(i + 1), Text: texts[i]}
			if subtitleTargetLength(source.Text) > limit {
				var err error
				source.SourceHint, err = splitSubtitleSourceHint(source.Text, limit)
				if err != nil {
					return nil, err
				}
			}
			// 上下文独立限长，避免相邻超长句重新扩大请求。
			for j := max(0, i-2); j < i; j++ {
				parts, _ := splitSubtitleText(texts[j], func(s string) bool { return len(s) <= 256 })
				if len(parts) > 0 {
					source.Before = append(source.Before, parts[len(parts)-1])
				}
			}
			for j := i + 1; j < min(len(texts), i+3); j++ {
				parts, _ := splitSubtitleText(texts[j], func(s string) bool { return len(s) <= 256 })
				if len(parts) > 0 {
					source.After = append(source.After, parts[0])
				}
			}
			estimate := pairedTranslationResponseBudget(texts[i], limit)
			input.Sentences = append(input.Sentences, source)
			payload, err := json.Marshal(input)
			if err != nil {
				return nil, err
			}
			if len(payload)+len(pairedTranslationPrompt)+6000 > translationRequestBytes || outputBudget+estimate > translationOutputBudget {
				input.Sentences = input.Sentences[:len(input.Sentences)-1]
				break
			}
			outputBudget += estimate
		}
		if len(input.Sentences) == 0 {
			return nil, fmt.Errorf("第%d句超过翻译请求预算，无法安全提交", start+1)
		}
		start += len(input.Sentences)
		batches = append(batches, input)
	}
	return batches, nil
}

// 原文和译文使用相同的单行显示上限。
func subtitleTargetLimit() int {
	limit := config.Conf.App.MaxSentenceLength
	if limit <= 0 {
		limit = 50
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
	if limit < 1 || batchSize < 1 {
		return nil, fmt.Errorf("目标长度和批次大小必须大于0")
	}
	var protected []string
	var inputSentences []string
	for _, text := range texts {
		inputSentences = append(inputSentences, splitTranslationSentences(text)...)
	}
	for _, text := range inputSentences {
		parts, err := splitTranslationSentenceForBudget(strings.Join(strings.Fields(text), " "), min(translationSentenceBytes, max(32, limit*16)))
		if err != nil {
			return nil, err
		}
		protected = append(protected, parts...)
	}
	texts = protected
	inputs, err := buildPairedTranslationBatches(texts, originLang, targetLang, limit, batchSize)
	if err != nil {
		return nil, err
	}
	var progressMu sync.Mutex
	completed := 0
	reportCompleted := func(count int) {
		progressMu.Lock()
		defer progressMu.Unlock()
		completed += count
		for _, report := range onProgress {
			if report != nil && len(texts) > 0 {
				report(completed, len(texts))
			}
		}
	}
	reportCompleted(0)
	translateBatch := func(ctx context.Context, input pairedTranslationInput) ([]pairedSentence, error) {
		start, _ := strconv.Atoi(input.Sentences[0].ID)
		end := start + len(input.Sentences) - 1
		payload, err := json.Marshal(input)
		if err != nil {
			return nil, err
		}
		replacer := strings.NewReplacer("{{MAX_TARGET_CHARS}}", strconv.Itoa(limit), "{{MAX_FULLWIDTH_CHARS}}", strconv.Itoa(limit/2))
		basePrompt := replacer.Replace(pairedTranslationPrompt)
		if t.filterNonSemanticFillers {
			basePrompt += "\n启用语气词过滤：仅译文可以忽略 um、uh、ah 等没有实际语义的填充词；原文仍须原样完整保留。Yes/No、否定、可能性、时间和其他有含义的词不能省略。\n"
		}
		basePrompt += "\n输入 JSON：\n" + string(payload)
		prompt := basePrompt
		var batch []pairedSentence
		requestFailures := 0
		maxTokens := 1024
		for _, sentence := range input.Sentences {
			maxTokens += pairedTranslationResponseBudget(sentence.Text, limit)
		}
		maxTokens = min(8192, max(2048, maxTokens))
		budgeted, supportsBudget := t.chatCompleter.(budgetedChatCompleter)
		for attempt := 0; attempt < 3; {
			if err = ctx.Err(); err != nil {
				return nil, err
			}
			var response string
			if supportsBudget {
				response, err = budgeted.ChatCompletionContextWithMaxTokens(ctx, prompt, maxTokens)
			} else {
				response, err = chatCompletionWithContext(ctx, t.chatCompleter, prompt)
			}
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			if isTransientTranslationRequestError(err) {
				if requestFailures >= max(1, config.Conf.App.TranslateMaxAttempts)-1 {
					break
				}
				delay := time.Second << min(requestFailures, 4)
				requestFailures++
				log.GetLogger().Warn("字幕翻译接口临时失败，退避后重试", zap.Int("start_sentence", start), zap.Int("end_sentence", end), zap.Int("request_retry", requestFailures), zap.Duration("delay", delay), zap.Error(err))
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(delay):
				}
				continue
			}
			attempt++
			if supportsBudget && err != nil && strings.Contains(err.Error(), "llm_translation_truncated") && maxTokens < 8192 {
				maxTokens = min(8192, maxTokens*2)
				log.GetLogger().Warn("字幕翻译响应截断，增加输出预算后重试", zap.Int("max_tokens", maxTokens), zap.Int("attempt", attempt))
				continue
			}
			if err == nil {
				batch, err = t.parsePairedTranslation(response, input, originLang, targetLang)
				if err == nil {
					break
				}
				log.GetLogger().Warn("字幕配对本地检查未通过", zap.Int("start_sentence", start), zap.Int("end_sentence", end), zap.Int("attempt", attempt), zap.Error(err))
				feedback := strings.NewReplacer("{{ISSUES}}", subtitleTextPreview(err.Error(), 3500), "{{PREVIOUS_RESPONSE}}", subtitleTextPreview(response, 1000)).Replace(pairedTranslationRetry)
				prompt = basePrompt + "\n\n" + replacer.Replace(feedback) + fmt.Sprintf("\n本次是第%d/3次请求。必须按上面的具体错误重新生成，不能再次照抄错误结果。", attempt+1)
			}
		}
		if err != nil {
			return nil, fmt.Errorf("句子%d-%d翻译失败: %w", start, end, err)
		}
		return batch, nil
	}
	parallel := translationParallelism()
	var result []pairedSentence
	done := 0
	for start := 0; start < len(inputs); {
		count := min(parallel, len(inputs)-start)
		batches := make([][]pairedSentence, count)
		group, batchCtx := errgroup.WithContext(ctx)
		for i := range count {
			input := inputs[start+i]
			group.Go(func() error {
				batch, err := translateBatch(batchCtx, input)
				if err == nil {
					batches[i] = batch
					reportCompleted(len(batch))
				}
				return err
			})
		}
		if err := group.Wait(); err != nil {
			return nil, err
		}
		// 检查点和时间轴按原顺序提交，并将未提交结果限制在一个并发窗口内。
		for _, batch := range batches {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			done += len(batch)
			result = append(result, batch...)
			if onBatch != nil {
				if err := onBatch(batch, done, len(texts)); err != nil {
					return nil, err
				}
			}
		}
		start += count
	}
	return result, nil
}

func isTransientTranslationRequestError(err error) bool {
	var apiError *openaiapi.APIError
	var requestError *openaiapi.RequestError
	status := 0
	if errors.As(err, &apiError) {
		status = apiError.HTTPStatusCode
	} else if errors.As(err, &requestError) {
		status = requestError.HTTPStatusCode
	}
	return status == http.StatusTooManyRequests || status >= 500 && status < 600
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
			if length := subtitleTargetLength(source); length > input.MaxTargetChars {
				issues = append(issues, fmt.Errorf("句子%s第%d段原文%q计%d显示单位，超过硬上限%d；该段至少拆成%d段，请参考source_segments_hint重新配对原译片段，禁止再次返回此超长片段", sentence.ID, j+1, source, length, input.MaxTargetChars, (length+max(1, input.MaxTargetChars)-1)/max(1, input.MaxTargetChars)))
			}
			if length := subtitleTargetLength(target); length > input.MaxTargetChars {
				issues = append(issues, fmt.Errorf("句子%s第%d段译文%q计%d字符，超过硬上限%d（汉字和全角字符计2，英文、数字、半角标点和空格计1）；该段至少拆成%d段，再将对应原文切成相同段数，不删减内容", sentence.ID, j+1, target, length, input.MaxTargetChars, (length+max(1, input.MaxTargetChars)-1)/max(1, input.MaxTargetChars)))
			}
		}
		if !subtitleSegmentsHaveSafeBoundaries(sentence.Source) || !subtitleSegmentsHaveSafeBoundaries(sentence.Target) {
			issues = append(issues, fmt.Errorf("句子%s在字素簇内部切分，必须保留组合字符、连接符、Emoji和文字方向控制字符", sentence.ID))
		}
		if !subtitleSegmentsPreserveText(original.Text, sentence.Source) {
			issues = append(issues, fmt.Errorf("句子%s原文覆盖错误，存在改写、遗漏、重复、乱序或段内词间空格变化。仅译文可以调整语序，segments的source只能在以下正确原文中插入分割边界，禁止移动任何词或修改段内空格。正确原文=%q；错误的原文拼接=%q。请丢弃该句错误的source分段，直接从正确原文按顺序重新切成%d段", sentence.ID, original.Text, strings.Join(sentence.Source, " "), len(sentence.Target)))
		}
		// 检查完整句子，允许其中的专名片段保持原样及跨片段调整语序。
		if !t.isTranslationValid(original.Text, sentence.FullTarget, originLang, targetLang) {
			issues = append(issues, fmt.Errorf("句子%s没有有效目标语言译文或原样返回了整句原文", sentence.ID))
		}
	}
	if len(issues) > 0 {
		return nil, errors.Join(issues...)
	}
	// 整句放得下一行时撤销模型多余的切分，不增加翻译请求。
	for i, sentence := range result {
		if len(sentence.Target) <= 1 {
			continue
		}
		if !canJoinPairedTargetSegments(sentence.Target, targetLang) {
			continue
		}
		target := joinPairedTargetSegments(sentence.Target, targetLang)
		if subtitleTargetLength(target) <= input.MaxTargetChars && subtitleTargetLength(input.Sentences[i].Text) <= input.MaxTargetChars {
			result[i].Source = []string{input.Sentences[i].Text}
			result[i].Target = []string{target}
		}
	}
	for _, sentence := range result {
		for j := 0; j+1 < len(sentence.Source); j++ {
			if subtitleBoundarySplitsSubject(sentence.Source[j], sentence.Source[j+1], input.MaxTargetChars) ||
				subtitleBoundarySplitsSubject(sentence.Target[j], sentence.Target[j+1], input.MaxTargetChars) {
				issues = append(issues, fmt.Errorf("句子%s第%d与%d段拆开了主语和谓语；请将悬在上一段末尾的主语移到下一段，并同步调整原译配对。优先完整意群，不要为了均衡长度保留生硬边界", sentence.ID, j+1, j+2))
			}
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
		texts = []string{strings.Join(texts, " ")}
	}
	if len(wordTimings) > 0 && len(wordTimings[0]) > 0 {
		var err error
		spans, err = subtitleWordTimingSpans(wordTimings[0], strings.Join(texts, ""))
		if err != nil {
			return nil, err
		}
	}
	batchSize := config.Conf.App.VttBatchSize
	if batchSize <= 0 {
		batchSize = 10
	}
	batchSize = min(3, batchSize)
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
		for i, source := range sentence.Source {
			start := subtitlePositionTime(spans, position, false)
			position += utf8.RuneCountInString(compactSubtitleText(source))
			end := subtitlePositionTime(spans, position, true)
			if end <= start {
				return nil, fmt.Errorf("分段后第%d条字幕时间无效", len(output)+1)
			}
			output = append(output, &util.SrtBlock{
				Index:                  len(output) + 1,
				Timestamp:              formatSRTTimeline(start, end),
				OriginLanguageSentence: strings.TrimSpace(source),
				TargetLanguageSentence: strings.TrimSpace(sentence.Target[i]),
			})
		}
	}
	return output, nil
}
