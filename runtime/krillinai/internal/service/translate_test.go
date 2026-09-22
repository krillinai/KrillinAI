package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"testing"
)

// TestTranslatorSplitOriginLongSentenceToleratesLLMNoise Translator 上与 Service 同形的
// 解析点（translate.go）同样容忍这两类带噪声的响应。
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

// TestBatchTranslateTextsToleratesConversationalPrefix 批量翻译的解析点在带对话式前缀的
// 响应上仍然拿到整批译文。
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

// TestTranslatorSplitOriginLongSentenceRejectsDecoyObject Translator 上同形的解析点也跳过
// 说明文字里的示例对象，拿到真正的短句列表。
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

// TestBatchTranslateTextsRejectsDecoyObject 批量翻译的解析点跳过输出格式示例对象，
// 拿到整批译文。
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
