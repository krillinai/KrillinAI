package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	openaiapi "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
)

func sourceTranslationChanged(source pairedTranslationSource, target string) bool {
	return source.TargetText != "" && !subtitleSegmentsPreserveText(source.TargetText, []string{target})
}

// 只合并已经对应的相邻片段，不在两种语言中独立按比例切分。
func repairPairedBoundaries(item pairedTranslationOutputSentence, sourceText string, limit int) (pairedTranslationOutputSentence, bool) {
	var sources, targets []string
	for _, segment := range item.Segments {
		sources = append(sources, segment.Source)
		targets = append(targets, segment.Target)
	}
	if !subtitleSegmentsPreserveText(sourceText, sources) || !subtitleSegmentsPreserveText(item.FullTarget, targets) {
		return item, false
	}
	item.Segments = append([]pairedTranslationSegment(nil), item.Segments...)
	// 取回原始边界空白，合并 URL 或词内片段时不凭空添加空格。
	chunks := func(full string, segments []string) []string {
		remaining := strings.TrimSpace(full)
		var result []string
		for _, segment := range segments {
			after := remaining[len(strings.TrimSpace(segment)):]
			next := strings.TrimLeftFunc(after, unicode.IsSpace)
			result = append(result, remaining[:len(remaining)-len(next)])
			remaining = next
		}
		return result
	}
	sourceChunks, targetChunks := chunks(sourceText, sources), chunks(item.FullTarget, targets)
	changed := false
	for i := 0; i+1 < len(item.Segments); {
		left, right := item.Segments[i], item.Segments[i+1]
		source, target := sourceChunks[i]+sourceChunks[i+1], targetChunks[i]+targetChunks[i+1]
		badBoundary := subtitleBoundarySplitsSubject(left.Source, right.Source, limit) || subtitleBoundarySplitsSubject(left.Target, right.Target, limit)
		if badBoundary && subtitleTargetLength(strings.TrimSpace(source)) <= subtitleAcceptedLimit(limit) && subtitleTargetLength(strings.TrimSpace(target)) <= subtitleAcceptedLimit(limit) {
			item.Segments[i] = pairedTranslationSegment{Source: strings.TrimSpace(source), Target: strings.TrimSpace(target)}
			item.Segments = append(item.Segments[:i+1], item.Segments[i+2:]...)
			sourceChunks[i], targetChunks[i] = source, target
			sourceChunks = append(sourceChunks[:i+1], sourceChunks[i+2:]...)
			targetChunks = append(targetChunks[:i+1], targetChunks[i+2:]...)
			changed = true
			continue
		}
		i++
	}
	return item, changed
}

// recoverPairedSentence 只恢复已取得有效整句译文的句子，绝不回填原文或空占位。
// 原译片段不能完整还原文本时，回到整句配对，避免按字数比例制造语义错位。
func (t *Translator) recoverPairedSentence(sentence pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) (pairedSentence, bool) {
	if sentence.ID != source.ID || !hasSubtitleContent(sentence.FullTarget) || hasSubtitleLineBreak(sentence.FullTarget) ||
		!t.isTranslationValid(source.Text, sentence.FullTarget, originLang, targetLang) || sourceTranslationChanged(source, sentence.FullTarget) {
		return pairedSentence{}, false
	}
	validSegments := len(sentence.Source) > 0 && len(sentence.Source) == len(sentence.Target) &&
		subtitleSegmentsPreserveText(source.Text, sentence.Source) && subtitleSegmentsPreserveText(sentence.FullTarget, sentence.Target) &&
		subtitleSegmentsHaveSafeBoundaries(sentence.Source) && subtitleSegmentsHaveSafeBoundaries(sentence.Target)
	for i := range sentence.Source {
		if !validSegments || !hasSubtitleContent(sentence.Source[i]) || !hasSubtitleContent(sentence.Target[i]) || hasSubtitleLineBreak(sentence.Source[i]) || hasSubtitleLineBreak(sentence.Target[i]) {
			validSegments = false
			break
		}
	}
	if !validSegments {
		sentence.Source = []string{source.Text}
		sentence.Target = []string{sentence.FullTarget}
	}
	sentence.FullSource = source.Text
	sentence.LayoutFallback = true
	return sentence, true
}

func (t *Translator) translationNotice(message string) {
	log.GetLogger().Warn(message)
	if t.onRecovery != nil {
		t.onRecovery(message)
	}
}

func (t *Translator) waitForTranslationRecovery(ctx context.Context, message string) error {
	t.translationNotice(message)
	delay := t.recoveryDelay
	if delay <= 0 {
		delay = 30 * time.Second
	}
	return waitTranslationRetry(ctx, delay)
}

func waitTranslationRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func translationRequestStatus(err error) int {
	var apiError *openaiapi.APIError
	var requestError *openaiapi.RequestError
	if errors.As(err, &apiError) {
		return apiError.HTTPStatusCode
	}
	if errors.As(err, &requestError) {
		return requestError.HTTPStatusCode
	}
	return 0
}

