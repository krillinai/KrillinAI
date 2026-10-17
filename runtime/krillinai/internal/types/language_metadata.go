package types

import (
	"fmt"
	"strings"
)

type LanguageMetadata struct {
	Code, NativeName, EnglishName, ChineseName, Script, Direction string
	WordSpaces, SourcePreferred, Speech                           bool
	Aliases                                                       []string
}

func NormalizeLanguage(value string) StandardLanguageCode {
	code := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(value)), "_", "-")
	switch code {
	case "zh-tw", "zh-hant", "zh-hk", "zh-mo":
		return "zh_tw"
	case "zh", "zh-cn", "zh-hans", "zh-sg":
		return "zh_cn"
	}
	base := strings.Split(code, "-")[0]
	for _, language := range LanguageCatalog {
		if language.Code == base {
			return StandardLanguageCode(language.Code)
		}
		for _, alias := range language.Aliases {
			if alias == base {
				return StandardLanguageCode(language.Code)
			}
		}
	}
	return StandardLanguageCode(code)
}

func LookupLanguage(code StandardLanguageCode) (LanguageMetadata, bool) {
	code = NormalizeLanguage(string(code))
	for _, language := range LanguageCatalog {
		if language.Code == string(code) {
			return language, true
		}
	}
	return LanguageMetadata{}, false
}

func LanguageUsesWordSpaces(code StandardLanguageCode) bool {
	language, ok := LookupLanguage(code)
	return !ok || language.WordSpaces
}

func WhisperLanguageCode(value string) string {
	switch code := NormalizeLanguage(value); code {
	case "zh_cn", "zh_tw":
		return "zh"
	case "fil":
		return "tl"
	case "jv":
		return "jw"
	default:
		return string(code)
	}
}

func RecognitionLanguageCode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "chinese":
		return "zh_cn"
	case "tagalog":
		return "fil"
	}
	for _, language := range LanguageCatalog {
		if strings.EqualFold(language.EnglishName, strings.TrimSpace(value)) {
			return language.Code
		}
	}
	return string(NormalizeLanguage(value))
}

func ValidateWhisperLanguage(language, model string) error {
	if language == "" || language == "auto" {
		return nil
	} // Preserve standalone CLI auto support.
	code := string(NormalizeLanguage(language))
	languages := WhisperV2Languages
	switch model {
	case "tiny.en", "base.en", "small.en", "medium.en":
		languages = []string{"en"}
	case "large-v3", "large-v3-turbo", "turbo":
		languages = WhisperV3Languages
	case "tiny", "base", "small", "medium", "large-v1", "large-v2":
	default:
		return nil // Unidentified custom models have unknown coverage.
	}
	for _, supported := range languages {
		if supported == code {
			return nil
		}
	}
	return fmt.Errorf("Whisper model %s does not support language %s; change the speech recognition service or import source subtitles", model, code)
}
