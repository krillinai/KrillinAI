package service

import (
	"context"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSemanticSourceUnitsParseBeforeBudgetAndKeepPhrases(t *testing.T) {
	parts := []string{
		"I have to finish these modules before school starts",
		"I had a bit of an existential crisis after I finished this book",
	}
	for len(strings.Join(parts, " ")) < 4000 {
		parts = append(parts, "Here is another complete phrase about my daily plans")
	}
	text := strings.Join(parts, " ")
	calls := 0
	translator := (&Translator{nlpSegmenter: func(_ context.Context, input []string, language types.StandardLanguageCode) (translationNLPResult, error) {
		calls++
		if !reflect.DeepEqual(input, []string{text}) {
			t.Fatal("NLP 收到已经按预算拆坏的文本")
		}
		counts := make([]int, len(parts))
		for i, part := range parts {
			counts[i] = len(strings.Fields(part))
		}
		return translationNLPResult{Model: "test", Segments: [][]string{parts}, Tokens: [][]int{counts}}, nil
	}}).withSemanticSourceUnits()
	got, err := translator.prepareSemanticTranslationUnits(context.Background(), []string{text}, "en")
	if err != nil || calls != 1 || !reflect.DeepEqual(got, parts) {
		t.Fatalf("units=%q calls=%d err=%v", got, calls, err)
	}
}

func TestSemanticSourceUnitsFallbackAndCancellation(t *testing.T) {
	log.InitLogger()
	translator := (&Translator{nlpSegmenter: func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error) {
		return translationNLPResult{}, errors.New("parser unavailable")
	}}).withSemanticSourceUnits()
	got, err := translator.prepareSemanticTranslationUnits(context.Background(), []string{"First sentence. Second sentence."}, "en")
	if err != nil || !reflect.DeepEqual(got, []string{"First sentence.", "Second sentence."}) {
		t.Fatalf("fallback=%q err=%v", got, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = translator.prepareSemanticTranslationUnits(ctx, []string{"First."}, "en"); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancel error=%v", err)
	}
}

func TestSemanticSourceUnitBatchesBoundSizeAndKeepContext(t *testing.T) {
	var texts []string
	for i := range 26 {
		texts = append(texts, fmt.Sprintf("Unit %d describes a separate activity during this day.", i))
	}
	batches, err := buildPairedTranslationBatchesForMode(texts, nil, "en", "zh_cn", 60, 12, true)
	if err != nil {
		t.Fatal(err)
	}
	position := 0
	for _, batch := range batches {
		chars := 0
		for _, source := range batch.Sentences {
			if source.Text != texts[position] || source.ID != fmt.Sprint(position+1) {
				t.Fatal("合批丢失原文顺序或 ID")
			}
			chars += utf8.RuneCountInString(source.Text) + 1
			position++
		}
		if len(batch.Sentences) > 10 || chars > 600 {
			t.Fatalf("batch size=%d chars=%d", len(batch.Sentences), chars)
		}
	}
	if position != len(texts) || !reflect.DeepEqual(batches[1].Before, texts[7:10]) || !reflect.DeepEqual(batches[0].After, texts[10:12]) {
		t.Fatalf("批次上下文不正确: %+v", batches)
	}
	long := strings.Repeat("word ", 140)
	if batches, err = buildPairedTranslationBatchesForMode([]string{long}, nil, "en", "zh_cn", 60, 10, true); err != nil || len(batches) != 1 {
		t.Fatalf("单个长意群不能被600字符参考阻断: %v", err)
	}
}

func TestSemanticSourceUnitsKeepWordTimesAndLeaveSRTModeUnchanged(t *testing.T) {
	log.InitLogger()
	parts := []string{"We finish the modules before school starts.", "Then we read another book."}
	text := strings.Join(parts, " ")
	base := &Translator{nlpSegmenter: func(_ context.Context, input []string, _ types.StandardLanguageCode) (translationNLPResult, error) {
		if !reflect.DeepEqual(input, []string{text}) {
			t.Fatalf("没有跨原字幕行识别完整短语: %q", input)
		}
		return translationNLPResult{Model: "test", Segments: [][]string{parts}, Tokens: [][]int{{8, 6}}}, nil
	}, chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		input, err := decodePairedTestInput(prompt)
		if err != nil {
			return "", err
		}
		if len(input.Sentences) != 2 || input.Sentences[0].Text != parts[0] || input.Sentences[1].Text != parts[1] {
			t.Fatal("语义意群没有成为真实翻译单元")
		}
		return echoPairedTestResponse(input)
	})}
	translator := base.withSemanticSourceUnits()
	if base.semanticSourceUnits {
		t.Fatal("平台入口修改了可被SRT入口复用的Translator")
	}
	var blocks []*util.SrtBlock
	for i, word := range strings.Fields(text) {
		blocks = append(blocks, &util.SrtBlock{Index: i + 1, Timestamp: formatSRTTimeline(int64(i)*1000, int64(i+1)*1000), OriginLanguageSentence: word})
	}
	got, err := translator.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "zh_cn", nil)
	if err != nil || len(got) != 2 {
		t.Fatalf("output=%+v err=%v", got, err)
	}
	if got[0].Timestamp != formatSRTTimeline(0, 7000) || got[1].Timestamp != formatSRTTimeline(7000, 12000) {
		t.Fatalf("意群时间映射错误: %+v", got)
	}
}
