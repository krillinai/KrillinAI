package dubbing

import (
	"regexp"
	"strings"
)

var (
	parenNoisePattern = regexp.MustCompile(`(?i)[(（][^()（）]*(music|applause|laughter|laugh|noise|sound|silence|inaudible|掌声|音乐|笑声|噪音|静音)[^()（）]*[)）]`)
	spacePattern      = regexp.MustCompile(`\s+`)
)

func CleanTextForSpeech(text string) string {
	text = parenNoisePattern.ReplaceAllString(text, "")
	text = strings.ReplaceAll(text, "&", "")
	text = strings.ReplaceAll(text, "®", "")
	text = strings.ReplaceAll(text, "™", "")
	text = strings.ReplaceAll(text, "©", "")
	text = strings.ReplaceAll(text, "——", "")
	text = strings.ReplaceAll(text, "--", "")
	text = strings.ReplaceAll(text, "-", "")
	text = spacePattern.ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func IsSilenceOnlyText(text string) bool {
	return CleanTextForSpeech(text) == ""
}
