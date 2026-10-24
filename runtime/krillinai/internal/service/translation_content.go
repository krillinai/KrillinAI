package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"strings"
)

//go:embed translation_content_prompt.txt
var translationContentPrompt string

type translationContentInput struct {
	SourceLanguage  string                           `json:"source_language"`
	TargetLanguage  string                           `json:"target_language"`
	Before          []string                         `json:"context_before,omitempty"`
	After           []string                         `json:"context_after,omitempty"`
	SemanticContext *translationBatchSemanticContext `json:"semantic_context,omitempty"`
	Sentences       []translationContentSource       `json:"sentences"`
}

type translationContentSource struct {
	ID   string `json:"sentence_id"`
	Text string `json:"text"`
}

func translationBatchContext(texts []string, start, end int) (before, after []string) {
	for i := max(0, start-2); i < start; i++ {
		parts, _ := splitSubtitleText(texts[i], func(s string) bool { return len(s) <= 384 })
		if len(parts) > 0 {
			before = append(before, parts[len(parts)-1])
		}
	}
	for i := end; i < min(len(texts), end+2); i++ {
		parts, _ := splitSubtitleText(texts[i], func(s string) bool { return len(s) <= 384 })
		if len(parts) > 0 {
			after = append(after, parts[0])
		}
	}
	return
}

func contentTranslationInput(input pairedTranslationInput) translationContentInput {
	value := translationContentInput{SourceLanguage: input.SourceLanguage, TargetLanguage: input.TargetLanguage,
		Before: input.Before, After: input.After, SemanticContext: input.SemanticContext}
	for _, source := range input.Sentences {
		value.Sentences = append(value.Sentences, translationContentSource{source.ID, source.Text})
	}
	return value
}

// 排版响应仍须完整回显片段，单独按实际请求与预计响应预算合批。
func pairedLayoutBatches(input pairedTranslationInput) ([]pairedTranslationInput, error) {
	var groups []pairedTranslationInput
	group := input
	group.Sentences = nil
	budget := 0
	for _, source := range input.Sentences {
		estimate := len(source.Text) + 2*len(source.TargetText) + 256
		candidate := group
		candidate.Sentences = append(append([]pairedTranslationSource(nil), group.Sentences...), source)
		payload, _ := json.Marshal(candidate)
		if len(group.Sentences) > 0 && (len(payload)+len(pairedTranslationPrompt)+1500 > translationRequestBytes || budget+estimate > translationOutputBudget) {
			groups = append(groups, group)
			group = input
			group.Sentences = nil
			budget = 0
		}
		group.Sentences = append(group.Sentences, source)
		budget += estimate
		payload, _ = json.Marshal(group)
		if len(payload)+len(pairedTranslationPrompt)+1500 > translationRequestBytes {
			return nil, fmt.Errorf("句子%s的字幕排版请求超过预算，完整译文已保存", source.ID)
		}
	}
	if len(group.Sentences) > 0 {
		groups = append(groups, group)
	}
	return groups, nil
}

