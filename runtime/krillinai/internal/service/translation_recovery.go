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
	"slices"
	"strconv"
	"strings"
	"time"

	openaiapi "github.com/sashabaranov/go-openai"
	"go.uber.org/zap"
)

func sourceTranslationChanged(source pairedTranslationSource, target string) bool {
	return source.TargetText != "" && !subtitleSegmentsPreserveText(source.TargetText, []string{target})
}

// 只合并已经对应的相邻片段，不在两种语言中独立按比例切分。
func repairPairedBoundaries(item pairedTranslationOutputSentence, sourceText string, limit int, hints ...[]string) (pairedTranslationOutputSentence, bool) {
	item, punctuationChanged := restorePairedTargetBoundaryPunctuation(item)
	item, layoutChanged := optimizePairedLayout(item, sourceText, limit, hints...)
	return item, punctuationChanged || layoutChanged
}

func pairedTranslationTextIssue(sentence pairedSentence, source pairedTranslationSource) string {
	if sentence.OmittedHesitation {
		return "unexpected_omission"
	}
	if sentence.ID != source.ID {
		return "sentence_id_mismatch"
	}
	if issue := translationTextIssue(sentence.FullTarget); issue != "" {
		return issue
	}
	if sourceTranslationChanged(source, sentence.FullTarget) {
		return "frozen_translation_changed"
	}
	return ""
}

// recoverPairedSentence 恢复结构可用的完整初译，语义疑点留给可回退审校。
// 不在缺少模型返回时回填原文或空占位。
// 原译片段不能完整还原文本时，回到整句配对，避免按字数比例制造语义错位。
func (t *Translator) recoverPairedSentence(sentence pairedSentence, source pairedTranslationSource, originLang, targetLang types.StandardLanguageCode) (pairedSentence, bool) {
	// 沿用原文只用于本次交付，续跑必须重新翻译这些句子。
	if sentence.TranslationFallbackReason != "" {
		return pairedSentence{}, false
	}
	if pairedTranslationTextIssue(sentence, source) != "" {
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
		sentence.LayoutFallback = true
	}
	if !slices.Equal(sentence.NLPSourceHint, source.NLPSourceHint) {
		// 边界建议改变时复用父句译文，只重新检查排版。
		sentence.LayoutVersion = 0
		sentence.LayoutReviewed = false
	}
	sentence.NLPSourceHint = source.NLPSourceHint
	sentence.FullSource = source.Text
	return sentence, true
}

func (t *Translator) translationNotice(message string) {
	log.GetLogger().Warn(message)
	if t.onRecovery != nil {
		t.onRecovery(message)
	}
	t.translationProgress.notice("正在恢复翻译，已保留已有结果")
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
	if permanentTranslationServiceError(err) {
		return false
	}
	status := translationRequestStatus(err)
	var networkError net.Error
	return status == http.StatusTooManyRequests || status >= 500 && status < 600 ||
		errors.Is(err, context.DeadlineExceeded) || errors.As(err, &networkError)
}

func permanentTranslationServiceError(err error) bool {
	status := translationRequestStatus(err)
	message := strings.ToLower(fmt.Sprint(err))
	var apiError *openaiapi.APIError
	if errors.As(err, &apiError) {
		message += " " + strings.ToLower(fmt.Sprint(apiError.Code, " ", apiError.Type))
	}
	return status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusPaymentRequired ||
		status == http.StatusTooManyRequests && (strings.Contains(message, "insufficient_quota") || strings.Contains(message, "quota_exceeded") || strings.Contains(message, "billing"))
}

const translationMaxAttempts = 3

// 接口重试与内容纠错分别计数；包括持续限流在内，单次请求最多尝试三次。
func (t *Translator) requestTranslation(ctx context.Context, prompt string, maxTokens int) (string, error) {
	prompt = withTranslationFillerPolicy(prompt)
	if len(prompt) > translationRequestBytes {
		return "", fmt.Errorf("翻译请求超过预算")
	}
	attempts := min(translationMaxAttempts, max(1, config.Conf.App.TranslateMaxAttempts))
	var lastErr error
	for failures := 0; failures < attempts; failures++ {
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
		lastErr = err
		if failures+1 >= attempts {
			break
		}
		log.GetLogger().Warn("字幕翻译接口临时失败，退避后重试", zap.Int("request_retry", failures+1), zap.Error(err))
		t.translationProgress.notice("翻译服务暂时失败，正在重试")
		if err := waitTranslationRetry(ctx, time.Second<<min(failures, 4)); err != nil {
			return "", err
		}
	}
	return "", fmt.Errorf("翻译接口已用尽%d次请求，已保留现有结果: %w", attempts, lastErr)
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
	// 排版入口已经有完整译文，失败时恢复这份译文，不能触发再次翻译。
	for _, source := range input.Sentences {
		if source.TargetText == "" {
			continue
		}
		if value, ok := t.recoverPairedSentence(pairedSentence{ID: source.ID, FullTarget: source.TargetText}, source, originLang, targetLang); ok {
			value.LayoutFallback = true
			value.LayoutVersion, value.LayoutTarget = pairedLayoutVersion, input.MaxTargetChars
			candidates[source.ID] = value
		}
	}
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
			if item.FullTarget == "" {
				for _, source := range remaining.Sentences {
					if source.ID == item.ID {
						item.FullTarget = source.TargetText
						break
					}
				}
			}
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
						if repaired, ok := repairPairedBoundaries(item, source.Text, remaining.MaxTargetChars, source.NLPSourceHint); ok {
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
					// 短句的完整原译可直接成为安全配对，不为失效的多余切分反复请求。
					encoded, _ := encodePairedSentenceForLayout(candidate)
					if whole, err := t.parsePairedTranslation(encoded, single, originLang, targetLang); err == nil {
						if err := save(whole[0], true); err != nil {
							return remaining, err
						}
						continue
					}
					candidate.LayoutFallback = true
					candidate.LayoutVersion, candidate.LayoutTarget = pairedLayoutVersion, input.MaxTargetChars
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
	prompt += "semantic_context 若存在，只使用适用于当前 sentence_id 的术语含义，结合主题理解歧义，不把摘要翻译进结果。已有 target_text 必须原样保留。\n"
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
	if err := json.Unmarshal([]byte(util.ExtractJSONObject(response, "sentence_id")), &item); err != nil || item.textConflict {
		noteTranslationTextIssue("plain_translation", source.ID, "invalid_response_json", translationMaxAttempts)
		return pairedSentence{}, false, nil
	}
	candidate := pairedSentence{ID: item.ID, FullTarget: item.FullTarget}
	if issue := pairedTranslationTextIssue(candidate, source); issue != "" {
		noteTranslationTextIssue("plain_translation", source.ID, issue, translationMaxAttempts)
		return pairedSentence{}, false, nil
	}
	sentence, ok := t.recoverPairedSentence(candidate, source, originLang, targetLang)
	if ok {
		t.translationNotice(fmt.Sprintf("第%s句已通过整句翻译恢复，正在继续生成字幕", source.ID))
	}
	return sentence, ok, nil
}
