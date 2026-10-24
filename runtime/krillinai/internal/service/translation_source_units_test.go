package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestSourceUnitsNLPPrecedesBudgetAndResumeFreezesUnits(t *testing.T) {
	left, right := strings.TrimSpace(strings.Repeat("alpha ", 80)), strings.TrimSpace(strings.Repeat("beta ", 80))
	text := left + " " + right
	calls := 0
	tr := &Translator{checkpointDir: t.TempDir(), nlpSegmenter: func(_ context.Context, texts []string, _ types.StandardLanguageCode) (translationNLPResult, error) {
		calls++
		if !reflect.DeepEqual(texts, []string{text}) || len(texts[0]) <= translationSentenceBytes {
			t.Fatal("NLP 之前截断了源文")
		}
		return translationNLPResult{Model: "test", Segments: [][]string{{left, right}}, Tokens: [][]int{{10, 10}}}, nil
	}}
	for range 2 {
		got, err := tr.prepareSourceTranslation(context.Background(), []string{text}, "en")
		if err != nil || !reflect.DeepEqual(got.Texts, []string{left, right}) || !validSourceUnits(text, got.SourceUnits) {
			t.Fatalf("got=%+v err=%v", got, err)
		}
		if got.SourceUnits[0].Group != got.SourceUnits[1].Group || len(got.NLPHints) != 0 {
			t.Fatal("意群没有成为实际翻译单元")
		}
		tr.nlpSegmenter = func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
			t.Fatal("续跑重复计算意群，可能改变 ID")
			return translationNLPResult{}, nil
		}
	}
	if calls != 1 {
		t.Fatal(calls)
	}
}

func TestSourceUnitsRetryOnlyStructuralErrors(t *testing.T) {
	left := "I opened the application yesterday and created a new project"
	right := "then I added a database and shared everything with the rest of my team"
	text := left + " " + right
	for _, mode := range []string{"invalid_then_valid", "unchanged", "service_failure"} {
		t.Run(mode, func(t *testing.T) {
			calls := 0
			tr := &Translator{checkpointDir: t.TempDir(), nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
				return translationNLPResult{Model: "test", Segments: [][]string{{text}}, Tokens: [][]int{{26}}}, nil
			}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				calls++
				if !strings.HasPrefix(prompt, "Task: translation_source_split\n") || strings.Contains(prompt, "semantic_context") || strings.Contains(prompt, "display_units") {
					t.Fatal("预分句没有使用局部英文请求")
				}
				if mode == "service_failure" {
					return "", errors.New("offline")
				}
				parts := []string{text}
				if mode == "invalid_then_valid" {
					parts = []string{"rewritten", right}
					if calls == 2 {
						if !strings.Contains(prompt, "previous_issue") {
							t.Fatal("结构纠错缺少具体反馈")
						}
						parts = []string{left, right}
					}
				}
				data, _ := json.Marshal(map[string]any{"segments": parts})
				return string(data), nil
			})}
			for range 2 {
				got, err := tr.prepareSourceTranslation(context.Background(), []string{text}, "en")
				want := []string{text}
				if mode == "invalid_then_valid" {
					want = []string{left, right}
				}
				if err != nil || !reflect.DeepEqual(got.Texts, want) {
					t.Fatalf("got=%+v want=%q err=%v", got, want, err)
				}
			}
			wantCalls := 1
			if mode == "invalid_then_valid" {
				wantCalls = 2
			}
			if calls != wantCalls {
				t.Fatalf("请求=%d，期望=%d；软长度、服务失败或续跑不应重开拆句", calls, wantCalls)
			}
		})
	}
}

func TestSourceUnitsNLPFailureAndBudgetFallbackPreserveAllText(t *testing.T) {
	text := strings.TrimSpace(strings.Repeat("source content ", 150))
	tr := &Translator{nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		return translationNLPResult{}, errors.New("NLP missing")
	}, chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) { return "", errors.New("offline") })}
	got, err := tr.prepareSourceTranslation(context.Background(), []string{text}, "en")
	if err != nil || len(got.Texts) < 2 || !validSourceUnits(text, got.SourceUnits) {
		t.Fatalf("预算兜底损坏全文: %+v err=%v", got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := tr.prepareSourceTranslation(ctx, []string{text}, "en"); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}

func TestSourceUnitsRejectUnsafeCutsAndRecoverPerSentence(t *testing.T) {
	for _, tc := range []struct {
		text  string
		parts []string
	}{
		{"Use Notion today", []string{"Use Not", "ion today"}},
		{"The trip is 10 km long", []string{"The trip is 10", "km long"}},
		{"Use cafe\u0301 today", []string{"Use cafe", "\u0301 today"}},
	} {
		if validSourceSplit(tc.text, tc.parts, "en", 4) == nil {
			t.Fatalf("接受了不安全切口: %q", tc.parts)
		}
	}
	text := "Alpha beta. Gamma delta epsilon."
	tr := &Translator{nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		return translationNLPResult{Model: "test", Segments: [][]string{{"lost"}, {"Gamma", "delta epsilon."}}, Tokens: [][]int{{1}, {1, 2}}}, nil
	}}
	got, err := tr.prepareSourceTranslation(context.Background(), []string{text}, "en")
	if err != nil || !reflect.DeepEqual(got.Texts, []string{"Alpha beta.", "Gamma", "delta epsilon."}) {
		t.Fatalf("单句损坏导致其他有效 NLP 结果丢失: %+v %v", got, err)
	}
}

