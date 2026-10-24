package service

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"fmt"
	"krillin-ai/internal/types"
	"strings"
)

// 默认对完整父句作一次内容修订；基准可选择单轮版本，不新增用户配置。
var translationRevisionDefault = "revised"

//go:embed translation_revision_prompt.txt
var translationRevisionPrompt string

const translationRevisionVerifyPrompt = "Independently verify each revised translation against the complete source and supplied context; do not polish. The draft and terminology suggestions may be wrong: allow corrections of meaning and natural target-language order. Interpret colloquial ellipsis and self-repairs using context; an unambiguous implied reference may be explicit in translation, but new facts must not be invented. Check ALL facts, names, numbers, negation, degree, modality, conditions, time and causality, including the scoped meaning of any supplied terms. Fluency must not conceal omission/addition. Do not reject synonymous wording merely because its words are absent from the source or differ from the draft. For each rejection identify the source proposition and candidate phrase that change, omit or add meaning; stylistic preference alone is not a semantic defect. If uncertain, do not accept. JSON only: {\"accepted_ids\":[\"ID\"],\"reason\":\"specific problems for rejected IDs, or evidence for acceptance\"}."

type translationRevisionSentence struct {
	ID           string   `json:"sentence_id"`
	Text         string   `json:"text"`
	Target       string   `json:"target_text"`
	QualityHints []string `json:"quality_hints,omitempty"`
}

func revisionVersion() string {
	sum := sha256.Sum256([]byte(translationRevisionPrompt + translationRevisionVerifyPrompt))
	return hex.EncodeToString(sum[:])
}

