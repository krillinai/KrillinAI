package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/internal/types"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestTranslationNLPTranslatesParentAndAdjustsChildBoundaries(t *testing.T) {
	parts := []string{"whatever it might be,", "I quite often pick up the Rationalist", "or the Idealist philosophers uh"}
	text := strings.Join(parts, " ")
	fullTarget := "不管是什么，我常常拿起理性主义或唯心主义哲学家的书。"
	translationCalls := 0
	translator := &Translator{
		checkpointDir: t.TempDir(),
		nlpSegmenter: func(_ context.Context, texts []string, language types.StandardLanguageCode) (translationNLPResult, error) {
			if language != "en" || !reflect.DeepEqual(texts, []string{text}) {
				t.Fatalf("NLP输入=%q，语言=%q", texts, language)
			}
			return translationNLPResult{Model: "en_core_web_md", Segments: [][]string{parts}, Tokens: [][]int{{5, 7, 5}}}, nil
		},
		chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
			if strings.HasPrefix(prompt, "任务：translation_context\n") {
				return `{"summary":"阅读哲学著作的习惯","terms":[]}`, nil
			}
			if strings.HasPrefix(prompt, "任务：translation_layout_review\n") {
				if !strings.Contains(prompt, `"nlp_segments_hint"`) || !strings.Contains(prompt, fullTarget) {
					t.Fatal("边界审校丢失父句译文或NLP参考")
				}
				return `{"corrections":[]}`, nil
			}
			input, err := decodePairedTestInput(prompt)
			if err != nil {
				return "", err
			}
			translationCalls++
			if len(input.Sentences) != 1 || input.Sentences[0].Text != text || len(input.Sentences[0].NLPSourceHint) != 0 {
				t.Fatalf("NLP片段被当成独立翻译任务: %+v", input)
			}
			// 共享宾语只翻译一次，允许合并第二、三条NLP建议。
			response, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: fullTarget,
				Source: []string{parts[0], strings.Join(parts[1:], " ")},
				Target: []string{"不管是什么，", "我常常拿起理性主义或唯心主义哲学家的书。"}}})
			return string(response), err
		}),
	}
	for range 2 {
		got, err := translator.translatePairedSentences(context.Background(), []string{text}, "en", "zh_cn", 75, 3, nil)
		if err != nil || len(got) != 1 || translationCalls != 1 {
			t.Fatalf("完整父句未统一翻译或恢复时重译: got=%+v calls=%d err=%v", got, translationCalls, err)
		}
		if got[0].FullSource != text || got[0].FullTarget != fullTarget || len(got[0].Source) != 2 || !reflect.DeepEqual(got[0].NLPSourceHint, parts) {
			t.Fatalf("完整译文或可调整的NLP边界丢失: %+v", got)
		}
	}
}

func TestTranslationNLPParentsStayAtomicAcrossBatches(t *testing.T) {
	for _, tc := range []struct {
		language types.StandardLanguageCode
		parts    []string
	}{
		{"en", []string{"Whatever it might be,", "I often read books."}},
		{"fr", []string{"Je lis souvent des livres,", "mais je ne les termine pas toujours."}},
		{"zh_cn", []string{"我今天已经读完这本书了，", "但是还有很多书没有读。"}},
		{"ja", []string{"今日は本を読みましたが、", "まだ読みたい本があります。"}},
		{"ar", []string{"قرأت الكتاب اليوم،", "ولكن لدي كتب أخرى."}},
	} {
		t.Run(string(tc.language), func(t *testing.T) {
			text := strings.Join(tc.parts, " ")
			hints := [][]string{tc.parts, {"Next."}}
			batches, err := buildPairedTranslationBatchesWithNLP([]string{text, "Next."}, hints, tc.language, "zh_cn", 75, 1)
			if err != nil || len(batches) != 2 {
				t.Fatalf("batches=%+v err=%v", batches, err)
			}
			first, second := batches[0].Sentences[0], batches[1].Sentences[0]
			if first.ID != "1" || second.ID != "2" || first.Text != text || !reflect.DeepEqual(first.NLPSourceHint, tc.parts) ||
				len(batches[1].Before) != 1 || batches[1].Before[0] != text || len(batches[0].After) != 1 || batches[0].After[0] != "Next." {
				t.Fatalf("跨批次丢失父句或上下文仍以子句计数: %+v", batches)
			}
			payload, _ := json.Marshal(batches[0])
			if len(payload)+len(pairedTranslationPrompt)+6000 > translationRequestBytes {
				t.Fatal("NLP参考未计入请求预算")
			}
		})
	}
	if _, err := buildPairedTranslationBatchesWithNLP([]string{"We read books."}, [][]string{{"We read", "novels."}}, "en", "zh_cn", 75, 1); err == nil {
		t.Fatal("接受了未覆盖父句的NLP建议")
	}
}