func TestSourceUnitsKeepOriginalGroupsTogetherWithinBudget(t *testing.T) {
	texts := []string{"First", "second", "third", "fourth", "fifth"}
	for _, groups := range [][]int{{1, 1, 2, 2, 2}, {1, 1, 1, 1, 1}} {
		got, err := buildPairedTranslationBatchesWithGroups(texts, nil, groups, "en", "zh_cn", 75, 4)
		if err != nil || len(got) != 2 {
			t.Fatalf("got=%+v err=%v", got, err)
		}
		wantFirst := 2
		if groups[2] == 1 {
			wantFirst = 4 // 超大原句组仍必须尊重请求预算。
		}
		if len(got[0].Sentences) != wantFirst || got[1].Sentences[0].ID != strconv.Itoa(wantFirst+1) || len(got[0].After) == 0 || len(got[1].Before) == 0 {
			t.Fatalf("组批没有保留顺序与边缘上下文: %+v", got)
		}
	}
}

func TestSourceUnitsVTTAndAudioUseActualUnitsAndReuseTranslation(t *testing.T) {
	left, right := "I opened Notion", "then I created a page"
	text := left + " " + right
	for _, audio := range []bool{false, true} {
		t.Run(map[bool]string{false: "vtt", true: "audio"}[audio], func(t *testing.T) {
			nlpCalls, contentCalls := 0, 0
			tr := newTranslator(translationCompleterFunc(func(prompt string) (string, error) {
				input, err := decodePairedTestInput(prompt)
				if err != nil {
					return "", err
				}
				if strings.HasPrefix(prompt, "任务：translation_content\n") {
					contentCalls++
					if len(input.Sentences) != 2 || input.Sentences[0].Text != left || input.Sentences[1].Text != right {
						t.Fatalf("仍把 NLP 片段作为父句排版提示: %+v", input)
					}
				}
				return echoPairedTestResponse(input)
			})).withTranslationRecovery(t.TempDir(), nil)
			tr.nlpSegmenter = func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
				nlpCalls++
				return translationNLPResult{Model: "test", Segments: [][]string{{left, right}}, Tokens: [][]int{{3, 6}}}, nil
			}
			for range 2 {
				if audio {
					prepared, err := tr.prepareAudioTranslationContexts(context.Background(), []DataWithId[string]{{Data: text, Id: 0}}, "en", "zh_cn")
					if err != nil {
						t.Fatal(err)
					}
					local := *tr
					local.preparedTranslation = prepared[0]
					got, err := local.translatePairedSentences(context.Background(), []string{text}, "en", "zh_cn", 75, 12, nil)
					if err != nil || len(got) != 2 {
						t.Fatalf("audio=%+v err=%v", got, err)
					}
				} else {
					got, err := tr.BatchTranslateSrtBlocks(context.Background(), []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:04,000", OriginLanguageSentence: text}}, "en", "zh_cn", nil)
					if err != nil || len(got) != 2 {
						t.Fatalf("vtt=%+v err=%v", got, err)
					}
				}
			}
			if nlpCalls != 1 || contentCalls != 1 {
				t.Fatalf("续跑重做 NLP 或正文: NLP=%d content=%d", nlpCalls, contentCalls)
			}
		})
	}
}

