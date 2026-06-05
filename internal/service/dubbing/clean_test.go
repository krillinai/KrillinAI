package dubbing

import "testing"

func TestCleanTextForSpeechRemovesNoiseButKeepsMeaning(t *testing.T) {
	got := CleanTextForSpeech("（掌声）  你好——世界 & ™ ")
	if got != "你好世界" {
		t.Fatalf("CleanTextForSpeech() = %q", got)
	}
}

func TestIsSilenceOnlyText(t *testing.T) {
	if !IsSilenceOnlyText("（音乐）") {
		t.Fatalf("music cue should be silence-only")
	}
	if IsSilenceOnlyText("你好") {
		t.Fatalf("spoken text should not be silence-only")
	}
}
