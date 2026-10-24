package service

import (
	"context"
	"encoding/json"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestDisplaySplitPreservesCrossingJapaneseOrderAndHardLimit(t *testing.T) {
	source := "It's called handoff and in short it moves your work to a fresh chat at the right moment without losing any context from your original chat."
	target := "handoffという名前で、簡単に言うと、元のチャットの文脈を失わずに、適切なタイミングで作業を新しいチャットへ移してくれます。"
	s, tr, err := splitFrozenDisplayPair(source, target, 60, "en", "ja", nil, nil, nil, nil)
	want := []string{"handoffという名前で、簡単に言うと、", "元のチャットの文脈を失わずに、", "適切なタイミングで作業を新しいチャットへ移してくれます。"}
	if err != nil || len(s) != 3 || !reflect.DeepEqual(tr, want) || !subtitleSegmentsPreserveText(source, s) {
		t.Fatalf("原译被改写，或没有选用可行的自然短切口: %q / %q %v", s, tr, err)
	}
}

func TestDisplaySplitKeepsValidNeighborsAndFrozenText(t *testing.T) {
	source := "First. " + strings.Repeat("We keep all words and numbers 123.45 intact. ", 4) + "Last."
	target := "最初。" + strings.Repeat("すべての言葉と数字123.45をそのまま保持します。", 4) + "最後。"
	p := pairedSentence{FullSource: source, FullTarget: target, LayoutBaseTarget: target,
		Source: []string{"First.", strings.Repeat("We keep all words and numbers 123.45 intact. ", 4), "Last."},
		Target: []string{"最初。", strings.Repeat("すべての言葉と数字123.45をそのまま保持します。", 4), "最後。"}}
	got, err := splitFrozenDisplaySentence(p, 60, "en", "ja", nil, nil)
	if err != nil || got.Source[0] != "First." || got.Source[len(got.Source)-1] != "Last." || got.Target[0] != "最初。" || got.Target[len(got.Target)-1] != "最後。" || pairedFinalLengthIssueAtLimit(got, 60) != nil {
		t.Fatalf("修复长组吞掉了正常邻组: %+v %v", got, err)
	}
}

func TestDisplaySplitRelaxesLocalSourceCutBeforeBreakingTargetWord(t *testing.T) {
	left := "We begin with a useful introduction,"
	right := "and then we examine every available detail of this example carefully."
	targets := []string{"Introduction.", "Supercalifragilisticexpialidocious"}
	source, target := left+" "+right, strings.Join(targets, " ")
	p := pairedSentence{FullSource: source, FullTarget: target, LayoutBaseTarget: target, Source: []string{left, right}, Target: targets}
	got, err := splitFrozenDisplaySentence(p, 60, "en", "en", nil, nil)
	if err != nil || !reflect.DeepEqual(got.Target, targets) || len(got.Source) != 2 || pairedFinalLengthIssueAtLimit(got, 60) != nil {
		t.Fatal("保留局部原文切口导致原本可保留的译文单词被拆碎", got, err)
	}
}

func TestDisplaySplitHardLimitAcrossScriptsAndOversizedIdentifiers(t *testing.T) {
	for _, tc := range []struct {
		source, target string
		lang           types.StandardLanguageCode
	}{
		{strings.Repeat("Keep every word unchanged, ", 4), strings.Repeat("保持原译不变，", 8), "zh_cn"},
		{strings.Repeat("We keep all original words. ", 5), strings.Repeat("We also keep all translated words. ", 5), "en"},
		{strings.Repeat("A long website identifier ", 6), "https://example.com/" + strings.Repeat("abcdefgh", 16), "en"},
		{strings.Repeat("We preserve emoji families. ", 5), strings.Repeat("家族👨‍👩‍👧‍👦とéをそのまま残します。", 6), "ja"},
		{strings.Repeat("We preserve all Thai letters. ", 4), strings.Repeat("เรารักษาข้อความต้นฉบับไว้", 5), "th"},
	} {
		t.Run(string(tc.lang)+tc.target[:3], func(t *testing.T) {
			s, target, err := splitFrozenDisplayPair(tc.source, tc.target, 60, "en", tc.lang, nil, nil, nil, nil)
			if err != nil || !subtitleSegmentsPreserveText(tc.source, s) || !subtitleSegmentsPreserveText(tc.target, target) || !subtitleSegmentsHaveSafeBoundaries(target) {
				t.Fatalf("长度兜底损坏文本: %q %q %v", s, target, err)
			}
			for _, parts := range [][]string{s, target} {
				for _, part := range parts {
					if !utf8.ValidString(part) || subtitleTargetLength(part) > 60 || !hasSubtitleContent(part) {
						t.Fatalf("交付了超长、空或破碎片段: %q", part)
					}
				}
			}
		})
	}
}

func TestDisplaySplitRejectsImpossibleLimitsWithoutLosingTranslation(t *testing.T) {
	p := pairedSentence{FullSource: "A", FullTarget: "日本語の原訳", LayoutBaseTarget: "日本語の原訳", Source: []string{"A"}, Target: []string{"日本語の原訳"}}
	got, err := splitFrozenDisplaySentence(p, 1, "en", "ja", nil, nil)
	if err == nil || got.FullTarget != p.FullTarget || got.LayoutBaseTarget != p.LayoutBaseTarget {
		t.Fatal("不可能的上限被当作合规交付，或丢掉译文", got, err)
	}
}

func TestDisplaySplitPrefersCompleteJapaneseTokensOverCheapInteriorCuts(t *testing.T) {
	text := "初心者から上級者になる30日間コース"
	var hints []subtitleDisplayBoundary
	position := 0
	for _, token := range []string{"初心者", "から", "上級者", "に", "なる", "30", "日間", "コース"} {
		if position > 0 {
			hints = append(hints, subtitleDisplayBoundary{position, 180})
		}
		position += len(token)
	}
	d := newSubtitleDisplayText(text, "ja", 16, hints)
	parts, ok := d.split(3, 16, false)
	if !ok || !subtitleSegmentsPreserveText(text, parts) {
		t.Fatal("没有生成可行的完整词切分", parts)
	}
	for i := 0; i+1 < len(parts); i++ {
		if strings.HasSuffix(parts[i], "か") || strings.HasSuffix(parts[i], "日") {
			t.Fatal("把NLP的完整词切成了更便宜的内部字符", parts)
		}
	}
}

func TestDisplayTimingFastParentDoesNotAmplifyPeakReadingLoad(t *testing.T) {
	sources := []string{"If you enjoyed this video,", "please like and subscribe."}
	targets := []string{"この動画を楽しんでいただけたなら、", "ぜひ高評価とチャンネル登録をお願いします。"}
	cut := subtitleRuneLength(sources[0])
	spans := []subtitleTimingSpan{{0, cut, 10000, 10900}, {cut, cut + subtitleRuneLength(sources[1]), 10900, 11320}}
	timelines, err := frozenDisplayTimelines(sources, targets, spans, 0)
	if err != nil {
		t.Fatal(err)
	}
	average := float64(subtitleRuneLength(strings.Join(targets, ""))) / 1.32
	for i, timeline := range timelines {
		start, end, _ := parseSRTTimeline(timeline)
		cps := float64(subtitleRuneLength(targets[i])) * 1000 / float64(end-start)
		if cps > average*1.01 {
			t.Fatal("最短时长目标把本来已经很快的父句挤得更快", timelines, cps, average)
		}
	}
}

func TestDisplayTimingRebalancesWithinParentAndPreservesGoodAnchors(t *testing.T) {
	sources := []string{"We read", "the complete text", "every day."}
	targets := []string{"私たちは読みます。", "元の文章のすべての言葉を削除せずにそのまま保持します。", "毎日。"}
	a, b := subtitleRuneLength(sources[0]), subtitleRuneLength(sources[0]+sources[1])
	total := subtitleRuneLength(strings.Join(sources, ""))
	spans := []subtitleTimingSpan{{0, a, 10000, 11000}, {a, b, 11000, 11100}, {b, total, 11100, 14000}}
	timelines, err := frozenDisplayTimelines(sources, targets, spans, 0)
	if err != nil {
		t.Fatal(err)
	}
	previous := int64(10000)
	for _, line := range timelines {
		start, end, err := parseSRTTimeline(line)
		if err != nil || start != previous || end <= start || end > 14000 {
			t.Fatal("调整时间借用了父句外时间、重叠或出现非正时长", timelines)
		}
		previous = end
	}
	start, end, _ := parseSRTTimeline(timelines[1])
	if end-start < 650 || previous != 14000 {
		t.Fatal("长译文仍被挤在0.1秒，或改变了父句结束时间", timelines)
	}
	good := []subtitleTimingSpan{{0, a, 10000, 11500}, {a, b, 11500, 14000}, {b, total, 14000, 15000}}
	timelines, err = frozenDisplayTimelines(sources, targets, good, 0)
	if err != nil || timelines[0] != "00:00:10,000 --> 00:00:11,500" || timelines[1] != "00:00:11,500 --> 00:00:14,000" {
		t.Fatal("可用的原文词时间被无故重分", timelines, err)
	}
}

func TestDisplayAudioExportRetainsGroupsAfterCheckpointRoundTrip(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.MaxSentenceLength = 60
	source := "and checking if you just gave Claude a hard rule."
	target := "Claudeにハードルールを与えたばかりかどうかをチェックすることで、この問題を解決します。"
	p, err := splitFrozenDisplaySentence(pairedSentence{FullSource: source, FullTarget: target, LayoutBaseTarget: target}, 60, "en", "ja", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	items := flattenPairedSentences([]pairedSentence{p})
	data, _ := json.Marshal(items)
	var restored []*TranslatedItem
	if err := json.Unmarshal(data, &restored); err != nil || restored[0].DisplayGroupSize != len(items) {
		t.Fatal("音频检查点丢失完整句分组", err)
	}
	var blocks []*util.SrtBlock
	var groups []int
	for i, item := range restored {
		groups = append(groups, item.DisplayGroupSize)
		blocks = append(blocks, &util.SrtBlock{Index: i + 1, OriginLanguageSentence: item.OriginText, TargetLanguageSentence: item.TranslatedText})
	}
	words := []types.Word{{Text: "and checking if you just gave Claude", Start: 0, End: 4.48}, {Text: "a hard rule.", Start: 4.48, End: 5.32}}
	dir := t.TempDir()
	param := &types.SubtitleTaskStepParam{TaskBasePath: dir, OriginLanguage: "en", TargetLanguage: "ja"}
	if err := generateSrtWithTimestamps(blocks, 10, words, 0, param, groups); err != nil {
		t.Fatal(err)
	}
	if err := validateFrozenDisplayBlocks(blocks, 60); err != nil {
		t.Fatal(err)
	}
	start, _, _ := parseSRTTimeline(blocks[0].Timestamp)
	_, end, _ := parseSRTTimeline(blocks[len(blocks)-1].Timestamp)
	if start != 10000 || end != 15320 {
		t.Fatal("音频时间偏移或父句范围错误", blocks)
	}
	param.BilingualSrtFilePath = filepath.Join(dir, fmtSrtName(types.SubtitleTaskSplitBilingualSrtFileNamePattern))
	if err := splitSrt(param); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{types.SubtitleTaskOriginLanguageSrtFileName, types.SubtitleTaskTargetLanguageSrtFileName} {
		exported, err := util.ParseSrtFile(filepath.Join(dir, name))
		if err != nil || len(exported) != len(blocks) {
			t.Fatal("音频单语字幕导出不完整", name, err)
		}
		for i, block := range exported {
			want := blocks[i].OriginLanguageSentence
			if name == types.SubtitleTaskTargetLanguageSrtFileName {
				want = blocks[i].TargetLanguageSentence
			}
			if block.OriginLanguageSentence != want || block.Timestamp != blocks[i].Timestamp {
				t.Fatal("音频单语导出改变了文字或时间", name, block)
			}
		}
	}
	for _, name := range []string{fmtSrtName(types.SubtitleTaskSplitBilingualSrtFileNamePattern), fmtSrtName(types.SubtitleTaskSplitShortOriginMixedSrtFileNamePattern)} {
		if info, err := os.Stat(filepath.Join(dir, name)); err != nil || info.Size() == 0 {
			t.Fatal("实际字幕未导出", name, err)
		}
	}
}

func fmtSrtName(pattern string) string { return strings.ReplaceAll(pattern, "%d", "0") }

func TestDisplayFinalGuardRejectsOverflowsLineBreaksAndOverlaps(t *testing.T) {
	for _, block := range []*util.SrtBlock{
		{Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: strings.Repeat("a", 61), TargetLanguageSentence: "译文"},
		{Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: "source", TargetLanguageSentence: "译文\n译文"},
		{Timestamp: "00:00:00,000 --> 00:00:00,000", OriginLanguageSentence: "source", TargetLanguageSentence: "译文"},
	} {
		if validateFrozenDisplayBlocks([]*util.SrtBlock{block}, 60) == nil {
			t.Fatal("不合法成品绕过最终检查", block)
		}
	}
	block := &util.SrtBlock{Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: "source", TargetLanguageSentence: "译文"}
	if validateFrozenDisplayBlocks([]*util.SrtBlock{block, block}, 60) == nil {
		t.Fatal("重叠字幕绕过最终检查")
	}
}

func TestDisplayNLPHintsUnavailableDoesNotBlockFallback(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := (&Translator{}).displayBoundaryHints(ctx, []string{"Text."}, "en"); err == nil {
		t.Fatal("取消被吞掉")
	}
	if hints, err := (&Translator{}).displayBoundaryHints(context.Background(), []string{"Text."}, "en"); err != nil || hints != nil {
		t.Fatal("没有NLP时不能继续本地排版", hints, err)
	}
}
