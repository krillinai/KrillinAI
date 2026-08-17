package util

import (
	"encoding/json"
	"testing"
)

// Regression for #291: LLM responses (especially local models via Ollama)
// wrap JSON in markdown, prepend conversational text, or emit trailing commas,
// which made encoding/json fail in audio2subtitle.go. ExtractJSON must recover
// parseable JSON from the exact payloads reported in the issue.

func TestExtractJSONTrailingComma(t *testing.T) {
	// Scenario 1 from the issue: trailing commas after the last element.
	response := "{\n\"short_sentences\":[{\n\"text\": \"And the reason why they chose the owl is because\",\n},\n{\n\"text\": \"the owl is a symbol used in Europe\",\n}] \n}"

	var out struct {
		ShortSentences []struct {
			Text string `json:"text"`
		} `json:"short_sentences"`
	}
	if err := json.Unmarshal([]byte(ExtractJSON(response)), &out); err != nil {
		t.Fatalf("expected valid JSON after ExtractJSON, got error: %v\ncleaned: %q", err, ExtractJSON(response))
	}
	if len(out.ShortSentences) != 2 {
		t.Fatalf("expected 2 short_sentences, got %d", len(out.ShortSentences))
	}
	if out.ShortSentences[0].Text != "And the reason why they chose the owl is because" {
		t.Fatalf("unexpected first sentence: %q", out.ShortSentences[0].Text)
	}
}

func TestExtractJSONConversationalPrefix(t *testing.T) {
	// Scenario 2 from the issue: a Chinese conversational prefix before the JSON.
	response := "以下是分割后的结果：\n\n\n{\n  \"align\": [\n    { \"origin_part\": \"I want to show you\", \"translated_part\": \"Ich möchte es Ihnen zeigen\" }\n  ]\n}\n"

	var out struct {
		Align []struct {
			OriginPart     string `json:"origin_part"`
			TranslatedPart string `json:"translated_part"`
		} `json:"align"`
	}
	if err := json.Unmarshal([]byte(ExtractJSON(response)), &out); err != nil {
		t.Fatalf("expected valid JSON after ExtractJSON, got error: %v\ncleaned: %q", err, ExtractJSON(response))
	}
	if len(out.Align) != 1 {
		t.Fatalf("expected 1 align entry, got %d", len(out.Align))
	}
	if out.Align[0].TranslatedPart != "Ich möchte es Ihnen zeigen" {
		t.Fatalf("unexpected translated_part: %q", out.Align[0].TranslatedPart)
	}
}

func TestExtractJSONMarkdownAndPrefix(t *testing.T) {
	// Combined: conversational prefix + markdown code fence + trailing comma.
	response := "Sure, here is the result:\n```json\n{\n  \"align\": [\n    { \"origin_part\": \"a\", \"translated_part\": \"b\" },\n  ]\n}\n```"

	var out struct {
		Align []struct {
			OriginPart     string `json:"origin_part"`
			TranslatedPart string `json:"translated_part"`
		} `json:"align"`
	}
	if err := json.Unmarshal([]byte(ExtractJSON(response)), &out); err != nil {
		t.Fatalf("expected valid JSON after ExtractJSON, got error: %v\ncleaned: %q", err, ExtractJSON(response))
	}
	if len(out.Align) != 1 || out.Align[0].OriginPart != "a" {
		t.Fatalf("unexpected result: %+v", out.Align)
	}
}

func TestExtractJSONCleanInputUnchanged(t *testing.T) {
	// Already-valid JSON must round-trip unchanged.
	response := `{"align":[{"origin_part":"x","translated_part":"y"}]}`
	if got := ExtractJSON(response); got != response {
		t.Fatalf("clean JSON was altered:\n got: %q\nwant: %q", got, response)
	}
}

func TestExtractJSONNoJSONReturnsTrimmed(t *testing.T) {
	// No object/array delimiters: return the trimmed fence-stripped string so
	// the caller still surfaces the original parse error.
	response := "  no json here  "
	if got := ExtractJSON(response); got != "no json here" {
		t.Fatalf("expected trimmed passthrough, got %q", got)
	}
}
