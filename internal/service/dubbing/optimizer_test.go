package dubbing

import (
	"context"
	"testing"
)

type fakeChat struct {
	response string
	query    string
	err      error
}

func (f *fakeChat) ChatCompletion(query string) (string, error) {
	f.query = query
	return f.response, f.err
}

func TestLLMOptimizerReturnsSingleLineTrimmedText(t *testing.T) {
	chat := &fakeChat{response: "  更自然的说法\n"}
	opt := NewLLMOptimizer(chat)
	got, err := opt.Optimize(context.Background(), "字幕腔文本", 2.5, "estimated_too_long")
	if err != nil {
		t.Fatalf("Optimize() error = %v", err)
	}
	if got != "更自然的说法" {
		t.Fatalf("Optimize() = %q", got)
	}
	if chat.query == "" {
		t.Fatalf("expected optimizer to call chat")
	}
}