func isTransientTranslationRequestError(err error) bool {
	status := translationRequestStatus(err)
	var networkError net.Error
	return status == http.StatusTooManyRequests || status >= 500 && status < 600 ||
		errors.Is(err, context.DeadlineExceeded) || errors.As(err, &networkError)
}

// 接口重试与内容纠错分别计数。持续限流进入低频等待，底层不可用仍返回真实错误。
func (t *Translator) requestTranslation(ctx context.Context, prompt string, maxTokens int) (string, error) {
	for failures := 0; ; failures++ {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		var response string
		var err error
		if budgeted, ok := t.chatCompleter.(budgetedChatCompleter); ok {
			response, err = budgeted.ChatCompletionContextWithMaxTokens(ctx, prompt, maxTokens)
		} else {
			response, err = chatCompletionWithContext(ctx, t.chatCompleter, prompt)
		}
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		if !isTransientTranslationRequestError(err) {
			return response, err
		}
		if translationRequestStatus(err) == http.StatusTooManyRequests && t.onRateLimit != nil {
			t.onRateLimit()
		}
		if failures >= max(1, config.Conf.App.TranslateMaxAttempts)-1 {
			if translationRequestStatus(err) != http.StatusTooManyRequests {
				return "", err
			}
			if err := t.waitForTranslationRecovery(ctx, "翻译服务暂时限流，已保留进度，正在等待恢复"); err != nil {
				return "", err
			}
		} else {
			log.GetLogger().Warn("字幕翻译接口临时失败，退避后重试", zap.Int("request_retry", failures+1), zap.Error(err))
			if err := waitTranslationRetry(ctx, time.Second<<min(failures, 4)); err != nil {
				return "", err
			}
		}
	}
}

func translationOutputError(err error) bool {
	if err == nil {
		return false
	}
	message := err.Error()
	return strings.Contains(message, "llm_translation_truncated") || strings.Contains(message, "llm_translation_empty_response") ||
		translationRequestStatus(err) == http.StatusBadRequest && (strings.Contains(message, "context_length") || strings.Contains(message, "maximum context"))
}

func (t *Translator) pairedPrompt(input pairedTranslationInput) string {
	payload, _ := json.Marshal(input)
	replacer := strings.NewReplacer("{{MAX_TARGET_CHARS}}", strconv.Itoa(input.MaxTargetChars), "{{MAX_FULLWIDTH_CHARS}}", strconv.Itoa(input.MaxTargetChars/2))
	prompt := replacer.Replace(pairedTranslationPrompt)
	if t.filterNonSemanticFillers {
		prompt += "\n启用语气词过滤：仅译文可以忽略 um、uh、ah 等没有实际语义的填充词；原文仍须原样完整保留。Yes/No、否定、可能性、时间和其他有含义的词不能省略。\n"
	}
	return prompt + "\n输入 JSON：\n" + string(payload)
}

