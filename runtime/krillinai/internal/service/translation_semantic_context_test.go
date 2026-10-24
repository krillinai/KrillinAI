package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/sync/errgroup"
)

// 既有翻译/排版测试的固定空术语前置阶段；语义行为由本文件的独立模型替身验证。
func neutralSemanticTestResponse(prompt string) (string, bool) {
	if strings.HasPrefix(prompt, "任务：translation_revision\n") {
		return `{"corrections":[]}`, true
	}
	if strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n") {
		return `{"acceptable":true,"reason":"测试中的新增意群边界及逐段内容对应。"}`, true
	}
	if strings.HasPrefix(prompt, "任务：translation_layout_review\n") {
		return layoutReviewTestResponse(prompt, `{"corrections":[]}`), true
	}
	if strings.HasPrefix(prompt, "任务：translation_context\n") {
		return `{"summary":"测试字幕的语境。","terms":[]}`, true
	}
	if strings.HasPrefix(prompt, "任务：translation_context_summary\n") {
		return `{"summary":"全部章节的测试语境。"}`, true
	}
	if strings.HasPrefix(prompt, "任务：translation_term_review\n") {
		return `{"corrections":[]}`, true
	}
	return "", false
}

// 路由替身逐句确认当前固定样例；真实语义及拒绝行为由专测覆盖。
func layoutReviewTestResponse(prompt, response string) string {
	var input struct {
		Sentences []pairedSentence `json:"sentences"`
	}
	if semanticTestPayload(prompt, &input) != nil {
		return response
	}
	var result map[string]any
	if json.Unmarshal([]byte(response), &result) != nil {
		return response
	}
	var reviews []any
	for _, sentence := range input.Sentences {
		reviews = append(reviews, map[string]any{"sentence_id": sentence.ID, "aligned": true, "natural_boundaries": true, "reason": "固定样例的每对内容及边界已核对"})
	}
	result["reviews"] = reviews
	data, _ := json.Marshal(result)
	return string(data)
}

type semanticTestCompleter func(context.Context, string) (string, error)

func (f semanticTestCompleter) ChatCompletion(prompt string) (string, error) {
	return f(context.Background(), prompt)
}
func (f semanticTestCompleter) ChatCompletionContext(ctx context.Context, prompt string) (string, error) {
	return f(ctx, prompt)
}

func semanticTestPayload(prompt string, output any) error {
	_, payload, ok := strings.Cut(prompt, "输入 JSON：\n")
	if !ok {
		return errors.New("missing input")
	}
	return json.Unmarshal([]byte(payload), output)
}

func TestTranslationSemanticEvidenceAndMultilingualScopes(t *testing.T) {
	for _, test := range []struct {
		language   types.StandardLanguageCode
		text, term string
		want       bool
	}{
		{"en", "Run 10K daily.", "10K", true}, {"en", "Run 10KM daily.", "10K", false},
		{"en", "A catalog", "cat", false}, {"de", "Die Bank ist geschlossen.", "Bank", true},
		{"ja", "銀行で相談します。", "銀行", true}, {"zh_cn", "每天跑十公里。", "十公里", true},
		{"ar", "نركض عشرة كيلومترات يومياً.", "كيلومترات", true}, {"th", "วิ่งสิบกิโลเมตรทุกวัน", "กิโลเมตร", true},
	} {
		if got := translationContainsTerm(test.text, test.term, test.language); got != test.want {
			t.Errorf("%s %q term %q: %v", test.language, test.text, test.term, got)
		}
	}
	sources := []translationSemanticSource{{"1", "Run 10K."}, {"2", "Earn 10K."}, {"3", "Hello."}}
	valid := translationSemanticContext{Summary: "跑步距离与金额使用不同含义。", Terms: []translationSemanticTerm{
		{"10K", "10公里", "跑步距离", []string{"1"}, ""}, {"10K", "一万元", "金额", []string{"2"}, ""},
	}}
	if !validTranslationSemanticContext(valid, sources, "en") {
		t.Fatal("拒绝了同词不同语境")
	}
	plan := &translationSemanticPlan{Summary: valid.Summary, Sections: []translationSemanticSection{{1, 3, valid}}}
	for _, test := range []struct{ id, want string }{{"1", "10公里"}, {"2", "一万元"}, {"3", ""}} {
		value := plan.forSources([]pairedTranslationSource{{ID: test.id}})
		if test.want == "" {
			if len(value.Terms) != 0 {
				t.Fatal("术语泄漏到其他句子")
			}
			continue
		}
		if len(value.Terms) != 1 || value.Terms[0].Target != test.want {
			t.Fatalf("scope %s: %+v", test.id, value)
		}
	}
	for _, ids := range [][]string{{"3"}, {"99"}, {"1", "1"}} {
		bad := valid
		bad.Terms = []translationSemanticTerm{{"10K", "10公里", "距离", ids, ""}}
		if validTranslationSemanticContext(bad, sources, "en") {
			t.Fatalf("接受了错误证据: %v", ids)
		}
	}
}

