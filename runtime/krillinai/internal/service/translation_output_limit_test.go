package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestContentTranslationPreservesOriginalBatchBudget(t *testing.T) {
	texts := make([]string, 37)
	for i := range texts {
		texts[i] = fmt.Sprintf("Sentence %d.", i+1)
	}
	batches, err := buildPairedTranslationBatches(texts, "en", "zh_cn", 75, 100)
	if err != nil || len(batches) != 1 {
		t.Fatalf("sentences fitting the original budget must stay together: count=%d err=%v", len(batches), err)
	}
	requests := 0
	saved := map[string]int{}
	translator := &Translator{chatCompleter: budgetedTranslationTestCompleter{complete: func(_ context.Context, prompt string, limit int) (string, error) {
		requests++
		if limit <= 4096 || limit > 8192 {
			t.Fatalf("original output budget was changed: max_tokens=%d", limit)
		}
		var input translationContentInput
		if err := json.NewDecoder(strings.NewReader(strings.Split(prompt, "输入 JSON：\n")[1])).Decode(&input); err != nil {
			return "", err
		}
		var sentences []map[string]string
		for _, source := range input.Sentences {
			sentences = append(sentences, map[string]string{"sentence_id": source.ID, "target_text": "这是第" + source.ID + "句的完整译文。"})
		}
		response, err := json.Marshal(map[string]any{"sentences": sentences})
		return string(response), err
	}}}
	for _, batch := range batches {
		budget := 0
		for _, source := range batch.Sentences {
			budget += 2*len(source.Text) + 128
		}
		if budget <= 4096 || budget > translationOutputBudget {
			t.Fatalf("fixture must exercise the original batch budget above 4096: %d", budget)
		}
		remaining, err := translator.translateContentBatch(context.Background(), batch, "en", "zh_cn", func(sentence pairedSentence, _ bool) error {
			saved[sentence.ID]++
			return nil
		})
		if err != nil || len(remaining.Sentences) != 0 {
			t.Fatalf("translation incomplete: remaining=%d err=%v", len(remaining.Sentences), err)
		}
	}
	if requests != len(batches) || len(saved) != 37 {
		t.Fatalf("unexpected retries or missing translations: requests=%d batches=%d saved=%d", requests, len(batches), len(saved))
	}
	for id, count := range saved {
		if count != 1 {
			t.Fatalf("sentence %s translated more than once: %d", id, count)
		}
	}
}

func TestTranslationRequestsPreserveOriginalOutputBudget(t *testing.T) {
	var budgets []int
	translator := &Translator{chatCompleter: budgetedTranslationTestCompleter{complete: func(_ context.Context, _ string, limit int) (string, error) {
		budgets = append(budgets, limit)
		return "complete", nil
	}}}
	for _, requested := range []int{2048, 4096, 6500, 8192} {
		if _, err := translator.requestTranslation(context.Background(), "translate", requested); err != nil {
			t.Fatal(err)
		}
	}
	for i, expected := range []int{2048, 4096, 6500, 8192} {
		if budgets[i] != expected {
			t.Fatalf("requested output budget was silently changed: %v", budgets)
		}
	}
}