func (t *Translator) translatePairedBatch(ctx context.Context, input pairedTranslationInput, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) (pairedTranslationInput, error) {
	remaining := input
	candidates := make(map[string]pairedSentence)
	feedback := ""
	maxTokens := 1024
	for _, source := range input.Sentences {
		maxTokens += pairedTranslationResponseBudget(source.Text, input.MaxTargetChars)
	}
	maxTokens = min(8192, max(2048, maxTokens))
	for attempt := 0; attempt < 3 && len(remaining.Sentences) > 0; attempt++ {
		prompt := t.pairedPrompt(remaining) + feedback
		response, err := t.requestTranslation(ctx, prompt, maxTokens)
		if err != nil && !translationOutputError(err) {
			if ctx.Err() == nil {
				// 已取得完整译文时，后续排版请求断连也不能浪费现有成果。
				allRecovered := true
				for _, source := range remaining.Sentences {
					candidate, exists := candidates[source.ID]
					if !exists {
						allRecovered = false
						continue
					}
					if saveErr := save(candidate, true); saveErr != nil {
						return remaining, saveErr
					}
				}
				if allRecovered {
					t.translationNotice("分段优化服务暂时不可用，已使用完整译文继续生成字幕")
					remaining.Sentences = nil
					return remaining, nil
				}
			}
			return remaining, err
		}
		if translationOutputError(err) {
			maxTokens = min(8192, maxTokens*2)
			// 整批仍被截断时直接缩成单句，避免重复提交同样的大批次。
			if attempt > 0 && len(remaining.Sentences) > 1 {
				break
			}
			continue
		}
		var output pairedTranslationOutput
		decodeErr := json.Unmarshal([]byte(util.ExtractJSONObject(response, "sentences")), &output)
		items := make(map[string]pairedTranslationOutputSentence)
		duplicates := make(map[string]bool)
		for _, item := range output.Sentences {
			if _, exists := items[item.ID]; exists {
				duplicates[item.ID] = true
			}
			items[item.ID] = item
		}
		next := remaining
		next.Sentences = nil
		var issues []error
		for _, source := range remaining.Sentences {
			item, exists := items[source.ID]
			single := remaining
			single.Sentences = []pairedTranslationSource{source}
			data, _ := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{item}})
			var parsed []pairedSentence
			parseErr := decodeErr
			if parseErr == nil {
				if !exists || duplicates[source.ID] {
					parseErr = fmt.Errorf("句子%s缺失或ID重复，必须恰好返回一次", source.ID)
				} else {
					parsed, parseErr = t.parsePairedTranslation(string(data), single, originLang, targetLang)
					if parseErr != nil {
						if repaired, ok := repairPairedBoundaries(item, source.Text, remaining.MaxTargetChars); ok {
							data, _ = json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{repaired}})
							parsed, parseErr = t.parsePairedTranslation(string(data), single, originLang, targetLang)
						}
					}
				}
			}
			if parseErr == nil {
				if err := save(parsed[0], true); err != nil {
					return remaining, err
				}
				continue
			}
			if exists && !duplicates[source.ID] && decodeErr == nil {
				sentence := pairedSentence{ID: item.ID, FullTarget: item.FullTarget}
				for _, segment := range item.Segments {
					sentence.Source = append(sentence.Source, segment.Source)
					sentence.Target = append(sentence.Target, segment.Target)
				}
				if candidate, ok := t.recoverPairedSentence(sentence, source, originLang, targetLang); ok {
					candidates[source.ID] = candidate
					// 先保存有效译文，即使分段纠错期间断连也能恢复。
					if err := save(candidate, false); err != nil {
						return remaining, err
					}
					source.TargetText = candidate.FullTarget
				}
			}
			if candidate, ok := candidates[source.ID]; ok && attempt >= 1 {
				t.translationNotice(fmt.Sprintf("第%s句已完成翻译，分段未达到排版目标，已保留完整内容继续处理", source.ID))
				if err := save(candidate, true); err != nil {
					return remaining, err
				}
				continue
			}
			issues = append(issues, parseErr)
			next.Sentences = append(next.Sentences, source)
		}
		remaining = next
		if len(issues) > 0 {
			feedback = "\n\n" + strings.NewReplacer("{{ISSUES}}", subtitleTextPreview(errors.Join(issues...).Error(), 3500), "{{PREVIOUS_RESPONSE}}", subtitleTextPreview(response, 1000), "{{MAX_TARGET_CHARS}}", strconv.Itoa(input.MaxTargetChars), "{{MAX_FULLWIDTH_CHARS}}", strconv.Itoa(input.MaxTargetChars/2)).Replace(pairedTranslationRetry)
			feedback += fmt.Sprintf("\n本次是第%d/3次请求。只处理输入中的失败句；已有target_text的句子只能调整分段，禁止重新翻译或改写。", attempt+2)
		}
	}
	next := remaining
	next.Sentences = nil
	for _, source := range remaining.Sentences {
		if candidate, exists := candidates[source.ID]; exists {
			if err := save(candidate, true); err != nil {
				return remaining, err
			}
			continue
		}
		sentence, ok, err := t.translatePlainSentence(ctx, input, source, originLang, targetLang)
		if err != nil {
			return remaining, err
		}
		if ok {
			if err := save(sentence, true); err != nil {
				return remaining, err
			}
		} else {
			next.Sentences = append(next.Sentences, source)
		}
	}
	return next, nil
}

func (t *Translator) translatePlainSentence(ctx context.Context, input pairedTranslationInput, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) (pairedSentence, bool, error) {
	input.Sentences = []pairedTranslationSource{source}
	payload, _ := json.Marshal(input)
	prompt := "仅翻译输入text的完整内容到target_language，不拆分、不配对、不计数字幕长度。保留全部事实、专名、数字、否定和条件；context_before/context_after仅供理解，禁止翻译进结果。仅输出JSON：{\"sentence_id\":\"输入ID\",\"target_text\":\"完整译文\"}。\n"
	if t.filterNonSemanticFillers {
		prompt += "仅忽略没有实际语义的um、uh、ah，保留具有实际含义的语气、否定及可能性。\n"
	}
	prompt += "输入 JSON：\n" + string(payload)
	response, err := t.requestTranslation(ctx, prompt, 8192)
	if err != nil {
		if translationOutputError(err) {
			return pairedSentence{}, false, nil
		}
		return pairedSentence{}, false, err
	}
	var item pairedTranslationOutputSentence
	if err := json.Unmarshal([]byte(util.ExtractJSONObject(response, "target_text")), &item); err != nil {
		return pairedSentence{}, false, nil
	}
	sentence, ok := t.recoverPairedSentence(pairedSentence{ID: item.ID, FullTarget: item.FullTarget}, source, originLang, targetLang)
	if ok {
		t.translationNotice(fmt.Sprintf("第%s句已通过整句翻译恢复，正在继续生成字幕", source.ID))
	}
	return sentence, ok, nil
}
