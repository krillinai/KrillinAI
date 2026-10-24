package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestFrozenLayoutRejectsHistoricalJapaneseRewriteAndBoundsResume(t *testing.T) {
	source := "And it's really a reason to consider switching to the Claude Code tab"
	target := "そして、Claude Codeタブへの切り替えを検討する大きな理由になります。"
	calls := 0
	translator := (&Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if !strings.HasPrefix(prompt, "任务：translation_frozen_layout\n") || !strings.Contains(prompt, target) {
			t.Fatal("排版重试没有固定校准译文，或又进入其他重写支路")
		}
		if calls == 2 && (!strings.Contains(prompt, "Target coverage/order changed") || strings.Contains(prompt, "先统一重写")) {
			t.Fatal("冻结排版的错误反馈丢失了覆盖错误，或仍建议重写译文")
		}
		return `{"sentences":[{"sentence_id":"21","segments":[{"source":"And it's really a reason to consider","target":"そして、これは検討する大きな理由になります。"},{"source":"switching to the Claude Code tab","target":"Claude Codeタブへの切り替えを。"}]}]}`, nil
	})}).withSemanticSourceUnits()
	original := pairedSentence{ID: "21", FullSource: source, FullTarget: target, DraftTarget: "校准前的初译", RevisionVersion: "version", SemanticReviewed: true}
	parents := map[string]pairedSentence{"21": original}
	input := lengthSplitTestInput(original, 60)
	completed := 0
	save := func(p pairedSentence, done bool) error {
		if p.FullTarget != target || p.LayoutBaseTarget != target || p.DraftTarget != original.DraftTarget {
			t.Fatal("候选损坏了校准译文或初译记录")
		}
		if done {
			completed++
		}
		return nil
	}
	for i := 0; i < 2; i++ {
		if err := translator.layoutFrozenSubtitles(context.Background(), input, parents, "en", "ja", save); err != nil {
			t.Fatal(err)
		}
	}
	got := parents["21"]
	if calls != 2 || completed != 2 || got.LayoutAttempts != 2 || got.LayoutFallback || !got.LayoutApproximate || pairedFinalLengthIssueAtLimit(got, 60) != nil || !subtitleSegmentsPreserveText(target, got.Target) {
		t.Fatalf("没有保住原译和长度，或续跑重新取得了预算: %+v calls=%d completed=%d", got, calls, completed)
	}
}

func TestFrozenLayoutDoesNotRetryAcceptedPeers(t *testing.T) {
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 45}
	parents := make(map[string]pairedSentence)
	for _, id := range []string{"1", "2"} {
		source := "We read interesting books every morning, and we learn something new every evening."
		target := "我们每天早上读有趣的书，每天晚上学习新知识。"
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: source})
		parents[id] = pairedSentence{ID: id, FullSource: source, FullTarget: target}
	}
	counts := map[string]int{}
	translator := (&Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		var request pairedTranslationInput
		if err := semanticTestPayload(prompt, &request); err != nil {
			return "", err
		}
		var output pairedTranslationOutput
		for _, source := range request.Sentences {
			counts[source.ID]++
			if source.ID == "2" && counts["2"] == 1 {
				continue
			}
			output.Sentences = append(output.Sentences, pairedTranslationOutputSentence{ID: source.ID, Segments: []pairedTranslationSegment{
				{"We read interesting books every morning,", "我们每天早上读有趣的书，"}, {"and we learn something new every evening.", "每天晚上学习新知识。"},
			}})
		}
		data, err := json.Marshal(output)
		return string(data), err
	})}).withSemanticSourceUnits()
	if err := translator.layoutFrozenSubtitles(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if counts["1"] != 1 || counts["2"] != 2 {
		t.Fatalf("已通过的同批字幕被重复请求: %v", counts)
	}
	for _, p := range parents {
		if p.LayoutFallback || len(p.Source) != 2 || !p.LayoutReviewed || !subtitleSegmentsPreserveText(p.LayoutBaseTarget, p.Target) {
			t.Fatalf("有效的冻结切分未被接受: %+v", p)
		}
	}
}

