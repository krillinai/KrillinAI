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

func TestIsSilenceOnlyTextDoesNotTreatPlainParenthesizedTextAsSilence(t *testing.T) {
	if IsSilenceOnlyText("（你好）") {
		t.Fatalf("plain parenthesized text should not be silence-only")
	}
	if IsSilenceOnlyText("(普通说明)") {
		t.Fatalf("plain parenthesized text should not be silence-only")
	}
}

func TestIsSilenceOnlyTextDoesNotTreatMixedSpeechAsSilence(t *testing.T) {
	cases := []string{
		"背景音乐响起，但他说你好",
		"掌声之后，他继续讲话",
		"music starts and then hello",
	}
	for _, text := range cases {
		if IsSilenceOnlyText(text) {
			t.Fatalf("mixed speech %q should not be silence-only", text)
		}
	}
}