func TestTranslationSemanticKeepsEvidenceWhenOtherScopesAreInvalid(t *testing.T) {
	sources := []translationSemanticSource{{"1", "Run 10K."}, {"2", "Read Hegel."}, {"3", "Hello."}}
	result := translationSemanticContext{Summary: "跑步与读书。", Terms: []translationSemanticTerm{
		{"10K", "10公里", "跑步距离", []string{"1", "3", "99", "1"}, ""},
		{"Hegel", "黑格尔", "哲学家", []string{"2"}, ""},
		{"missing", "虚构推荐", "无证据", []string{"3"}, ""},
	}}
	pruneTranslationSemanticScopes(&result, sources, "en")
	if !validTranslationSemanticContext(result, sources, "en") || len(result.Terms) != 2 || len(result.Terms[0].SentenceIDs) != 1 || result.Terms[0].SentenceIDs[0] != "1" || result.Terms[1].Source != "Hegel" {
		t.Fatalf("有效术语被整章丢弃，或无证据ID仍保留: %+v", result)
	}
	result.Terms = []translationSemanticTerm{{"10K", "10公里", "距离", []string{"1"}, ""}, {"10K", "一万元", "金额", []string{"1"}, ""}}
	pruneTranslationSemanticScopes(&result, sources, "en")
	if len(result.Terms) != 0 {
		t.Fatalf("同一位置的冲突释义被任意保留: %+v", result.Terms)
	}
}

func TestTranslationSemanticPlanCoversEndingAndCaches(t *testing.T) {
	var texts []string
	for i := range 150 {
		texts = append(texts, fmt.Sprintf("Chapter %d %s.", i, strings.Repeat("content ", 15)))
	}
	texts[len(texts)-1] = "Ending reveals that the bank is a river bank."
	seen := make(map[string]bool)
	contextCalls, summaryCalls := 0, 0
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if len(prompt) > translationRequestBytes {
			t.Fatal("请求超预算")
		}
		if strings.HasPrefix(prompt, "任务：translation_context\n") {
			contextCalls++
			var input struct {
				Sentences []translationSemanticSource `json:"sentences"`
			}
			if err := semanticTestPayload(prompt, &input); err != nil {
				return "", err
			}
			for _, source := range input.Sentences {
				if seen[source.ID] {
					t.Fatal("原文重复")
				}
				seen[source.ID] = true
			}
			last := input.Sentences[len(input.Sentences)-1]
			data, _ := json.Marshal(translationSemanticContext{Summary: last.Text, Terms: []translationSemanticTerm{}})
			return string(data), nil
		}
		summaryCalls++
		if !strings.Contains(prompt, "river bank") {
			t.Fatal("汇总未读取结尾")
		}
		return `{"summary":"结尾说明 bank 是河岸。"}`, nil
	})}
	plan, err := translator.prepareTranslationSemanticPlan(context.Background(), texts, "en", "zh_cn")
	if err != nil || plan.Degraded || len(seen) != len(texts) || contextCalls < 2 || summaryCalls == 0 || !strings.Contains(plan.Summary, "河岸") {
		t.Fatalf("plan=%+v calls=%d/%d coverage=%d err=%v", plan, contextCalls, summaryCalls, len(seen), err)
	}
	translator.chatCompleter = semanticTestCompleter(func(context.Context, string) (string, error) {
		t.Fatal("命中缓存后仍调用模型")
		return "", nil
	})
	if _, err := translator.prepareTranslationSemanticPlan(context.Background(), texts, "en", "zh_cn"); err != nil {
		t.Fatal(err)
	}
}