// 内容生成独立于字幕长度与NLP排版；只重试没有有效译文的句子。
func (t *Translator) translateContentBatch(ctx context.Context, input pairedTranslationInput, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) (pairedTranslationInput, error) {
	remaining := input
	feedback := ""
	maxTokens := 1024
	for _, source := range input.Sentences {
		maxTokens += 2*len(source.Text) + 128
	}
	maxTokens = min(translationOutputBudget, max(2048, maxTokens))
	for attempt := 0; attempt < translationMaxAttempts && len(remaining.Sentences) > 0; attempt++ {
		// 最后一次切换整句请求，但仍计入同一句的三次预算，不能在外层重新计数。
		if attempt == translationMaxAttempts-1 {
			next := remaining
			next.Sentences = nil
			for _, source := range remaining.Sentences {
				sentence, ok, err := t.translatePlainSentence(ctx, input, source, originLang, targetLang)
				if err != nil {
					if ctx.Err() != nil {
						return remaining, ctx.Err()
					}
					if permanentTranslationServiceError(err) {
						return remaining, err
					}
					source.FailureReason = err.Error()
					next.Sentences = append(next.Sentences, source)
					continue
				}
				if !ok {
					next.Sentences = append(next.Sentences, source)
					continue
				}
				sentence.DraftTarget = sentence.FullTarget
				if err := save(sentence, true); err != nil {
					return remaining, err
				}
				t.noteTranslationCandidate(source, sentence, originLang, targetLang)
			}
			remaining = next
			break
		}
		payload, _ := json.Marshal(contentTranslationInput(remaining))
		prompt := "任务：translation_content\n" + translationContentPrompt
		if t.filterNonSemanticFillers {
			prompt += "\n仅译文忽略无实际语义的um/uh/ah，保留有意义的犹豫、引语、演示和语气。\n"
		}
		prompt += "\n输入 JSON：\n" + string(payload) + feedback
		if len(prompt) > translationRequestBytes {
			return remaining, fmt.Errorf("完整句翻译请求超过预算")
		}
		response, err := t.requestTranslation(ctx, prompt, maxTokens)
		if err != nil {
			if translationOutputError(err) {
				maxTokens = min(8192, maxTokens*2)
				feedback = "\n上次输出被截断，只返回完整译文JSON。"
				continue
			}
			if ctx.Err() != nil {
				return remaining, ctx.Err()
			}
			if permanentTranslationServiceError(err) {
				return remaining, err
			}
			for i := range remaining.Sentences {
				remaining.Sentences[i].FailureReason = err.Error()
			}
			return remaining, nil
		}
		var output pairedTranslationOutput
		decodeErr := json.Unmarshal([]byte(util.ExtractJSONObject(response, "sentences")), &output)
		items, duplicate := make(map[string]pairedTranslationOutputSentence), make(map[string]bool)
		for _, item := range output.Sentences {
			if _, exists := items[item.ID]; exists {
				duplicate[item.ID] = true
			}
			items[item.ID] = item
		}
		next := remaining
		next.Sentences = nil
		var issues []string
		for _, source := range remaining.Sentences {
			item, exists := items[source.ID]
			if decodeErr != nil || !exists || duplicate[source.ID] || item.textConflict {
				reason := "missing_sentence_id"
				if decodeErr != nil {
					reason = "invalid_response_json"
				} else if duplicate[source.ID] {
					reason = "duplicate_sentence_id"
				} else if item.textConflict {
					reason = "conflicting_translation_fields"
				}
				noteTranslationTextIssue("translation_content", source.ID, reason, attempt+1)
				source.FailureReason = reason
				issues = append(issues, fmt.Sprintf("句子%s缺失或ID重复，必须恰好返回一次", source.ID))
				next.Sentences = append(next.Sentences, source)
				continue
			}
			candidate := pairedSentence{ID: source.ID, FullTarget: item.FullTarget, DraftTarget: item.FullTarget}
			if issue := pairedTranslationTextIssue(candidate, source); issue != "" {
				source.FailureReason = issue
				noteTranslationTextIssue("translation_content", source.ID, issue, attempt+1)
				issues = append(issues, fmt.Sprintf("句子%s未取得可用翻译文本：%s", source.ID, issue))
				next.Sentences = append(next.Sentences, source)
				continue
			}
			// 接受兼容响应中的既有配对，但绝不要求内容生成阶段输出排版。
			for _, segment := range item.Segments {
				candidate.Source = append(candidate.Source, segment.Source)
				candidate.Target = append(candidate.Target, segment.Target)
			}
			value, ok := t.recoverPairedSentence(candidate, source, originLang, targetLang)
			if !ok {
				issues = append(issues, fmt.Sprintf("句子%s未取得可用翻译文本", source.ID))
				next.Sentences = append(next.Sentences, source)
				continue
			}
			if err := save(value, true); err != nil {
				return remaining, err
			}
			t.noteTranslationCandidate(source, value, originLang, targetLang)
		}
		remaining = next
		if len(issues) > 0 {
			feedback = fmt.Sprintf("\n第%d/3次请求。只翻译当前失败ID，修正：%s", attempt+2, strings.Join(issues, "; "))
		}
	}
	return remaining, nil
}
