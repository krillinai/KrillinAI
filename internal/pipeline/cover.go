package pipeline

import "strings"

type CoverPromptData struct {
	Title          string
	Description    string
	OriginLanguage string
	TargetLanguage string
	StyleHint      string
}

func RenderCoverPrompt(tmpl string, data CoverPromptData) string {
	replacer := strings.NewReplacer(
		"{{title}}", data.Title,
		"{{description}}", data.Description,
		"{{origin_language}}", data.OriginLanguage,
		"{{target_language}}", data.TargetLanguage,
		"{{style_hint}}", data.StyleHint,
	)
	return replacer.Replace(tmpl)
}