func TestSegmentedDegradedPlanSurvivesResumeWithoutInvalidatingContent(t *testing.T) {
	texts := make([]string, 65)
	for i := range texts {
		texts[i] = fmt.Sprintf("I read book %d.", i)
	}
	calls := 0
	translator := &Translator{segmentTranslation: true, checkpointDir: t.TempDir(), chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if strings.HasPrefix(prompt, "任务：translation_context_summary\n") {
			return `{"summary":"` + strings.Repeat("长", 201) + `"}`, nil
		}
		return `{"summary":"读书。","terms":[]}`, nil
	})}
	first, err := translator.prepareTranslationSemanticPlan(context.Background(), texts, "en", "zh_cn")
	if err != nil || !first.Degraded || calls != 3 {
		t.Fatalf("plan=%+v calls=%d err=%v", first, calls, err)
	}
	a, err := translator.openTranslationCheckpoint(texts, "en", "zh_cn", first)
	if err != nil {
		t.Fatal(err)
	}
	translator.chatCompleter = semanticTestCompleter(func(context.Context, string) (string, error) {
		t.Fatal("optional summary retry must not invalidate completed translations")
		return `{"summary":"现在成功。"}`, nil
	})
	second, err := translator.prepareTranslationSemanticPlan(context.Background(), texts, "en", "zh_cn")
	if err != nil || !second.Degraded || !validSegmentedSemanticPlan(*second, texts, "en") {
		t.Fatalf("resumed plan=%+v err=%v", second, err)
	}
	b, err := translator.openTranslationCheckpoint(texts, "en", "zh_cn", second)
	if err != nil || a.dir != b.dir {
		t.Fatal("resuming changed content fingerprint")
	}
	second.Sections[0].End--
	if validSegmentedSemanticPlan(*second, texts, "en") {
		t.Fatal("corrupt section coverage accepted")
	}
}

