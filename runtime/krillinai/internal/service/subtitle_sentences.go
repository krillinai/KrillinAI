package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/clipperhouse/uax29/v2/graphemes"
	"github.com/clipperhouse/uax29/v2/sentences"
	"github.com/clipperhouse/uax29/v2/words"
)

// 保留首字母缩写中的原始空白和字节坐标；只保护内部句界，末尾的点仍可能结束一句。
var subtitleInitialismPattern = regexp.MustCompile(`\p{Lu}\.(?:[\t \p{Zs}]*\p{Lu}\.)+`)

var translationIdentifierPattern = regexp.MustCompile(`(?i)(?:https?://|www\.)[^\s]+|[\p{L}\p{N}._%+\-]+@[\p{L}\p{N}.\-]+\.[\p{L}]+|[0-9]+(?:[.,:/][0-9]+)+(?:[%\p{L}\p{M}]*)`)

var translationNumberUnitPattern = regexp.MustCompile(`(?i)[0-9]+(?:[.,][0-9]+)*[\t \p{Zs}]*(?:km/h|m/s|kwh|mhz|ghz|khz|公里|千米|公斤|千克|厘米|毫米|毫升|毫秒|分钟|分鐘|小时|小時|км|кг|см|мм|мл|km|kg|cm|mm|ml|mg|ms|gb|mb|kb|hz|°c|°f|米|克|秒|元|%|٪|€|m|g|s)`)

func splitTranslationSentenceForBudget(text string, maxBytes int, language types.StandardLanguageCode) ([]string, error) {
	text = strings.TrimSpace(text)
	spans := translationProtectedSpans(text, language)
	var parts []string
	for start := 0; start < len(text); {
		rest := text[start:]
		if len(rest) <= maxBytes {
			if !hasSubtitleContent(rest) {
				return nil, fmt.Errorf("输入预算产生了没有实际内容的片段")
			}
			parts = append(parts, strings.TrimSpace(rest))
			break
		}
		canSplit := func(cut int) bool {
			return translationBudgetBoundaryAllowed(spans, start+cut, maxBytes)
		}
		cut := 0
		allowedCuts := make(map[int]bool)
		iter := graphemes.FromString(rest)
		for iter.Next() && iter.End() <= maxBytes {
			if canSplit(iter.End()) {
				cut = iter.End()
				allowedCuts[cut] = true
			}
		}
		if cut == 0 {
			return nil, fmt.Errorf("输入预算无法保留完整字素簇: %d 字节", maxBytes)
		}
		wordCut := 0
		wordIter := words.FromString(rest)
		for wordIter.Next() && wordIter.End() <= cut {
			if allowedCuts[wordIter.End()] {
				wordCut = wordIter.End()
			}
		}
		if wordCut >= cut/2 && wordCut > 0 {
			cut = wordCut
		}
		// 有足够上下文时优先选从句标点或连接词；800 字节只是最后的预算上限。
		clauseCut := 0
		for _, candidate := range translationClauseBoundaries(rest[:cut], language) {
			if candidate >= cut/2 && allowedCuts[candidate] {
				clauseCut = candidate
			}
		}
		if clauseCut > 0 {
			cut = clauseCut
		}
		if !hasSubtitleContent(rest[cut:]) {
			// 不能把最后的句号、引号等单独留成一个请求片段。
			wordIter := words.FromString(rest[:cut])
			previous := 0
			for wordIter.Next() {
				candidate := wordIter.End()
				if candidate < cut && allowedCuts[candidate] && hasSubtitleContent(rest[candidate:]) {
					previous = candidate
				}
			}
			if previous > 0 {
				cut = previous
			}
		}
		part := strings.TrimSpace(rest[:cut])
		if !hasSubtitleContent(part) {
			return nil, fmt.Errorf("输入预算产生了没有实际内容的片段")
		}
		parts = append(parts, part)
		start += cut
		start += len(text[start:]) - len(strings.TrimLeftFunc(text[start:], unicode.IsSpace))
	}
	return parts, nil
}

func translationProtectedSpans(text string, language types.StandardLanguageCode) []translationTextSpan {
	spans := translationLanguageSpans(text, language)
	for _, pattern := range []*regexp.Regexp{subtitleInitialismPattern, translationIdentifierPattern} {
		for _, match := range pattern.FindAllStringIndex(text, -1) {
			spans = append(spans, translationTextSpan{match[0], match[1]})
		}
	}
	for _, match := range translationNumberUnitPattern.FindAllStringIndex(text, -1) {
		if !types.LanguageUsesWordSpaces(language) || !translationWordContinues(text, match[1]) {
			spans = append(spans, translationTextSpan{match[0], match[1]})
		}
	}
	return spans
}