func TestFrozenLayoutKeepsExactOuterPairsWhenMiddleCandidateChangesOrder(t *testing.T) {
	source := "It's called handoff and in short it moves your work to a fresh chat at the right moment without losing any context from your original chat."
	target := "handoffという名前で、簡単に言うと、元のチャットの文脈を失わずに、適切なタイミングで作業を新しいチャットへ移してくれます。"
	original := pairedSentence{ID: "153", FullSource: source, FullTarget: target, LayoutBaseTarget: target}
	item := pairedTranslationOutputSentence{ID: original.ID, Segments: []pairedTranslationSegment{
		{"It's called handoff", "handoffという名前で、"},
		{"and in short it moves your work to a fresh chat at the right moment", "簡単に言うと、適切なタイミングで作業を新しいチャットへ移してくれます。"},
		{"without losing any context from your original chat.", "元のチャットの文脈を失わずに、"},
	}}
	translator := (&Translator{}).withSemanticSourceUnits()
	input := lengthSplitTestInput(original, 60)
	input.PreserveFinalBoundaries, input.AllowLengthOverflow = true, true
	got, err := translator.parseFrozenLayout(item, input, original, pairedTranslationSource{ID: original.ID, Text: source}, "en", "ja")
	if err != nil || len(got.Source) != 2 || got.Source[0] != item.Segments[0].Source || got.Target[0] != item.Segments[0].Target ||
		!subtitleSegmentsPreserveText(source, got.Source) || !subtitleSegmentsPreserveText(target, got.Target) || got.LayoutReviewed {
		t.Fatalf("错误切口导致丢掉有效首组、改写文字或绕过复核: %+v err=%v", got, err)
	}
	cut, total := subtitleRuneLength(got.Source[0]), subtitleRuneLength(source)
	translator.subtitleSourceOffsets = map[string]int{original.ID: 0}
	translator.subtitleTimings = []subtitleTimingSpan{{0, cut, 402440, 403440}, {cut, total, 403440, 409680}}
	got = translator.balanceFrozenLayoutTiming(got, "ja")
	if len(got.Source) != 2 {
		t.Fatal("把拉丁专名当作等量日文字符，错误吞掉了一秒的独立Handoff首组")
	}
	// 同时覆盖两端保留：中间乱序只能丢掉中间边界，不能吞掉独立尾组。
	item = pairedTranslationOutputSentence{Segments: []pairedTranslationSegment{{"First. ", "最初。"}, {"Middle ", "中央改写"}, {"content. ", "错误"}, {"Last.", "最後。"}}}
	restored, ok := mergeInvalidFrozenTargetCuts(item, "First. Middle content. Last.", "最初。中央の内容。最後。")
	if !ok || len(restored.Segments) != 3 || restored.Segments[1].Source != "Middle content." || restored.Segments[1].Target != "中央の内容。" || restored.Segments[2].Target != "最後。" {
		t.Fatalf("两端有效对应组未保留: %+v", restored)
	}
}

func TestFrozenLayoutReviewerCannotAuthorizeRewrite(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "It is easier if you practice daily.", FullTarget: "如果每天练习，事情会更容易。", LayoutBaseTarget: "如果每天练习，事情会更容易。",
		Source: []string{"It is easier", "if you practice daily."}, Target: []string{"如果每天练习，", "事情会更容易。"}, LayoutAttempts: 1}
	translator := (&Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if !strings.HasPrefix(prompt, "任务：translation_layout_review\n") {
			t.Fatal("审校改写触发了额外的含义或重写复核")
		}
		return `{"reviews":[{"sentence_id":"1","aligned":false,"natural_boundaries":true,"reason":"条件和结果配反"}],"corrections":[{"sentence_id":"1","reason":"用改写解决配对","rewrite":true,"segments":[{"source":"It is easier","target":"事情会更容易，"},{"source":"if you practice daily.","target":"如果每天练习的话。"}]}]}`, nil
	})}).withSemanticSourceUnits()
	parents := map[string]pairedSentence{"1": original}
	input := lengthSplitTestInput(original, 60)
	input.PreserveFinalBoundaries, input.AllowLengthOverflow = true, true
	if err := translator.reviewPairedLayouts(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	got := parents["1"]
	if got.LayoutReviewed || got.FullTarget != original.FullTarget || !reflect.DeepEqual(got.Target, original.Target) {
		t.Fatalf("模型批准覆盖了固定译文: %+v", got)
	}
}