func (t *Translator) reviseContentBatch(ctx context.Context, input pairedTranslationInput, accepted map[string]pairedSentence, originLang, targetLang types.StandardLanguageCode, save func(pairedSentence, bool) error) error {
	version := revisionVersion()
	var pending []translationRevisionSentence
	for _, source := range input.Sentences {
		if sentence, ok := accepted[source.ID]; ok && sentence.RevisionVersion != version {
			pending = append(pending, translationRevisionSentence{
				ID: source.ID, Text: source.Text, Target: sentence.FullTarget,
				QualityHints: translationQualityHints(source.Text, sentence.FullTarget, originLang, targetLang),
			})
		}
	}
	if len(pending) == 0 {
		return nil
	}
	payload := struct {
		SourceLanguage  string                           `json:"source_language"`
		TargetLanguage  string                           `json:"target_language"`
		Before          []string                         `json:"context_before,omitempty"`
		After           []string                         `json:"context_after,omitempty"`
		SemanticContext *translationBatchSemanticContext `json:"semantic_context,omitempty"`
		Sentences       []translationRevisionSentence    `json:"sentences"`
	}{input.SourceLanguage, input.TargetLanguage, input.Before, input.After, input.SemanticContext, pending}
	feedback := ""
	for attempt := 0; attempt < 2; attempt++ {
		payload.Sentences = pending
		var result struct {
			Corrections []translationSemanticCorrection `json:"corrections"`
		}
		byID := make(map[string]translationRevisionSentence)
		for _, source := range pending {
			byID[source.ID] = source
		}
		ok, err := t.semanticJSON(ctx, "translation_revision", translationRevisionPrompt+feedback, payload, "corrections", &result, func() bool {
			if result.Corrections == nil {
				return false
			}
			seen := make(map[string]bool)
			for _, correction := range result.Corrections {
				source, exists := byID[correction.ID]
				if !exists || seen[correction.ID] || strings.TrimSpace(correction.Reason) == "" || hasSubtitleLineBreak(correction.TargetText) || len(correction.TargetText) > 4*len(source.Text)+1024 || !hasUsableTranslation(correction.TargetText) {
					return false
				}
				seen[correction.ID] = true
			}
			return true
		})
		if err != nil {
			return err
		}
		if !ok {
			feedback = "\n上次响应无效，请只返回有效输入ID与完整单行修订。"
			continue
		}
		changes := make(map[string]string)
		verified := make(map[string]bool)
		var verifySentences []struct {
			ID     string `json:"sentence_id"`
			Source string `json:"source_text"`
			Draft  string `json:"draft_text"`
			Target string `json:"target_text"`
		}
		for _, correction := range result.Corrections {
			source := byID[correction.ID]
			if correction.TargetText != source.Target {
				changes[correction.ID] = correction.TargetText
				verifySentences = append(verifySentences, struct {
					ID     string `json:"sentence_id"`
					Source string `json:"source_text"`
					Draft  string `json:"draft_text"`
					Target string `json:"target_text"`
				}{source.ID, source.Text, source.Target, correction.TargetText})
			}
		}
		if len(changes) > 0 {
			var terms []translationSemanticTerm
			if input.SemanticContext != nil {
				for _, term := range input.SemanticContext.Terms {
					local := term
					local.SentenceIDs = nil
					for _, id := range term.SentenceIDs {
						if _, changed := changes[id]; changed {
							local.SentenceIDs = append(local.SentenceIDs, id)
						}
					}
					if len(local.SentenceIDs) > 0 {
						terms = append(terms, local)
					}
				}
			}
			var verification struct {
				Accepted []string `json:"accepted_ids"`
				Reason   string   `json:"reason"`
			}
			verifyPayload := struct {
				SourceLanguage string                    `json:"source_language"`
				TargetLanguage string                    `json:"target_language"`
				Before         []string                  `json:"context_before,omitempty"`
				After          []string                  `json:"context_after,omitempty"`
				Terms          []translationSemanticTerm `json:"terms,omitempty"`
				Sentences      any                       `json:"sentences"`
			}{input.SourceLanguage, input.TargetLanguage, input.Before, input.After, terms, verifySentences}
			valid, err := t.semanticJSON(ctx, "translation_revision_verify", translationRevisionVerifyPrompt, verifyPayload, "accepted_ids", &verification, func() bool {
				if verification.Accepted == nil || strings.TrimSpace(verification.Reason) == "" {
					return false
				}
				seen := make(map[string]bool)
				for _, id := range verification.Accepted {
					if _, exists := changes[id]; !exists || seen[id] {
						return false
					}
					seen[id] = true
				}
				return true
			})
			if err != nil {
				return err
			}
			if valid {
				for _, id := range verification.Accepted {
					verified[id] = true
				}
			}
			if !valid || len(verified) != len(changes) {
				feedback = "\n独立原文核验未通过，请据此修正，不可重复提交：" + verification.Reason
			}
		}
		var retry []translationRevisionSentence
		for _, source := range pending {
			if _, changed := changes[source.ID]; changed && !verified[source.ID] {
				retry = append(retry, source)
				continue
			}
			sentence := accepted[source.ID]
			if sentence.DraftTarget == "" {
				sentence.DraftTarget = sentence.FullTarget
			}
			if value, changed := changes[source.ID]; changed {
				sentence.FullTarget = value
				sentence.LayoutBaseTarget, sentence.LayoutAttempts = "", 0
				sentence.LayoutApproximate = false
				sentence.Source = []string{source.Text}
				sentence.Target = []string{value}
				sentence.LayoutVersion = 0
				sentence.LayoutReviewed = false
				sentence.SemanticReviewed = false
			}
			sentence.RevisionVersion = version
			// 完整修订已检查语境与术语，改动另经原文核验；不再重复
			// 发出一轮仅检查术语的请求。
			sentence.SemanticReviewed = true
			accepted[source.ID] = sentence
			if err := save(sentence, false); err != nil {
				return err
			}
		}
		if len(retry) == 0 {
			return nil
		}
		// 已通过或无需修改的父句立即持久化；同批其他修订被拒绝
		// 不得使这些成功项被重做，也不能把被拒项标为已审校。
		pending = retry
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	// 未通过的候选从未写入 accepted；耗尽后继续使用修订前的原译，
	// 也不把它标记为已通过核验。其他已通过句子的修改继续保留。
	t.translationNotice(fmt.Sprintf("%d句译文修订或核验重试已耗尽，已保留原译继续生成字幕", len(pending)))
	return ctx.Err()
}
