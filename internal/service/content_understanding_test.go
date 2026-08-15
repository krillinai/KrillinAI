package service

import (
	"strings"
	"testing"
)

func TestWithVideoContext(t *testing.T) {
	const prompt = "Translate the target sentence."

	// Empty summary leaves the prompt untouched (default, non-breaking path).
	if got := withVideoContext("", prompt); got != prompt {
		t.Fatalf("withVideoContext(empty) = %q, want unchanged prompt", got)
	}
	if got := withVideoContext("   ", prompt); got != prompt {
		t.Fatalf("withVideoContext(whitespace) = %q, want unchanged prompt", got)
	}

	// Non-empty summary is prepended and the original prompt is preserved.
	summary := "A cooking show in a bright kitchen."
	got := withVideoContext(summary, prompt)
	if !strings.Contains(got, summary) {
		t.Fatalf("withVideoContext result missing summary: %q", got)
	}
	if !strings.HasSuffix(got, prompt) {
		t.Fatalf("withVideoContext result should end with original prompt: %q", got)
	}
	if !strings.Contains(got, "[VIDEO CONTEXT]") {
		t.Fatalf("withVideoContext result missing context header: %q", got)
	}
}