func translationBudgetBoundaryAllowed(spans []translationTextSpan, cut, maxBytes int) bool {
	for _, span := range spans {
		// 无法放进预算的超长词组交给字素级兜底，不能阻止整段翻译。
		if span.end-span.start <= maxBytes && cut > span.start && cut < span.end {
			return false
		}
	}
	return true
}

func translationClauseBoundaries(text string, language types.StandardLanguageCode) []int {
	var boundaries []int
	for offset, r := range text {
		if strings.ContainsRune(",;:，；：、،؛", r) {
			boundaries = append(boundaries, offset+utf8.RuneLen(r))
		}
	}
	rules := translationSentenceLanguages[types.NormalizeLanguage(string(language))]
	if rules.connector != nil {
		for _, match := range rules.connector.FindAllStringIndex(text, -1) {
			if match[0] == 0 || translationWordContinues(text, match[1]) && types.LanguageUsesWordSpaces(language) {
				continue
			}
			previous, _ := utf8.DecodeLastRuneInString(text[:match[0]])
			if types.LanguageUsesWordSpaces(language) && (unicode.IsLetter(previous) || unicode.IsMark(previous)) {
				continue
			}
			boundaries = append(boundaries, match[0])
		}
	}
	sort.Ints(boundaries)
	return boundaries
}

func splitTranslationSentences(text string, language types.StandardLanguageCode) []string {
	initialisms := subtitleInitialismPattern.FindAllStringIndex(text, -1)
	protected := translationLanguageSpans(text, language)
	for i := range protected {
		// 月份缩写等最后一个点也可能是真实句末；只无条件保护它内部的点。
		if text[protected[i].end-1] == '.' {
			protected[i].end--
		}
	}
	var result []string
	start := 0
	iter := sentences.FromString(text)
	for iter.Next() {
		end := iter.End()
		left := strings.TrimRightFunc(text[start:end], unicode.IsSpace)
		period := start + len(left) - 1
		if (strings.HasSuffix(left, ".") && translationSpanContains(protected, period)) || subtitleBoundaryContinuesAbbreviation(text, start, end, initialisms) {
			continue
		}
		if sentence := strings.TrimSpace(text[start:end]); sentence != "" {
			result = append(result, sentence)
		}
		start = end
	}
	if tail := strings.TrimSpace(text[start:]); tail != "" {
		result = append(result, tail)
	}
	return result
}

func subtitleBoundaryContinuesAbbreviation(text string, start, end int, initialisms [][]int) bool {
	next := strings.TrimSpace(text[end:])
	if next == "" {
		return false
	}
	left := strings.TrimRightFunc(text[start:end], unicode.IsSpace)
	// 闭引号、括号后的句界沿用 Unicode 判断，不能因引文末尾是缩写而吞并后句。
	if !strings.HasSuffix(left, ".") {
		return false
	}
	period := start + len(left) - 1
	first, _ := utf8.DecodeRuneInString(next)
	if index := sort.Search(len(initialisms), func(i int) bool { return initialisms[i][1] > period }); index < len(initialisms) && initialisms[index][0] <= period {
		span := initialisms[index]
		if period < span[1]-1 {
			return true
		}
		if period == span[1]-1 {
			// 句首连续首字母与随后的姓名连读；有完整前文的缩写保留其末尾句界。
			return !hasSubtitleContent(text[start:span[0]]) && unicode.IsUpper(first)
		}
	}
	fields := strings.Fields(left)
	if len(fields) == 0 {
		return false
	}
	last := fields[len(fields)-1]
	switch strings.ToLower(last) {
	case "no.":
		// No. 5 是编号；No. YouTube ... 中的 No 是独立否定句。
		return unicode.IsDigit(first)
	case "etc.", "inc.", "ltd.", "corp.", "co.", "jr.":
		// 这类后缀可位于真实句末，不再无条件合并下一句。
		return false
	}
	if subtitleAbbreviations[strings.ToLower(last)] {
		return true
	}
	initial, size := utf8.DecodeRuneInString(last)
	return unicode.IsUpper(initial) && last[size:] == "." && unicode.IsUpper(first)
}
