package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"testing"
)

// TestTranslatorSplitOriginLongSentenceToleratesLLMNoise 覆盖 Translator 上与
// Service 同形的解析点（translate.go），确保 issue #291 的两类响应在这里同样被容忍。
func TestTranslatorSplitOriginLongSentenceToleratesLLMNoise(t *testing.T) {
	log.InitLogger()
	tests := []struct {
		name     string
		response string
	}{
		{
			name:     "尾随逗号",
			response: "{\n\"short_sentences\":[{\n\"text\": \"And the reason why they chose the owl is because\",\n},\n{\n\"text\": \"the owl is a symbol used in Europe\",\n}] \n}",
		},
		{
			name:     "中文对话式前缀",
			response: "以下是分割后的结果：\n\n\n{\n  \"short_sentences\": [\n    { \"text\": \"And the reason why they chose the owl is because\" },\n    { \"text\": \"the owl is a symbol used in Europe\" }\n  ]\n}\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			completer := &scriptedCompleter{responses: []string{tt.response}}
			translator := &Translator{chatCompleter: completer}

			sentences, err := translator.splitOriginLongSentence("And the reason why they chose the owl is because the owl is a symbol used in Europe")
			if err != nil {
				t.Fatalf("splitOriginLongSentence() error = %v, want nil", err)
			}
			if completer.calls != 1 {
				t.Fatalf("ChatCompletion 调用次数 = %d, want 1（无需重试）", completer.calls)
			}
			want := []string{
				"And the reason why they chose the owl is because",
				"the owl is a symbol used in Europe",
			}
			if fmt.Sprint(sentences) != fmt.Sprint(want) {
				t.Fatalf("sentences = %v, want %v", sentences, want)
			}
		})
	}
}

// TestBatchTranslateTextsToleratesConversationalPrefix 覆盖批量翻译的解析点，
// 该路径在解析失败时会丢掉整批译文。
func TestBatchTranslateTextsToleratesConversationalPrefix(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		"好的，以下是翻译结果：\n\n```json\n{\n  \"translations\": [\n    { \"index\": 1, \"text\": \"第一句\" },\n    { \"index\": 2, \"text\": \"第二句\" },\n  ]\n}\n```",
	}}
	translator := &Translator{chatCompleter: completer}

	translations, err := translator.batchTranslateTexts(
		[]string{"first sentence", "second sentence"},
		types.StandardLanguageCode("en"),
		types.StandardLanguageCode("zh_cn"),
	)
	if err != nil {
		t.Fatalf("batchTranslateTexts() error = %v, want nil", err)
	}
	if completer.calls != 1 {
		t.Fatalf("ChatCompletion 调用次数 = %d, want 1（无需重试）", completer.calls)
	}
	want := []string{"第一句", "第二句"}
	if fmt.Sprint(translations) != fmt.Sprint(want) {
		t.Fatalf("translations = %v, want %v", translations, want)
	}
}