func TestSourceUnitsImportedSRTKeepsLegacyPathWithoutMutatingTranslator(t *testing.T) {
	left, right := "I opened Notion", "then I created a page."
	text := left + " " + right
	contentCalls := 0
	tr := newTranslator(translationCompleterFunc(func(prompt string) (string, error) {
		if strings.HasPrefix(prompt, "Task: translation_source_split\n") {
			t.Fatal("原始 SRT 不应请求新源文拆句")
		}
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			contentCalls++
			if len(input.Sentences) != 1 || input.Sentences[0].Text != text {
				t.Fatalf("原始 SRT 被切成新的翻译单元: %+v", input)
			}
		}
		return echoPairedTestResponse(input)
	}))
	tr.nlpSegmenter = func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		return translationNLPResult{Model: "test", Segments: [][]string{{left, right}}, Tokens: [][]int{{3, 6}}}, nil
	}
	svc := Service{YouTubeSubtitleSrv: &YouTubeSubtitleService{translator: tr}}
	_, err := svc.TranslateSubtitleBlocks(context.Background(), []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:04,000", OriginLanguageSentence: text}}, &types.SubtitleTaskStepParam{TaskBasePath: t.TempDir(), OriginLanguage: "en", TargetLanguage: "zh_cn"})
	if err != nil || contentCalls != 1 || !tr.sourceSegmentation || tr.checkpointDir != "" {
		t.Fatalf("SRT 路由失败或污染共享实例: calls=%d sourceSegmentation=%v checkpoint=%q error=%v", contentCalls, tr.sourceSegmentation, tr.checkpointDir, err)
	}
}

func TestSourceUnitsResumeReusesCompletedSplitsAfterCancellation(t *testing.T) {
	left, right := "First "+strings.TrimSpace(strings.Repeat("alpha ", 12)), strings.TrimSpace(strings.Repeat("beta ", 12))+"."
	first, second := left+" "+right, "Next "+strings.TrimSpace(strings.Repeat("gamma ", 24))+"."
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	calls := make(map[string]int)
	tr := &Translator{checkpointDir: t.TempDir(), nlpSegmenter: func(_ context.Context, texts []string, _ types.StandardLanguageCode) (translationNLPResult, error) {
		result := translationNLPResult{Model: "test"}
		for _, text := range texts {
			result.Segments = append(result.Segments, []string{text})
			result.Tokens = append(result.Tokens, []int{25})
		}
		return result, nil
	}, chatCompleter: semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		_, payload, _ := strings.Cut(prompt, "Input JSON:\n")
		var input struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal([]byte(payload), &input); err != nil {
			return "", err
		}
		calls[input.Text]++
		if input.Text == second && calls[second] == 1 {
			cancel()
			return "", ctx.Err()
		}
		parts := []string{input.Text}
		if input.Text == first {
			parts = []string{left, right}
		}
		data, err := json.Marshal(map[string]any{"segments": parts})
		return string(data), err
	})}
	if _, err := tr.prepareSourceTranslation(ctx, []string{first, second}, "en"); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	got, err := tr.prepareSourceTranslation(context.Background(), []string{first, second}, "en")
	if err != nil || !reflect.DeepEqual(got.Texts, []string{left, right, second}) || calls[first] != 1 || calls[second] != 2 {
		t.Fatalf("取消后没有复用完成的局部拆句: got=%+v calls=%v err=%v", got, calls, err)
	}
}

func TestSourceUnitsAudioMapsGlobalTermScopesToLocalUnits(t *testing.T) {
	tr := newTranslator(semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		var input struct {
			Sentences []translationSemanticSource `json:"sentences"`
		}
		if !strings.HasPrefix(prompt, "任务：translation_context\n") || semanticTestPayload(prompt, &input) != nil || len(input.Sentences) != 4 || input.Sentences[2].Text != "Earn 10K" {
			t.Fatalf("全片语境没有使用全部意群: %s", prompt)
		}
		return `{"summary":"跑步距离与月收入。","terms":[{"source":"10K","target":"10公里","meaning":"跑步距离","sentence_ids":["1"]},{"source":"10K","target":"一万元","meaning":"月收入","sentence_ids":["3"]}]}`, nil
	}))
	tr.nlpSegmenter = func(_ context.Context, texts []string, _ types.StandardLanguageCode) (translationNLPResult, error) {
		parts := []string{"Run 10K", "every day."}
		if strings.HasPrefix(texts[0], "Earn") {
			parts = []string{"Earn 10K", "each month."}
		}
		return translationNLPResult{Model: "test", Segments: [][]string{parts}, Tokens: [][]int{{3, 3}}}, nil
	}
	got, err := tr.prepareAudioTranslationContexts(context.Background(), []DataWithId[string]{{Id: 2, Data: "Run 10K every day."}, {Id: 9, Data: "Earn 10K each month."}}, "en", "zh_cn")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id     int
		target string
	}{{2, "10公里"}, {9, "一万元"}} {
		value := got[tc.id]
		if value == nil || len(value.SourceUnits) != 2 || len(value.Plan.Sections) != 1 {
			t.Fatalf("音频段意群或计划丢失: %+v", value)
		}
		section := value.Plan.Sections[0]
		if section.Start != 1 || section.End != 2 || len(section.Context.Terms) != 1 || section.Context.Terms[0].Target != tc.target || !reflect.DeepEqual(section.Context.Terms[0].SentenceIDs, []string{"1"}) {
			t.Fatalf("术语串段或局部 ID 错误: %+v", section)
		}
	}
}