func TestTranslationSemanticRepairAndResume(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 1
	contextCalls, translationCalls, reviewCalls := 0, 0, 0
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_context\n") {
			contextCalls++
			return `{"summary":"每天跑十公里。","terms":[{"source":"10K","target":"10公里","meaning":"跑步距离","sentence_ids":["1","3"]}]}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_term_review\n") {
			reviewCalls++
			var input struct {
				Sentences []pairedTranslationSource `json:"sentences"`
			}
			if err := semanticTestPayload(prompt, &input); err != nil {
				return "", err
			}
			if len(input.Sentences) != 1 || input.Sentences[0].ID == "2" {
				t.Fatal("审校了无术语句子")
			}
			if input.Sentences[0].ID == "1" {
				return `{"corrections":[]}`, nil
			}
			return `{"corrections":[{"sentence_id":"3","term_source":"10K","reason":"10K是距离，不是步数","target_text":"我不再追求10公里了。"}]}`, nil
		}
		translationCalls++
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		var values []pairedSentence
		for _, source := range input.Sentences {
			if input.SemanticContext == nil || input.SemanticContext.Summary == "" {
				t.Fatal("翻译缺少共享语境")
			}
			target := map[string]string{"1": "每天10公里。", "2": "明天开始。", "3": "我不再追求1万步了。"}[source.ID]
			values = append(values, pairedSentence{ID: source.ID, FullTarget: target, Source: []string{source.Text}, Target: []string{target}})
		}
		data, _ := encodePairedTestResponse(values)
		return string(data), nil
	})}
	texts := []string{"10K every day.", "Starting tomorrow.", "I'm not chasing 10K anymore."}
	var committed []pairedSentence
	result, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 100, 1, func(batch []pairedSentence, _, _ int) error { committed = append(committed, batch...); return nil })
	if err != nil || result[2].FullTarget != "我不再追求10公里了。" || committed[2].FullTarget != result[2].FullTarget || contextCalls != 1 || translationCalls != 3 || reviewCalls != 2 {
		t.Fatalf("result=%+v calls=%d/%d/%d error=%v", result, contextCalls, translationCalls, reviewCalls, err)
	}
	translator.chatCompleter = semanticTestCompleter(func(context.Context, string) (string, error) {
		t.Fatal("恢复已完成任务时重复请求")
		return "", nil
	})
	if _, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 100, 2, nil); err != nil {
		t.Fatal(err)
	}
}

func TestTranslationSemanticFailureCancellationAndUnreviewedResume(t *testing.T) {
	for _, canceled := range []bool{false, true} {
		ctx, cancel := context.WithCancel(context.Background())
		translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
			if canceled {
				cancel()
			}
			return "", errors.New("unavailable")
		})}
		plan, err := translator.prepareTranslationSemanticPlan(ctx, []string{"Hello."}, "en", "zh_cn")
		cancel()
		if canceled {
			if !errors.Is(err, context.Canceled) {
				t.Fatal(err)
			}
		} else if err != nil || !plan.Degraded {
			t.Fatalf("plan=%+v err=%v", plan, err)
		}
	}
	dir := t.TempDir()
	texts := []string{"Run 10K."}
	contextJSON := `{"summary":"跑步距离。","terms":[{"source":"10K","target":"10公里","meaning":"跑步距离","sentence_ids":["1"]}]}`
	translator := &Translator{checkpointDir: dir, chatCompleter: semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_context\n") {
			return contextJSON, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_term_review\n") {
			return `{"corrections":[{"sentence_id":"99","term_source":"10K","reason":"错误ID","target_text":"被篡改"}]}`, nil
		}
		return `{"sentences":[{"sentence_id":"1","target_text":"跑10公里。","segments":[{"source":"Run 10K.","target":"跑10公里。"}]}]}`, nil
	})}
	result, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 50, 1, nil)
	if err != nil || result[0].SemanticReviewed || result[0].FullTarget != "跑10公里。" {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	reviews := 0
	translator.chatCompleter = semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if !strings.HasPrefix(prompt, "任务：translation_term_review\n") {
			t.Fatal("恢复未审校结果时重新翻译")
		}
		reviews++
		return `{"corrections":[]}`, nil
	})
	result, err = translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 50, 1, nil)
	if err != nil || !result[0].SemanticReviewed || reviews != 1 {
		t.Fatalf("result=%+v reviews=%d err=%v", result, reviews, err)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "translation-checkpoints", "*", "1.json"))
	if len(files) != 1 {
		t.Fatal(files)
	}
	data, _ := os.ReadFile(files[0])
	if !strings.Contains(string(data), `"semantic_reviewed":true`) {
		t.Fatal(string(data))
	}
}

func TestAudioSemanticContextSharedAcrossSegments(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.MaxSentenceLength = 100
	contextCalls := 0
	var translationTexts []string
	svc := Service{ChatCompleter: semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_context\n") {
			contextCalls++
			var input struct {
				Sentences []translationSemanticSource `json:"sentences"`
			}
			if err := semanticTestPayload(prompt, &input); err != nil {
				return "", err
			}
			if len(input.Sentences) != 2 || input.Sentences[0].Text != "Run 10K." || input.Sentences[1].Text != "The distance is ten kilometers." {
				t.Fatalf("全片原文不完整或乱序: %+v", input)
			}
			return `{"summary":"跑步目标是十公里。","terms":[{"source":"10K","target":"10公里","meaning":"结尾确认跑步距离","sentence_ids":["1"]}]}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_revision\n") {
			return `{"corrections":[]}`, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_term_review\n") {
			return `{"corrections":[]}`, nil
		}
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if input.SemanticContext == nil || input.SemanticContext.Summary != "跑步目标是十公里。" || len(input.Sentences) != 1 || input.Sentences[0].ID != "1" {
			t.Fatalf("未共享全片语境或局部ID错误: %+v", input)
		}
		source := input.Sentences[0]
		translationTexts = append(translationTexts, source.Text)
		target := "距离是十公里。"
		if strings.Contains(source.Text, "10K") {
			target = "跑10公里。"
			if len(input.SemanticContext.Terms) != 1 || input.SemanticContext.Terms[0].SentenceIDs[0] != "1" {
				t.Fatal("丢失术语作用域")
			}
		} else if len(input.SemanticContext.Terms) != 0 {
			t.Fatal("术语泄漏到其他音频段")
		}
		data, _ := encodePairedTestResponse([]pairedSentence{{ID: source.ID, FullTarget: target, Source: []string{source.Text}, Target: []string{target}}})
		return string(data), nil
	})}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	group, ctx := errgroup.WithContext(ctx)
	pending := make(chan DataWithId[string], 2)
	// 转录乱序到达；全片语境必须按音频顺序整理。
	pending <- DataWithId[string]{Id: 1, Data: "The distance is ten kilometers."}
	pending <- DataWithId[string]{Id: 0, Data: "Run 10K."}
	close(pending)
	progress := make(chan DataWithId[TranslationProgress], 20)
	output := make(chan DataWithId[[]*TranslatedItem], 2)
	svc.startTranslateWorker(ctx, group, &types.SubtitleTaskStepParam{TaskBasePath: t.TempDir(), OriginLanguage: "en", TargetLanguage: "zh_cn"}, pending, progress, output, 2)
	if err := group.Wait(); err != nil {
		t.Fatal(err)
	}
	if contextCalls != 1 || fmt.Sprint(translationTexts) != "[Run 10K. The distance is ten kilometers.]" {
		t.Fatalf("calls=%d texts=%v", contextCalls, translationTexts)
	}
	if first, second := <-output, <-output; first.Id != 0 || second.Id != 1 || first.Data[0].TranslatedText != "跑10公里。" {
		t.Fatalf("音频段输出错误: %+v %+v", first, second)
	}
}

