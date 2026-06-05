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

func TestLLMOptimizerHandlesNilChatAndEmptyResponse(t *testing.T) {
	if got, err := NewLLMOptimizer(nil).Optimize(context.Background(), "原文", 1.2, "test"); err != nil || got != "原文" {
		t.Fatalf("nil chat Optimize() = %q, %v", got, err)
	}
	chat := &fakeChat{response: "   \n"}
	got, err := NewLLMOptimizer(chat).Optimize(context.Background(), "原文", 1.2, "test")
	if err != nil || got != "原文" {
		t.Fatalf("empty response Optimize() = %q, %v", got, err)
	}
}

func TestLLMOptimizerHandlesNilAndCancelledContext(t *testing.T) {
	chat := &fakeChat{response: "改写"}
	got, err := NewLLMOptimizer(chat).Optimize(nil, "原文", 1.2, "test")
	if err != nil || got != "改写" {
		t.Fatalf("nil context Optimize() = %q, %v", got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := NewLLMOptimizer(chat).Optimize(ctx, "原文", 1.2, "test"); err == nil {
		t.Fatalf("cancelled context should return error")
	}
}

func TestLLMOptimizerCancelledContextWinsBeforeNilChat(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := NewLLMOptimizer(nil).Optimize(ctx, "原文", 1.2, "test"); err == nil {
		t.Fatalf("cancelled context with nil chat should return error")
	}
}
