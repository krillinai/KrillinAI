package service

import (
	"krillin-ai/internal/types"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

type translationLanguageRules struct {
	// 这里只列需要后接内容的称谓、引导缩写；可独立位于句末的 etc./usw. 不在此列。
	continuations string
	months        string
	connectors    string
	abbreviation  *regexp.Regexp
	date          *regexp.Regexp
	connector     *regexp.Regexp
}

var translationSentenceLanguages = makeTranslationSentenceLanguages()

func makeTranslationSentenceLanguages() map[types.StandardLanguageCode]translationLanguageRules {
	rules := map[types.StandardLanguageCode]translationLanguageRules{
		"en":    {continuations: "Dr.|Mr.|Mrs.|Ms.|Prof.|Fig.|Vol.|e. g.|i. e.", connectors: "because|although|whereas|unless|but"},
		"de":    {continuations: "Dr.|Prof.|Hr.|Fr.|Dipl.-Ing.|z. B.|d. h.|u. a.|u. U.|bzw.|vgl.|Nr.|Abb.|S.", months: "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan.|Feb.|Mär.|Apr.|Jun.|Jul.|Aug.|Sep.|Sept.|Okt.|Nov.|Dez.", connectors: "aber|weil|obwohl|während|sondern"},
		"fr":    {continuations: "M.|Mme.|Mmes.|Mlle.|Mlles.|Dr.|Dre.|Pr.|Me.|p. ex.|c.-à-d.|cf.", connectors: "mais|parce que|bien que|lorsque|cependant"},
		"es":    {continuations: "Sr.|Sra.|Sres.|Srta.|Dr.|Dra.|Prof.|Profa.|Ud.|Uds.|p. ej.|núm.|pág.", connectors: "pero|porque|aunque|mientras|sin embargo"},
		"pt":    {continuations: "Sr.|Sra.|Srs.|Sras.|Dr.|Dra.|Prof.|Profa.|Exmo.|Exma.|p. ex.|pág.", connectors: "mas|porque|embora|enquanto|porém"},
		"it":    {continuations: "Sig.|Sig.ra|Sig.na|Sigg.|Dott.|Dott.ssa|Prof.|Prof.ssa|Ing.|Avv.|ad es.|pag.", connectors: "ma|perché|sebbene|mentre|tuttavia"},
		"ru":    {continuations: "проф.|доц.|акад.|д-р.|тов.|им.|ул.|стр.|рис.|напр.|т. е.|т. к.|т. н.", connectors: "но|потому что|хотя|однако"},
		"uk":    {continuations: "проф.|доц.|акад.|ім.|вул.|стор.|рис.|напр.|т. е.", connectors: "але|тому що|хоча|однак"},
		"hi":    {continuations: "डॉ.|प्रो.|श्री.|श्रीमती.", connectors: "लेकिन|क्योंकि|हालांकि"},
		"bn":    {continuations: "ডা.|ডঃ.|প্রফে.", connectors: "কিন্তু|কারণ|যদিও"},
		"mr":    {continuations: "डॉ.|प्रा.|श्री.|सौ.", connectors: "पण|कारण|मात्र"},
		"nl":    {continuations: "dhr.|mevr.|dr.|prof.|mr.|ir.|bijv.|d. w. z.", connectors: "maar|omdat|hoewel|terwijl"},
		"pl":    {continuations: "prof.|hab.|inż.|mgr.|np.|tzn.|ul.|str.", connectors: "ale|ponieważ|chociaż|jednak"},
		"cs":    {continuations: "Ing.|prof.|doc.|např.|tj.|č.", months: "ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince"},
		"sk":    {continuations: "Ing.|prof.|doc.|napr.|t. j.|č.", months: "januára|februára|marca|apríla|mája|júna|júla|augusta|septembra|októbra|novembra|decembra"},
		"da":    {continuations: "hr.|fru.|dr.|prof.|f. eks.|dvs.", months: "januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december"},
		"no":    {continuations: "hr.|fru.|dr.|prof.|f. eks.|dvs.", months: "januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember"},
		"fi":    {continuations: "prof.|esim.|mm.|ns.", months: "tammikuuta|helmikuuta|maaliskuuta|huhtikuuta|toukokuuta|kesäkuuta|heinäkuuta|elokuuta|syyskuuta|lokakuuta|marraskuuta|joulukuuta"},
		"sv":    {continuations: "dr.|prof.|t. ex.|dvs.|bl. a."},
		"tr":    {continuations: "Dr.|Prof.|Doç.|Sn.|örn."},
		"vi":    {continuations: "TS.|ThS.|PGS.|GS.|BS."},
		"id":    {continuations: "Dr.|dr.|Prof.|Bpk.|Sdr."},
		"zh_cn": {connectors: "但是|然而|因为|所以|虽然"},
		"zh_tw": {connectors: "但是|然而|因為|所以|雖然"},
		"ja":    {connectors: "しかし|けれども|それでも|ところが"},
		"ko":    {connectors: "하지만|그러나|그래서|그런데"},
	}
	for language, rule := range rules {
		if rule.continuations != "" {
			// 把缩写及紧随其后的词一起保护；同时修复多点缩写内部和末尾的假句界。
			rule.abbreviation = regexp.MustCompile(`(?i)(?:` + translationAlternatives(rule.continuations) + `)[\t \p{Zs}]+[\p{L}\p{N}][\p{L}\p{M}\p{N}'’\-]*`)
		}
		if rule.months != "" {
			rule.date = regexp.MustCompile(`(?i)(?:[12]?[0-9]|3[01])\.[\t \p{Zs}]+(?:` + translationAlternatives(rule.months) + `)(?:[\t \p{Zs}]+[0-9]{4})?`)
		}
		if rule.connectors != "" {
			rule.connector = regexp.MustCompile(`(?i)(?:` + translationAlternatives(rule.connectors) + `)`)
		}
		rules[language] = rule
	}
	return rules
}

func translationAlternatives(list string) string {
	parts := strings.Split(list, "|")
	for i, part := range parts {
		parts[i] = strings.ReplaceAll(regexp.QuoteMeta(part), " ", `[\t \p{Zs}]*`)
	}
	return strings.Join(parts, "|")
}

type translationTextSpan struct{ start, end int }

func translationWordContinues(text string, at int) bool {
	if at < 0 || at >= len(text) {
		return false
	}
	r, _ := utf8.DecodeRuneInString(text[at:])
	return unicode.IsLetter(r) || unicode.IsMark(r) || unicode.IsDigit(r)
}

func translationPatternSpans(text string, pattern *regexp.Regexp) []translationTextSpan {
	if pattern == nil {
		return nil
	}
	var spans []translationTextSpan
	for _, match := range pattern.FindAllStringIndex(text, -1) {
		if match[0] > 0 {
			previous, _ := utf8.DecodeLastRuneInString(text[:match[0]])
			if unicode.IsLetter(previous) || unicode.IsMark(previous) || unicode.IsDigit(previous) {
				continue
			}
		}
		if !translationWordContinues(text, match[1]) {
			spans = append(spans, translationTextSpan{match[0], match[1]})
		}
	}
	return spans
}

func translationLanguageSpans(text string, language types.StandardLanguageCode) []translationTextSpan {
	rules := translationSentenceLanguages[types.NormalizeLanguage(string(language))]
	spans := translationPatternSpans(text, rules.abbreviation)
	return append(spans, translationPatternSpans(text, rules.date)...)
}

func translationSpanContains(spans []translationTextSpan, position int) bool {
	for _, span := range spans {
		if position > span.start && position < span.end {
			return true
		}
	}
	return false
}