func TestTranslationSemanticCorrectionLocksFullTargetDuringLayout(t *testing.T) {
	const source = "Run 10K every single day, and remember that this is a running distance."
	const corrected = "每天跑十公里，并记住这说的是跑步距离。"
	plan := &translationSemanticPlan{Summary: "跑步距离。", Sections: []translationSemanticSection{{Start: 1, End: 1, Context: translationSemanticContext{Summary: "跑步距离。", Terms: []translationSemanticTerm{{Source: "10K", Target: "十公里", Meaning: "距离", SentenceIDs: []string{"1"}}}}}}}
	input := pairedTranslationInput{MaxSourceChars: 20, MaxTargetChars: 20, Sentences: []pairedTranslationSource{{ID: "1", Text: source}}}
	input.SemanticContext = plan.forSources(input.Sentences)
	before := pairedSentence{ID: "1", FullSource: source, FullTarget: "每天走一万步，并记住这说的是跑步距离。", Source: []string{source}, Target: []string{"每天走一万步，并记住这说的是跑步距离。"}}
	layoutCalls := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(ctx context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_term_review\n") {
			data, _ := json.Marshal(map[string]any{"corrections": []translationSemanticCorrection{{ID: "1", TermSource: "10K", Reason: "距离被错译为步数", TargetText: corrected}}})
			return string(data), nil
		}
		if strings.HasPrefix(prompt, "任务：translation_length_rewrite_review\n") {
			return `{"equivalent":false,"reason":"丢失完整修正译文的信息"}`, nil
		}
		layoutCalls++
		value, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		var request subtitleLengthSplitInput
		_ = semanticTestPayload(prompt, &request)
		if len(value.Sentences) != 1 || value.Sentences[0].TargetText != corrected && request.OriginalTarget != corrected {
			t.Fatal("排版未锁定完整修正译文")
		}
		// 排版服务企图缩写译文，必须保留此前的完整修正。
		return `{"sentences":[{"sentence_id":"1","target_text":"跑十公里。","segments":[{"source":"Run 10K","target":"跑十公里。"}]}]}`, nil
	})}
	var final pairedSentence
	err := translator.completeSemanticBatch(context.Background(), input, map[string]pairedSentence{"1": before}, plan, "en", "zh_cn", func(value pairedSentence, complete bool) error {
		if complete {
			final = value
		}
		return nil
	})
	if err != nil || layoutCalls == 0 || final.FullTarget != corrected || !subtitleSegmentsPreserveText(corrected, final.Target) || !final.SemanticReviewed {
		t.Fatalf("final=%+v calls=%d err=%v", final, layoutCalls, err)
	}
}