func TestTranslationNLPChangedHintsReuseParentTranslation(t *testing.T) {
	text := "Whatever it might be, I often read books."
	target := "不管是什么，我经常读书。"
	cached := pairedSentence{ID: "1", FullSource: text, FullTarget: target, Source: []string{text}, Target: []string{target},
		LayoutVersion: pairedLayoutVersion, LayoutReviewed: true, SemanticReviewed: true}
	source := pairedTranslationSource{ID: "1", Text: text, NLPSourceHint: []string{"Whatever it might be,", "I often read books."}}
	translator := &Translator{}
	got, ok := translator.recoverPairedSentence(cached, source, "en", "zh_cn")
	if !ok || got.FullTarget != target || !got.SemanticReviewed || got.LayoutReviewed || got.LayoutVersion != 0 || !reflect.DeepEqual(got.NLPSourceHint, source.NLPSourceHint) {
		t.Fatalf("NLP边界变化没有只重置排版: %+v ok=%v", got, ok)
	}
}

func TestAudioNLPHintsKeepLocalParentMapping(t *testing.T) {
	parts := [][]string{{"Whatever it might be,", "I often read books."}, {"I enjoy reading,", "and I discuss books with friends."}}
	texts := []string{strings.Join(parts[0], " "), strings.Join(parts[1], " ")}
	nlpCalls := 0
	translator := &Translator{
		nlpSegmenter: func(_ context.Context, input []string, _ types.StandardLanguageCode) (translationNLPResult, error) {
			nlpCalls++
			if !reflect.DeepEqual(input, texts) {
				t.Fatalf("音频路径没有按父句批量处理: %q", input)
			}
			return translationNLPResult{Model: "test", Segments: parts, Tokens: [][]int{{5, 5}, {4, 7}}}, nil
		},
		chatCompleter: translationCompleterFunc(func(string) (string, error) {
			return `{"summary":"阅读习惯","terms":[]}`, nil
		}),
	}
	got, err := translator.prepareAudioTranslationContexts(context.Background(), []DataWithId[string]{{Id: 2, Data: texts[0]}, {Id: 1, Data: texts[1]}}, "en", "zh_cn")
	if err != nil || nlpCalls != 1 || len(got) != 2 {
		t.Fatalf("音频NLP映射失败: %+v err=%v calls=%d", got, err, nlpCalls)
	}
	for i, id := range []int{2, 1} {
		if !reflect.DeepEqual(got[id].Texts, []string{texts[i]}) || !reflect.DeepEqual(got[id].NLPHints, [][]string{parts[i]}) {
			t.Fatalf("音频段%d的父句或NLP建议被展平: %+v", id, got[id])
		}
	}
}

func TestTranslationNLPValidationAndFallback(t *testing.T) {
	for _, tc := range []struct {
		name, language, text string
		parts                []string
		valid                bool
	}{
		{"中文", "zh_cn", "我今天已经读完这本书了，但是还有很多书没有读。", []string{"我今天已经读完这本书了，", "但是还有很多书没有读。"}, true},
		{"日文", "ja", "今日は本を読みました。しかしまだ読みたい本があります。", []string{"今日は本を読みました。", "しかしまだ読みたい本があります。"}, true},
		{"阿拉伯文", "ar", "قرأت الكتاب اليوم، ولكن لدي كتب أخرى.", []string{"قرأت الكتاب اليوم،", "ولكن لدي كتب أخرى."}, true},
		{"法语称谓", "fr", "Mme. Dupont arrive demain", []string{"Mme.", "Dupont arrive demain"}, false},
		{"数字单位", "en", "We walked 10 km yesterday", []string{"We walked 10", "km yesterday"}, false},
		{"词内边界", "en", "whatever it might be", []string{"what", "ever it might be"}, false},
		{"丢失逗号", "en", "whatever it might be, I read", []string{"whatever it might be", "I read"}, false},
		{"改写", "en", "We read books", []string{"We read", "novels"}, false},
		{"空段", "en", "We read books", []string{"", "We read books"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			counts := make([]int, len(tc.parts))
			for i := range counts {
				counts[i] = 5
			}
			result := translationNLPResult{Model: "test-source-model", Segments: [][]string{tc.parts}, Tokens: [][]int{counts}}
			texts := []string{tc.text}
			language := types.StandardLanguageCode(tc.language)
			if validTranslationNLPResult(texts, result, language) != tc.valid {
				t.Fatalf("校验结果错误: %+v", result)
			}
			translator := &Translator{nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
				return result, nil
			}}
			got, err := translator.prepareTranslationNLPHints(context.Background(), texts, language)
			var want [][]string
			if tc.valid {
				want = [][]string{tc.parts}
			}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("got=%q want=%q err=%v", got, want, err)
			}
		})
	}
}

