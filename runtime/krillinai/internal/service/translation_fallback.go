package service

import (
	"context"
	"fmt"
	"krillin-ai/internal/types"
	"slices"
)

type allTranslationFailedError struct {
	count  int
	reason string
}

func (e *allTranslationFailedError) Error() string {
	return fmt.Sprintf("全部%d条正文字幕翻译失败，检查点已保存，可续跑重试：%s", e.count, e.reason)
}

func originalTranslationFallback(source pairedTranslationSource, reason string) pairedSentence {
	if reason == "" {
		reason = "初译已用尽有限重试，仍未取得可用翻译文本"
	}
	return pairedSentence{
		ID: source.ID, FullSource: source.Text, FullTarget: source.Text,
		Source: []string{source.Text}, Target: []string{source.Text}, NLPSourceHint: source.NLPSourceHint,
		TranslationFallbackReason: reason,
	}
}

// 回退句不再交给排版/术语请求处理，避免把保留原文误标为翻译审校成功。
func (t *Translator) finishFallbackSentences(input pairedTranslationInput, accepted map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) (pairedTranslationInput, error) {
	active := input
	active.Sentences = nil
	for _, source := range input.Sentences {
		if sentence, ok := accepted[source.ID]; ok && sentence.TranslationFallbackReason != "" {
			if t.semanticSourceUnits && pairedFinalLengthIssueAtLimit(sentence, subtitleDisplayLimit(input)) != nil {
				sentence.LayoutBaseTarget = sentence.FullTarget
				var err error
				sentence, err = splitFrozenDisplaySentence(sentence, subtitleDisplayLimit(input), originLang, targetLang, nil, nil)
				if err != nil {
					return active, err
				}
				accepted[source.ID] = sentence
			}
			if err := save(sentence, true); err != nil {
				return active, err
			}
			continue
		}
		active.Sentences = append(active.Sentences, source)
	}
	return active, nil
}

func unchangedTranslationNeedsReview(source pairedTranslationSource, sentence pairedSentence, originLang, targetLang types.StandardLanguageCode) bool {
	return slices.Contains(translationQualityHints(source.Text, sentence.FullTarget, originLang, targetLang), "unchanged_text_check_meaning_but_allow_names_urls_and_shared_words")
}

func (t *Translator) finishTranslationResult(ctx context.Context, result []pairedSentence, checkpoint *translationCheckpoint) ([]pairedSentence, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var failures []types.SubtitleTranslationFailure
	translated := 0
	layoutPending := 0
	for _, sentence := range result {
		if sentence.OmittedHesitation {
			continue
		}
		if sentence.TranslationFallbackReason != "" {
			failures = append(failures, types.SubtitleTranslationFailure{SentenceID: sentence.ID, SourceText: sentence.FullSource, Reason: sentence.TranslationFallbackReason})
		} else {
			translated++
			if sentence.LayoutFallback {
				layoutPending++
			}
		}
	}
	scope := t.translationReportScope
	if scope == "" {
		scope = checkpoint.dir
	}
	t.translationTask.SetTranslationFailures(scope, failures)
	t.translationTask.SetTranslationLayoutWarnings(scope, layoutPending)
	if len(failures) > 0 {
		t.translationNotice(types.TranslationWarnings(failures)[0])
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if translated == 0 {
			return nil, &allTranslationFailedError{count: len(failures), reason: failures[0].Reason}
		}
	}
	return result, nil
}
