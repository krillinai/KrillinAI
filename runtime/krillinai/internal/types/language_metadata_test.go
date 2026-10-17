package types

import "testing"

func TestLanguageMetadataAndWhisperProfiles(t *testing.T) {
	for _, test := range []struct{ input, product, backend string }{
		{"zh-TW", "zh_tw", "zh"}, {"tl", "fil", "tl"}, {"jw", "jv", "jw"}, {"iw", "he", "he"},
	} {
		if string(NormalizeLanguage(test.input)) != test.product || WhisperLanguageCode(test.input) != test.backend {
			t.Fatalf("mapping %s", test.input)
		}
	}
	if RecognitionLanguageCode("German") != "de" || RecognitionLanguageCode("Chinese") != "zh_cn" || RecognitionLanguageCode("tl") != "fil" || RecognitionLanguageCode("Tagalog") != "fil" {
		t.Fatal("recognition language mapping")
	}
	preferred := 0
	for _, language := range LanguageCatalog {
		if language.SourcePreferred {
			preferred++
			if err := ValidateWhisperLanguage(language.Code, "large-v2"); err != nil {
				t.Fatal(err)
			}
		}
	}
	if preferred != 52 {
		t.Fatalf("preferred sources: %d", preferred)
	}
	if ValidateWhisperLanguage("yue", "large-v2") == nil || ValidateWhisperLanguage("yue", "large-v3-turbo") != nil {
		t.Fatal("model-specific Cantonese coverage")
	}
	if ValidateWhisperLanguage("hi", "tiny.en") == nil {
		t.Fatal("English-only model accepted Hindi")
	}
	if !LanguageUsesWordSpaces("ko") || LanguageUsesWordSpaces("th") {
		t.Fatal("word spacing metadata")
	}
	if GetStandardLanguageName("unlisted") != "unlisted" {
		t.Fatal("lost unknown historical code")
	}
}