func TestFrozenLayoutDoesNotMergeReadingPressureIntoOverflow(t *testing.T) {
	source := "and checking if you just gave Claude a hard rule."
	target := "Claudeにハードルールを与えたばかりかどうかをチェックすることで、この問題を解決します。"
	first := "and checking if you just gave Claude"
	cut, total := subtitleRuneLength(first), subtitleRuneLength(source)
	translator := &Translator{subtitleSourceOffsets: map[string]int{"209": 0}, subtitleTimings: []subtitleTimingSpan{{0, cut, 568000, 572480}, {cut, total, 572480, 573320}}}
	original := pairedSentence{ID: "209", FullSource: source, FullTarget: target, LayoutBaseTarget: target, LayoutTarget: 60,
		Source: []string{first, "a hard rule."}, Target: []string{"Claudeにハードルールを", "与えたばかりかどうかをチェックすることで、この問題を解決します。"}}
	before := translator.frozenLayoutTimingRisk(original, "ja")
	got := translator.balanceFrozenLayoutTiming(original, "ja")
	a, b, ok := translator.frozenLayoutTime("209", 0, total)
	if before <= 0 || len(got.Source) != 2 || !subtitleSegmentsPreserveText(target, got.Target) || !ok || a != 568000 || b != 573320 {
		t.Fatalf("阅读压力重新制造了超长整句，或原译/时间范围被修改: %+v risk=%v", got, before)
	}
	got, err := splitFrozenDisplaySentence(got, 60, "en", "ja", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	timelines, err := frozenDisplayTimelines(got.Source, got.Target, translator.subtitleTimings, 0)
	if err != nil || len(timelines) != len(got.Source) || pairedFinalLengthIssueAtLimit(got, 60) != nil {
		t.Fatalf("修复时间时破坏了长度或数量: %+v %v", timelines, err)
	}
	start, _, _ := parseSRTTimeline(timelines[0])
	_, end, _ := parseSRTTimeline(timelines[len(timelines)-1])
	if start != a || end != b {
		t.Fatal("借用了父句之外的时间")
	}
	if len(original.Source) != 2 || original.Target[0] != "Claudeにハードルールを" {
		t.Fatal("在副本上调整时修改了原始片段切片")
	}
}

func TestFrozenLayoutMigratesOldRewrittenCheckpointFromDraft(t *testing.T) {
	old := pairedSentence{ID: "21", FullSource: "Consider switching to the tab.", DraftTarget: "タブへの切り替えを検討してください。", FullTarget: "検討してください。タブへの切り替えを。",
		Source: []string{"Consider", "switching to the tab."}, Target: []string{"検討してください。", "タブへの切り替えを。"}, LayoutVersion: pairedLayoutVersion, LayoutReviewed: true, RevisionVersion: revisionVersion(), SemanticReviewed: true}
	translator := (&Translator{}).withSemanticSourceUnits()
	got, ok := translator.recoverPairedSentence(old, pairedTranslationSource{ID: old.ID, Text: old.FullSource}, "en", "ja")
	if !ok || got.FullTarget != old.DraftTarget || got.RevisionVersion != "" || got.SemanticReviewed || got.LayoutVersion != 0 || !reflect.DeepEqual(got.Target, []string{old.DraftTarget}) {
		t.Fatalf("把旧版改写误当成校准译文，或重新请求了初译: %+v", got)
	}
}

func TestFrozenLayoutExportSurvivesUnavailableLayoutAndProtectsCalibration(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.MaxSentenceLength = 60
	text := "And it's really a reason to consider switching to the Claude Code tab"
	target := "そして、Claude Codeタブへの切り替えを検討する大きな理由になります。"
	calls := 0
	translator := (&Translator{preparedTranslation: &preparedTranslationContext{Texts: []string{text}}, chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			return `{"sentences":[{"sentence_id":"1","target_text":"` + target + `"}]}`, nil
		}
		return "", errors.New("排版服务暂时不可用")
	})}).withSemanticSourceUnits()
	blocks := []*util.SrtBlock{{Index: 1, Timestamp: "00:00:58,000 --> 00:01:01,000", OriginLanguageSentence: text}}
	got, err := translator.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "ja", nil)
	var parts []string
	for _, block := range got {
		parts = append(parts, block.TargetLanguageSentence)
	}
	if err != nil || len(got) < 2 || !subtitleSegmentsPreserveText(target, parts) || validateFrozenDisplayBlocks(got, 60) != nil || calls != 2 {
		t.Fatalf("排版失败阻断翻译，或启动了多层恢复: %+v calls=%d err=%v", got, calls, err)
	}
}

