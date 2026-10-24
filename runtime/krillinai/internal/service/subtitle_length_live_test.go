package service

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/pkg/openai"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"unicode/utf8"
)

// 用真实VTT成品单独复测最终切分，冻结已有翻译；默认不调用外部服务。
func TestFrozenLengthSplitLive(t *testing.T) {
	inputDir, outputDir, endpoint := os.Getenv("KRILLINAI_SPLIT_LIVE_INPUT"), os.Getenv("KRILLINAI_SPLIT_LIVE_OUTPUT"), os.Getenv("KRILLINAI_SPLIT_LIVE_ENDPOINT")
	if inputDir == "" || outputDir == "" || endpoint == "" {
		t.Skip("指定真实字幕目录、输出目录与模型代理后启用")
	}
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.Llm.Model = "deepseek-v4-pro"
	config.Conf.LlmFallback.BaseUrl = ""
	config.Conf.App.TranslateMaxAttempts = 3
	source, err := util.ParseSrtFile(filepath.Join(inputDir, "origin_language_srt.srt"))
	if err != nil {
		t.Fatal(err)
	}
	target, err := util.ParseSrtFile(filepath.Join(inputDir, "target_language_srt.srt"))
	if err != nil || len(source) != len(target) || len(source) == 0 {
		t.Fatalf("原译文件不完整: %v", err)
	}
	input := pairedTranslationInput{MaxTargetChars: 75}
	parents := make(map[string]pairedSentence)
	var texts []string
	for i, s := range source {
		id := strconv.Itoa(i + 1)
		if s.Timestamp != target[i].Timestamp {
			t.Fatal("原译时间不一致")
		}
		texts = append(texts, s.OriginLanguageSentence)
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: s.OriginLanguageSentence})
		parents[id] = pairedSentence{ID: id, FullSource: s.OriginLanguageSentence, FullTarget: target[i].OriginLanguageSentence, Source: []string{s.OriginLanguageSentence}, Target: []string{target[i].OriginLanguageSentence}, LayoutReviewed: true, SemanticReviewed: true}
	}
	service := &YouTubeSubtitleService{}
	words, err := service.ExtractWordsFromVtt(filepath.Join(inputDir, "os0V5ADLVjM.en-orig.vtt"))
	if err != nil {
		t.Fatal(err)
	}
	spans, err := subtitleWordTimingSpans(words, strings.Join(texts, " "))
	if err != nil {
		t.Fatal(err)
	}
	translator := &Translator{chatCompleter: openai.NewClient(endpoint, "local-fixture-key", ""), onRecovery: func(s string) { t.Log(s) }}
	if err := translator.splitLongPairedSubtitles(context.Background(), input, parents, "en", "zh_cn", func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	var output []*util.SrtBlock
	var changes []map[string]any
	position, overlong := 0, 0
	for i, s := range source {
		parent := parents[strconv.Itoa(i+1)]
		if parent.FullSource != s.OriginLanguageSentence || parent.FullTarget != target[i].OriginLanguageSentence || !subtitleSegmentsPreserveText(parent.FullSource, parent.Source) || !subtitleSegmentsPreserveText(parent.FullTarget, parent.Target) {
			t.Fatalf("第%d条文字发生变化", i+1)
		}
		if pairedFinalLengthIssue(parent) != nil {
			overlong++
		}
		if len(parent.Source) > 1 {
			changes = append(changes, map[string]any{"original_index": i + 1, "source": parent.FullSource, "target": parent.FullTarget, "source_segments": parent.Source, "target_segments": parent.Target, "layout_fallback": parent.LayoutFallback})
		}
		for j, text := range parent.Source {
			start := subtitlePositionTime(spans, position, false)
			position += utf8.RuneCountInString(compactSubtitleText(text))
			end := subtitlePositionTime(spans, position, true)
			if end <= start {
				t.Fatalf("第%d条切分后时间无效", i+1)
			}
			output = append(output, &util.SrtBlock{Index: len(output) + 1, Timestamp: formatSRTTimeline(start, end), OriginLanguageSentence: text, TargetLanguageSentence: parent.Target[j]})
		}
	}
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		t.Fatal(err)
	}
	for _, write := range []func() error{
		func() error {
			return service.writeOriginLanguageSrtFile(output, filepath.Join(outputDir, "origin_language_srt.srt"))
		},
		func() error {
			return service.writeTargetLanguageSrtFile(output, filepath.Join(outputDir, "target_language_srt.srt"))
		},
		func() error {
			return service.writeBilingualSrtFile(output, filepath.Join(outputDir, "bilingual_srt.srt"), true)
		},
	} {
		if err := write(); err != nil {
			t.Fatal(err)
		}
	}
	report := map[string]any{"input_cues": len(source), "output_cues": len(output), "remaining_overlong_pairs": overlong, "text_preserved": true, "word_timing_source": "original native VTT", "changes": changes}
	data, _ := json.MarshalIndent(report, "", "  ")
	if err := os.WriteFile(filepath.Join(outputDir, "split-results.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
	fmt.Printf("Frozen split live: input=%d output=%d remaining_overlong=%d changed=%d\n", len(source), len(output), overlong, len(changes))
}