func TestTranslationSemanticCheckpointTracksPlan(t *testing.T) {
	translator := &Translator{checkpointDir: t.TempDir()}
	texts := []string{"Run 10K."}
	first, err := translator.openTranslationCheckpoint(texts, "en", "zh_cn", &translationSemanticPlan{Summary: "距离"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := translator.openTranslationCheckpoint(texts, "en", "zh_cn", &translationSemanticPlan{Summary: "金额"})
	if err != nil {
		t.Fatal(err)
	}
	if first.dir == second.dir {
		t.Fatal("语义计划改变后复用了旧译文")
	}
}

func TestTranslationSemanticContextCannotBlockBudgetedSentence(t *testing.T) {
	var words []string
	var terms []translationSemanticTerm
	for i := 0; i < 12; i++ {
		source := fmt.Sprintf("%dK", (i+1)*10)
		words = append(words, source)
		terms = append(terms, translationSemanticTerm{Source: source, Target: strings.Repeat("路", 30), Meaning: strings.Repeat("跑", 60), SentenceIDs: []string{"1"}})
	}
	text := strings.Join(words, " ") + " are running distances."
	plan := &translationSemanticPlan{Summary: strings.Repeat("片", 200), Sections: []translationSemanticSection{{Start: 1, End: 1, Context: translationSemanticContext{Summary: strings.Repeat("章", 200), Terms: terms}}}}
	if !validTranslationSemanticContext(plan.Sections[0].Context, []translationSemanticSource{{"1", text}}, "en") {
		t.Fatal("测试计划本身无效")
	}
	// 第二句令构建器尝试扩大批次后退回，退回后也须重新检查元数据预算。
	inputs, err := buildPairedTranslationBatches([]string{text, "Next."}, "en", "zh_cn", 50, 3, plan)
	if err != nil || len(inputs) < 1 || inputs[0].Sentences[0].Text != text {
		t.Fatalf("input=%+v error=%v", inputs, err)
	}
	payload, _ := json.Marshal(inputs[0])
	if len(payload)+len(pairedTranslationPrompt)+6000 > translationRequestBytes {
		t.Fatal("翻译请求超预算")
	}
	if len(plan.forSources(inputs[0].Sentences).Terms) != 12 {
		t.Fatal("丢失译后审校所需的完整计划")
	}
}
