package service

import (
	"context"
	"krillin-ai/config"
	"krillin-ai/pkg/util"
	"strings"
	"testing"
)

func TestPairedSoftLayoutRepairsReportedFragments(t *testing.T) {
	for _, tc := range []struct {
		source, target         []string
		wantSource, wantTarget string
	}{
		{[]string{"in this cabin, they're all full of books", "that are partially complete."}, []string{"都摆满了", "部分完成的书。"}, "in this cabin, they're all full of books that are partially complete.", "都摆满了部分完成的书。"},
		{[]string{"trashy I think I might even have a Mills & Boon", "book somewhere."}, []string{"垃圾读物，我想我可能还有一本米尔斯与布恩出版社的", "书。"}, "trashy I think I might even have a Mills & Boon book somewhere.", "垃圾读物，我想我可能还有一本米尔斯与布恩出版社的书。"},
	} {
		// 同时覆盖旧50与本轮75；不是只放宽配置才修复短尾。
		for _, limit := range []int{50, 75} {
			item := pairedTranslationOutputSentence{ID: "1", FullTarget: tc.wantTarget}
			for i := range tc.source {
				item.Segments = append(item.Segments, pairedTranslationSegment{tc.source[i], tc.target[i]})
			}
			// 即使错误切口碰巧也是NLP建议，也不能保留“书。”这样的孤立尾巴。
			got, changed := optimizePairedLayout(item, tc.wantSource, limit, tc.source)
			if !changed || len(got.Segments) != 1 || got.Segments[0].Source != tc.wantSource || got.Segments[0].Target != tc.wantTarget {
				t.Fatalf("limit=%d got=%+v", limit, got)
			}
		}
	}
}

func TestPairedSoftLayoutPreservesIndependentRepliesAndLongClauses(t *testing.T) {
	for _, tc := range []struct {
		source, target []string
		limit          int
		want           int
	}{
		{[]string{"No.", "I have not finished this book yet."}, []string{"不。", "我还没有读完这本书。"}, 75, 2},
		{[]string{strings.Repeat("word ", 14), strings.Repeat("more ", 14)}, []string{strings.Repeat("甲", 30), strings.Repeat("乙", 30)}, 75, 2},
		{[]string{"هذه كتب كثيرة ", "غير مكتملة"}, []string{"这些全都是", "没有写完的书。"}, 75, 1},
		{[]string{"ये सारी किताबें ", "अधूरी हैं"}, []string{"这些书全都", "还没写完。"}, 75, 1},
		{[]string{"これらはすべて", "未完成の本です"}, []string{"这些全都是", "未完成的书。"}, 75, 1},
	} {
		item := pairedTranslationOutputSentence{FullTarget: strings.Join(tc.target, "")}
		for i := range tc.source {
			item.Segments = append(item.Segments, pairedTranslationSegment{tc.source[i], tc.target[i]})
		}
		full := strings.Join(tc.source, "")
		got, _ := optimizePairedLayout(item, full, tc.limit)
		if len(got.Segments) != tc.want {
			t.Fatalf("%q got=%+v", full, got)
		}
		var src, tgt []string
		for _, pair := range got.Segments {
			src = append(src, pair.Source)
			tgt = append(tgt, pair.Target)
		}
		if !subtitleSegmentsPreserveText(full, src) || !subtitleSegmentsPreserveText(item.FullTarget, tgt) {
			t.Fatal("合并改变内容或空格")
		}
	}
}

func TestPairedSoftLayoutDoesNotFillNaturalUnitsToLimit(t *testing.T) {
	source := "I read books every day, and I talk about them with friends."
	item := pairedTranslationOutputSentence{FullTarget: "我每天都会读书，而且会和朋友讨论这些书。", Segments: []pairedTranslationSegment{
		{"I read books every day,", "我每天都会读书，"}, {"and I talk about them with friends.", "而且会和朋友讨论这些书。"},
	}}
	got, changed := optimizePairedLayout(item, source, 75)
	if changed || len(got.Segments) != 2 {
		t.Fatalf("为减少条数回并了合理切口: %+v", got)
	}
}