func TestFrozenLayoutPropagatesCancellationAndCheckpointWriteFailure(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		ctx, stop := context.WithCancel(context.Background())
		writeErr := errors.New("checkpoint unavailable")
		translator := (&Translator{}).withSemanticSourceUnits()
		if cancel {
			stop()
		}
		original := pairedSentence{ID: "1", FullSource: "Hello.", FullTarget: "こんにちは。"}
		err := translator.layoutFrozenSubtitles(ctx, lengthSplitTestInput(original, 60), map[string]pairedSentence{"1": original}, "en", types.LanguageNameJapanese, func(pairedSentence, bool) error { return writeErr })
		stop()
		want := error(writeErr)
		if cancel {
			want = context.Canceled
		}
		if !errors.Is(err, want) {
			t.Fatalf("取消或检查点错误被当成可交付回退: %v", err)
		}
	}
}

func TestFrozenLayoutAudioUsesSavedWordTimesBeforeExport(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.MaxSentenceLength = 60
	text := "and checking if you just gave Claude a hard rule."
	target := "Claudeにハードルールを与えたばかりかどうかをチェックすることで、この問題を解決します。"
	dir := t.TempDir()
	transcription := types.TranscriptionData{Text: text, Words: []types.Word{
		{Text: "and checking if you just gave Claude", Start: 0, End: 4.48}, {Text: "a hard rule.", Start: 4.48, End: 5.32},
	}}
	if err := util.SaveToDisk(transcription, filepath.Join(dir, "audio_transcription_data_0.json")); err != nil {
		t.Fatal(err)
	}
	svc := Service{ChatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			return `{"sentences":[{"sentence_id":"1","target_text":"` + target + `"}]}`, nil
		}
		if !strings.HasPrefix(prompt, "任务：translation_frozen_layout\n") {
			t.Fatalf("意外的音频模型调用: %s", prompt)
		}
		return `{"sentences":[{"sentence_id":"1","segments":[{"source":"and checking if you just gave Claude","target":"Claudeにハードルールを"},{"source":"a hard rule.","target":"与えたばかりかどうかをチェックすることで、この問題を解決します。"}]}]}`, nil
	})}
	got, err := svc.translatePreparedText(context.Background(), dir, text, "en", "ja", false, 0, nil, &preparedTranslationContext{Texts: []string{text}}, nil)
	var sources, targets []string
	for _, item := range got {
		sources, targets = append(sources, item.OriginText), append(targets, item.TranslatedText)
	}
	if err != nil || len(got) < 2 || !subtitleSegmentsPreserveText(text, sources) || !subtitleSegmentsPreserveText(target, targets) || got[0].DisplayGroupSize != len(got) {
		t.Fatalf("音频未在导出前使用已存在的词时间修复拥挤片段: %+v err=%v", got, err)
	}
}

func TestFrozenLayoutResumeKeepsVerifiedOverflowSegments(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.MaxSentenceLength = 60
	left := "We read interesting books about many different subjects every morning,"
	right := "and we share what we have learned with our friends every evening."
	text, a, b := left+" "+right, "毎朝さまざまなテーマの面白い本を読み、", "毎晩友人と学んだことを共有します。"
	translator := (&Translator{checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: []string{text}}, chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		t.Fatal("已耗尽排版预算的检查点又请求了模型")
		return "", nil
	})}).withSemanticSourceUnits()
	checkpoint, err := translator.openTranslationCheckpoint([]string{text}, "en", "ja", nil)
	if err != nil {
		t.Fatal(err)
	}
	p := pairedSentence{ID: "1", FullSource: text, FullTarget: a + b, LayoutBaseTarget: a + b, DraftTarget: a + b,
		Source: []string{left, right}, Target: []string{a, b}, LayoutVersion: frozenPairedLayoutVersion, LayoutTarget: 60,
		LayoutReviewed: true, LayoutFallback: true, LayoutAttempts: 2, SemanticReviewed: true}
	if err := checkpoint.save(p); err != nil {
		t.Fatal(err)
	}
	blocks := []*util.SrtBlock{{Index: 1, Timestamp: "00:00:00,000 --> 00:00:15,000", OriginLanguageSentence: text}}
	got, err := translator.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "ja", nil)
	var parts []string
	for _, block := range got {
		parts = append(parts, block.TargetLanguageSentence)
	}
	if err != nil || len(got) < 3 || !subtitleSegmentsPreserveText(a+b, parts) || validateFrozenDisplayBlocks(got, 60) != nil {
		t.Fatalf("续跑未保留原译并修复既有超长片段: %+v err=%v", got, err)
	}
}
