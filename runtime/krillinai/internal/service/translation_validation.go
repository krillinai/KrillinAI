package service

import (
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"strings"
	"unicode"
	"unicode/utf8"

	"go.uber.org/zap"
)

// 可用性只检查字幕文本结构，适用于全部语言。它不代表译文已通过语义审校。
// 不以字符种类、专名白名单或原译相同来拒绝初译，也不把数字转换成目标语言。
func translationTextIssue(text string) string {
	if strings.TrimSpace(text) == "" {
		return "empty_target_text"
	}
	if !hasSubtitleContent(text) {
		return "target_has_no_content"
	}
	if hasSubtitleLineBreak(text) {
		return "target_contains_line_break"
	}
	return ""
}

func hasUsableTranslation(text string) bool {
	return translationTextIssue(text) == ""
}

// 疑点只供现有多语言审校参考，不决定初译成败。数值、单位及语义是否
// 正确由审校结合上下文判断，不做跨语言不可靠的数字格式或字母比例比较。
func translationQualityHints(source, target string, sourceLang, targetLang types.StandardLanguageCode) []string {
	var hints []string
	if types.NormalizeLanguage(string(sourceLang)) != types.NormalizeLanguage(string(targetLang)) &&
		strings.ContainsFunc(source, unicode.IsLetter) &&
		strings.EqualFold(strings.Join(strings.Fields(source), " "), strings.Join(strings.Fields(target), " ")) {
		hints = append(hints, "unchanged_text_check_meaning_but_allow_names_urls_and_shared_words")
	}
	if translationHasHesitationLeak(source, target, sourceLang, targetLang) {
		hints = append(hints, "possible_nonsemantic_hesitation_residue")
	}
	if utf8.RuneCountInString(target) > 4*utf8.RuneCountInString(source)+1024 {
		hints = append(hints, "unusually_long_output_check_for_additions")
	}
	return hints
}

func (t *Translator) noteTranslationCandidate(source pairedTranslationSource, sentence pairedSentence, originLang, targetLang types.StandardLanguageCode) {
	if hints := translationQualityHints(source.Text, sentence.FullTarget, originLang, targetLang); len(hints) > 0 {
		log.GetLogger().Warn("初译已保存，内容疑点交由审校处理",
			zap.String("sentence_id", source.ID), zap.String("source_language", string(originLang)),
			zap.String("target_language", string(targetLang)), zap.Strings("quality_hints", hints))
	}
}

func noteTranslationTextIssue(stage, id, reason string, attempt int) {
	log.GetLogger().Warn("本次未取得可用翻译文本",
		zap.String("stage", stage), zap.String("sentence_id", id),
		zap.String("reason", reason), zap.Int("attempt", attempt))
}