func TestTranslationNLPCacheAndCancellation(t *testing.T) {
	text := "whatever it might be, I quite often read books"
	parts := []string{"whatever it might be,", "I quite often read books"}
	calls := 0
	translator := &Translator{checkpointDir: t.TempDir(), nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		calls++
		return translationNLPResult{Model: "en_core_web_md", Segments: [][]string{parts}, Tokens: [][]int{{5, 6}}}, nil
	}}
	for range 2 {
		got, err := translator.prepareTranslationNLPHints(context.Background(), []string{text}, "en")
		if err != nil || !reflect.DeepEqual(got, [][]string{parts}) {
			t.Fatalf("got=%q err=%v", got, err)
		}
	}
	if calls != 1 {
		t.Fatalf("续跑重复启动NLP: %d", calls)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := translator.prepareTranslationNLPHints(ctx, []string{text}, "en"); !errors.Is(err, context.Canceled) {
		t.Fatalf("缓存命中时未传播取消: %v", err)
	}
	translator.checkpointDir = ""
	translator.nlpSegmenter = func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		return translationNLPResult{}, errors.New("missing model")
	}
	got, err := translator.prepareTranslationNLPHints(context.Background(), []string{text}, "en")
	if err != nil || got != nil {
		t.Fatalf("NLP不可用时未安全回退: got=%q err=%v", got, err)
	}
}

func TestTranslationNLPLongUnitsUseIndependentTokenTarget(t *testing.T) {
	left := "We read many books on different subjects every day,"
	right := "and we talk about what we have learned with our friends every evening."
	text := left + " " + right
	for _, valid := range []bool{false, true} {
		calls := 0
		translator := &Translator{checkpointDir: t.TempDir(),
			nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
				return translationNLPResult{Model: "en_core_web_md", Segments: [][]string{{text}}, Tokens: [][]int{{28}}}, nil
			},
			chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
				calls++
				if !strings.Contains(prompt, "20个源语言NLP token") || strings.Contains(prompt, "75") {
					t.Fatal("源文预分句与显示长度耦合")
				}
				parts := []string{"rewritten", right}
				if valid {
					parts = []string{left, right}
				}
				data, err := json.Marshal(map[string]any{"segments": parts})
				return string(data), err
			}),
		}
		for range 2 {
			got, err := translator.prepareTranslationNLPHints(context.Background(), []string{text}, "en")
			want := [][]string{{text}}
			if valid {
				want = [][]string{{left, right}}
			}
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("got=%q want=%q err=%v", got, want, err)
			}
		}
		if calls != 1 {
			t.Fatalf("预分句恢复重复调用模型: %d", calls)
		}
	}
}

func TestTranslationNLPRealSpacy(t *testing.T) {
	python := os.Getenv("KRILLINAI_TEST_NLP_PYTHON")
	if python == "" {
		t.Skip("set KRILLINAI_TEST_NLP_PYTHON to run installed spaCy integration")
	}
	t.Setenv("KRILLINAI_NLP_PYTHON", python)
	texts := []string{
		"And so when I sit and I hear something on the news or I consider something some geopolitics that's going on or some problem at work or you know, whatever it might be, I quite often pick up the Rationalist or the Idealist philosophers uh because they are timeless and they speak in very general philosophical terms about contemporary morals, about things that are going on in the world.",
		"I will go through maybe just two or three pages and really think about them.",
	}
	result, err := runTranslationNLP(context.Background(), texts, "en")
	if err != nil || !validTranslationNLPResult(texts, result, "en") {
		t.Fatalf("真实NLP失败: result=%+v err=%v", result, err)
	}
	want := []string{"whatever it might be,", "I quite often pick up the Rationalist", "or the Idealist philosophers uh"}
	if len(result.Segments[0]) < 7 || !reflect.DeepEqual(result.Segments[0][4:7], want) {
		t.Fatalf("真实NLP没有保留示例切口: %q", result.Segments[0])
	}
	for _, part := range result.Segments[1] {
		if strings.HasSuffix(part, "two") || strings.HasPrefix(part, "or three") {
			t.Fatalf("数量并列被切开: %q", result.Segments[1])
		}
	}
	result, err = runTranslationNLP(context.Background(), []string{"هذا كتاب جيد"}, "ar")
	if err != nil || result.Unavailable != "unsupported_language" {
		t.Fatalf("无模型语言未明确回退: %+v err=%v", result, err)
	}
}
