package service

import (
	"krillin-ai/internal/types"
	"regexp"
	"strings"
	"unicode"
)

// 默认的字幕内容规范，不依赖音频入口的 modal_filter 开关。只省略无语义
// 的发声，不删除表达肯定、否定、不确定性、情绪或被讨论/引用的词。
const translationFillerPolicy = `仅译文忽略无实际语义的犹豫音（包括连续重复），原文必须完整保留。
Subtitle speech cleanup: omit nonsemantic hesitation sounds, e.g. English uh/um/erm, French euh, German äh/ähm, or en/嗯 when context clearly identifies a hesitation. Do not render them as 嗯、呃 or copy them into the target. Apply during drafting, editing, alignment and review; omission is not lost meaning. Preserve actual words (Spanish/French en, German um), affirmative mm-hmm/嗯, negation, uncertainty, emotion, and quoted/demonstrated sounds. Never delete by substring. In segmented-ID tasks ONLY, a group of ONLY unambiguous hesitation sounds may have an empty translation. In complete-parent/layout tasks, absorb such a group into an adjacent nonempty pair. Never invent content or repeat a neighbor to fill a group. All other groups need nonempty contextual translations.`

func withTranslationFillerPolicy(prompt string) string {
	if strings.Contains(prompt, translationFillerPolicy) {
		return prompt
	}
	// 保持任务名在首行，输入 JSON 和编辑表仍在提示末尾。
	if before, after, ok := strings.Cut(prompt, "\n输入 JSON：\n"); ok {
		return before + "\n" + translationFillerPolicy + "\n输入 JSON：\n" + after
	}
	return prompt + "\n" + translationFillerPolicy
}

var hesitationTokens = map[types.StandardLanguageCode]*regexp.Regexp{
	"en":    regexp.MustCompile(`^(?:uh+|um+|erm+|er+)$`),
	"fr":    regexp.MustCompile(`^euh+$`),
	"de":    regexp.MustCompile(`^(?:äh+m*|aeh+m*)$`),
	"zh_cn": regexp.MustCompile(`^呃+$`),
	"zh_tw": regexp.MustCompile(`^呃+$`),
}

func hesitationWords(text string) []string {
	return strings.FieldsFunc(text, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) })
}

var hesitationSingleQuote = regexp.MustCompile(`(?:^|[^\p{L}\p{N}])['‘][^'’\n]*['’](?:$|[^\p{L}\p{N}])`)

func hesitationQuoted(text string) bool {
	return strings.ContainsAny(text, "\"“”«»「」『』`") || hesitationSingleQuote.MatchString(text)
}

// 极保守的自动省略判定：语言内完整词匹配；疑问/感叹、引语、缩写、
// 肯定音及有歧义的 en/嗯 不自动省略，交给完整句的语境翻译。
func nonSemanticHesitationOnly(text string, language types.StandardLanguageCode) bool {
	if hesitationQuoted(text) || strings.ContainsAny(text, "?!？！") || strings.ContainsFunc(text, unicode.IsSymbol) {
		return false
	}
	language = types.NormalizeLanguage(string(language))
	pattern := hesitationTokens[language]
	if pattern == nil {
		return false
	}
	words := hesitationWords(text)
	if len(words) == 0 {
		return false
	}
	for _, word := range words {
		// 英文/中文转录里连续小写 en 视为重复发声；单独 en 和
		// 法语/西语 en 保持歧义，不用通用停用词表删掉。
		repeatedEn := word == "en" && len(words) > 1 && (language == "en" || language == "zh_cn" || language == "zh_tw")
		if word == strings.ToUpper(word) && strings.ToLower(word) != word || !pattern.MatchString(strings.ToLower(word)) && !repeatedEn {
			return false
		}
	}
	// 连字符可能表示肯定音（uh-huh）或词的一部分；不猜测。
	return !strings.ContainsAny(text, "-/\\@0123456789")
}

// 合并仅有犹豫音的 NLP 意群，用完整原文切片保留字节位置和标点。
// 先与后段合并，句尾则并入前段；后续仍正常执行单行长度检查。
func mergeHesitationSourceUnits(text string, units []segmentedTranslationUnit, language types.StandardLanguageCode) []segmentedTranslationUnit {
	for i := 0; i < len(units) && len(units) > 1; {
		if !nonSemanticHesitationOnly(units[i].Source, language) {
			i++
			continue
		}
		left := i
		if i == len(units)-1 {
			left--
		}
		units[left].End = units[left+1].End
		units[left].Source = text[units[left].Start:units[left].End]
		units[left].OriginIDs = append(units[left].OriginIDs, units[left+1].OriginIDs...)
		units = append(units[:left+1], units[left+2:]...)
		i = left
	}
	return units
}

// 不事后删除中文字符。对可明确识别的发声残留拒绝候选，让原有的
// 局部重试/审查修复；有意义的单个“嗯”和所有引语不受规则误删。
func translationHasHesitationLeak(source, target string, sourceLang, targetLang types.StandardLanguageCode) bool {
	if hesitationQuoted(source) || hesitationQuoted(target) {
		return false
	}
	has := func(text string, lang types.StandardLanguageCode) bool {
		for _, word := range hesitationWords(text) {
			if nonSemanticHesitationOnly(word, lang) {
				return true
			}
		}
		return false
	}
	if !has(source, sourceLang) {
		return false
	}
	if has(target, targetLang) {
		return true
	}
	// 中文发声和正常词通常没有空格，用完整分隔段匹配，不能截词。
	if types.NormalizeLanguage(string(targetLang)) == "zh_cn" || types.NormalizeLanguage(string(targetLang)) == "zh_tw" {
		for _, word := range hesitationWords(target) {
			if strings.Trim(word, "呃") == "" && word != "" {
				return true
			}
		}
	}
	return false
}
