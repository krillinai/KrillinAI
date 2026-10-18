package service

import (
	"context"
	"strings"
	"testing"
)

func TestTranslationGlossaryReachesProviderAndIsRequestScoped(t *testing.T) {
	entries := []TranslationGlossaryEntry{{Source: "OpenCreator", Translation: "开放创作", Note: "Product name"}, {Source: "Unrelated", Translation: "无关"}, {Source: "API", Translation: "API"}}
	ctx := WithTranslationGlossary(context.Background(), entries)
	entries[0].Translation = "mutated"
	completer := translationCompleterFunc(func(prompt string) (string, error) {
		if !strings.Contains(prompt, `"translation":"开放创作"`) || !strings.Contains(prompt, `"translation":"API"`) {
			t.Fatalf("provider missed frozen glossary: %s", prompt)
		}
		if strings.Contains(prompt, "Unrelated") {
			t.Fatal("unrelated terms should not bloat provider prompts")
		}
		return "ok", nil
	})
	if _, err := chatCompletionWithContext(ctx, completer, "Translate OpenCreator API"); err != nil {
		t.Fatal(err)
	}
	if got := translationGlossaryPrompt(context.Background(), "OpenCreator"); got != "OpenCreator" {
		t.Fatal("glossary leaked into another task")
	}
}
