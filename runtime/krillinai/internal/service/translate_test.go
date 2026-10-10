package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"testing"
)

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

func TestTranslatorSplitOriginLongSentenceRejectsDecoyObject(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		"请按如下格式输出：{}\n{\n  \"short_sentences\": [\n    { \"text\": \"And the reason why they chose the owl is because\" },\n    { \"text\": \"the owl is a symbol used in Europe\" }\n  ]\n}",
	}}
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
}

func TestBatchTranslateTextsRejectsDecoyObject(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		"输出格式示例：{}\n```json\n{\n  \"translations\": [\n    { \"index\": 1, \"text\": \"第一句\" },\n    { \"index\": 2, \"text\": \"第二句\" },\n  ]\n}\n```",
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

func TestTranslatorSplitOriginLongSentenceRetriesEmptyAnswer(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		`{"short_sentences":[]}`,
		`{"short_sentences":[{"text":"hello"}]}`,
	}}
	translator := &Translator{chatCompleter: completer}
	sentences, err := translator.splitOriginLongSentence("hello world")
	if err != nil || len(sentences) != 1 || sentences[0] != "hello" || completer.calls != 2 {
		t.Fatalf("split = %v, calls = %d, error = %v", sentences, completer.calls, err)
	}
}

func TestBatchTranslateTextsRejectsEmptyExampleAndRetriesEmptyText(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		`{"translations":[]} actual: {"translations":[{"index":1,"text":""}]}`,
		`{"translations":[{"index":1,"text":"你好"}]}`,
	}}
	translator := &Translator{chatCompleter: completer}
	translations, err := translator.batchTranslateTexts(
		[]string{"hello"}, types.StandardLanguageCode("en"), types.StandardLanguageCode("zh_cn"),
	)
	if err != nil || len(translations) != 1 || translations[0] != "你好" || completer.calls != 2 {
		t.Fatalf("translations = %v, calls = %d, error = %v", translations, completer.calls, err)
	}
}

func TestBatchTranslateTextsRetriesDuplicateIndex(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		`{"translations":[{"index":1,"text":"一"},{"index":1,"text":"二"}]}`,
		`{"translations":[{"index":1,"text":"一"},{"index":2,"text":"二"}]}`,
	}}
	translator := &Translator{chatCompleter: completer}
	translations, err := translator.batchTranslateTexts(
		[]string{"one", "two"}, types.StandardLanguageCode("en"), types.StandardLanguageCode("zh_cn"),
	)
	if err != nil || len(translations) != 2 || translations[0] != "一" || translations[1] != "二" || completer.calls != 2 {
		t.Fatalf("translations = %v, calls = %d, error = %v", translations, completer.calls, err)
	}
}
