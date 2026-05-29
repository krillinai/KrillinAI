package pipeline

import "testing"

func TestRenderCoverPrompt(t *testing.T) {
	template := "{{title}}\n{{target_language}}\n{{style_hint}}"
	got := RenderCoverPrompt(template, CoverPromptData{
		Title:          "原始标题",
		TargetLanguage: "zh_cn",
		StyleHint:      "Bilibili 科技封面",
	})
	want := "原始标题\nzh_cn\nBilibili 科技封面"
	if got != want {
		t.Fatalf("RenderCoverPrompt() = %q, want %q", got, want)
	}
}
