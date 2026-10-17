package service

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"testing"
)

func TestCatalogAudioTranslationStage(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.MaxSentenceLength = 100
	sources := 0
	for _, language := range types.LanguageCatalog {
		if !language.Speech {
			continue
		}
		sources++
		t.Run(language.Code, func(t *testing.T) {
			// Synthetic routing probe; the model response is deliberately a fixture.
			text := language.NativeName + " OpenCreator 2026!"
			const target = "这是音频转录后的测试译文。"
			calls := 0
			svc := Service{ChatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
				calls++
				input, err := decodePairedTestInput(prompt)
				if err != nil || input.SourceLanguage != language.NativeName || input.TargetLanguage != "简体中文" || len(input.Sentences) != 1 || input.Sentences[0].Text != text {
					return "", fmt.Errorf("invalid translation request: %+v error=%v", input, err)
				}
				data, err := encodePairedTestResponse([]pairedSentence{{ID: "1", FullTarget: target, Source: []string{text}, Target: []string{target}}})
				return string(data), err
			})}
			workdir := t.TempDir()
			items, err := svc.splitTextAndTranslateV2(context.Background(), workdir, text, types.StandardLanguageCode(language.Code), "zh_cn", false, 1, nil)
			if err != nil || calls != 1 || len(items) != 1 || items[0].OriginText != text || items[0].TranslatedText != target {
				t.Fatalf("audio translation stage failed: calls=%d output=%+v error=%v", calls, items, err)
			}
			data, err := os.ReadFile(filepath.Join(workdir, fmt.Sprintf(types.SubtitleTaskTranslationDataPersistenceFileNamePattern, 1)))
			if err != nil {
				t.Fatal(err)
			}
			var checkpoint []*TranslatedItem
			if err := json.Unmarshal(data, &checkpoint); err != nil || len(checkpoint) != 1 || checkpoint[0].OriginText != text || checkpoint[0].TranslatedText != target {
				t.Fatalf("invalid translation checkpoint: %+v error=%v", checkpoint, err)
			}
			for _, cleaned := range []bool{false, true} {
				word := text
				if cleaned {
					word = util.CleanPunction(word)
				}
				blocks, _, err := pairedAudioTiming([]*util.SrtBlock{{Index: 1, OriginLanguageSentence: text, TargetLanguageSentence: target}}, []types.Word{{Text: word, Start: 0, End: 2}}, types.StandardLanguageCode(language.Code), 10)
				if err != nil || len(blocks) != 1 || blocks[0].Timestamp != "00:00:10,000 --> 00:00:12,000" || blocks[0].OriginLanguageSentence != text || blocks[0].TargetLanguageSentence != target {
					t.Fatalf("audio timing (cleaned=%v) failed: %+v error=%v", cleaned, blocks, err)
				}
			}
		})
	}
	if sources != 123 {
		t.Fatalf("expected 123 source languages, got %d", sources)
	}
}