func TestPairedSoftLayoutRepairsBoundariesWithLockedTarget(t *testing.T) {
	source := "I have many books that are unfinished and I keep collecting new books every single day."
	target := "我有很多尚未读完的书，而且我每天还在不断地收集新书。"
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		pairs := []pairedTranslationSegment{{source, target}}
		if calls > 1 {
			if input.Sentences[0].TargetText != target {
				t.Fatal("重排没有锁定完整译文")
			}
			pairs = []pairedTranslationSegment{{"I have many books that are unfinished", "我有很多尚未读完的书，"}, {"and I keep collecting new books every single day.", "而且我每天还在不断地收集新书。"}}
		}
		sentence := pairedSentence{ID: "1", FullTarget: target}
		for _, p := range pairs {
			sentence.Source = append(sentence.Source, p.Source)
			sentence.Target = append(sentence.Target, p.Target)
		}
		data, err := encodePairedTestResponse([]pairedSentence{sentence})
		return string(data), err
	})}
	got, err := translator.translatePairedSentences(context.Background(), []string{source}, "en", "zh_cn", 50, 1, nil)
	if err != nil || calls != 2 || len(got) != 1 || got[0].FullTarget != target || len(got[0].Source) != 2 || got[0].LayoutFallback {
		t.Fatalf("calls=%d got=%+v err=%v", calls, got, err)
	}
}

func TestPairedSoftLayoutCheckpointReflowsWithoutRetranslation(t *testing.T) {
	translator := &Translator{checkpointDir: t.TempDir()}
	texts := []string{"All these books are unfinished."}
	translator.chatCompleter = translationCompleterFunc(func(string) (string, error) { return "", nil })
	plan, err := translator.prepareTranslationSemanticPlan(context.Background(), texts, "en", "zh_cn")
	if err != nil {
		t.Fatal(err)
	}
	checkpoint, err := translator.openTranslationCheckpoint(texts, "en", "zh_cn", plan)
	if err != nil {
		t.Fatal(err)
	}
	target := "这些书都还没有写完。"
	if err := checkpoint.save(pairedSentence{ID: "1", FullSource: texts[0], FullTarget: target, Source: []string{"All these books", "are unfinished."}, Target: []string{"这些书都", "还没有写完。"}, SemanticReviewed: true, LayoutTarget: 50, LayoutVersion: pairedLayoutVersion}); err != nil {
		t.Fatal(err)
	}
	translator.chatCompleter = translationCompleterFunc(func(string) (string, error) { t.Fatal("安全回并不应重新调用翻译"); return "", nil })
	got, err := translator.translatePairedSentences(context.Background(), texts, "en", "zh_cn", 75, 1, nil)
	if err != nil || len(got) != 1 || len(got[0].Source) != 1 || got[0].LayoutFallback || got[0].LayoutTarget != 75 {
		t.Fatalf("got=%+v err=%v", got, err)
	}
}

func TestPairedSoftLayoutRebuildsSharedTimingAfterMerge(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.MaxSentenceLength = 75
	input := []*util.SrtBlock{
		{Index: 1, Timestamp: "00:00:13,560 --> 00:00:16,640", OriginLanguageSentence: "in this cabin, they're all full of books"},
		{Index: 2, Timestamp: "00:00:16,640 --> 00:00:18,360", OriginLanguageSentence: "that are partially complete."},
	}
	calls := 0
	translator := &Translator{chatCompleter: translationCompleterFunc(func(string) (string, error) {
		calls++
		data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: "都摆满了部分完成的书。", Source: []string{input[0].OriginLanguageSentence, input[1].OriginLanguageSentence}, Target: []string{"都摆满了", "部分完成的书。"}}})
		return string(data), err
	})}
	got, err := translator.BatchTranslateSrtBlocks(context.Background(), input, "en", "zh_cn", nil)
	if err != nil || calls != 1 || len(got) != 1 || got[0].Timestamp != "00:00:13,560 --> 00:00:18,360" || got[0].TargetLanguageSentence != "都摆满了部分完成的书。" {
		t.Fatalf("calls=%d got=%+v err=%v", calls, got, err)
	}
}

func TestPairedLayoutRestoresOnlyBoundaryPunctuation(t *testing.T) {
	for _, tc := range []struct {
		target []string
		want   bool
	}{
		{[]string{"黑格尔很难读", "我只是断断续续地读。"}, true},
		{[]string{"黑格尔很难读，", "我只是断断续续地读。"}, false},
		{[]string{"黑格尔很难读", "断断续续地读。"}, false},
		{[]string{"我只是断断续续地读", "黑格尔很难读。"}, false},
		{[]string{"黑格尔，难读", "我只是断断续续地读。"}, false},
	} {
		item := pairedTranslationOutputSentence{FullTarget: "黑格尔很难读，我只是断断续续地读。", Segments: []pairedTranslationSegment{{"Hegel is difficult to read,", tc.target[0]}, {"I dip in and out.", tc.target[1]}}}
		got, changed := restorePairedTargetBoundaryPunctuation(item)
		if changed != tc.want {
			t.Fatalf("targets=%q changed=%v", tc.target, changed)
		}
		if changed && got.Segments[0].Target != "黑格尔很难读，" {
			t.Fatal("没有从完整译文恢复边界标点")
		}
	}
}
