package service

import (
	"context"
	"encoding/json"
	"krillin-ai/config"
	"krillin-ai/log"
	"krillin-ai/pkg/openai"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// 复用已有源文和模型服务；默认跳过，不在普通测试中访问网络。
func TestSourceUnitsFullTranslationLive(t *testing.T) {
	sourcePath, outputDir, endpoint := os.Getenv("KRILLINAI_SOURCE_UNITS_INPUT"), os.Getenv("KRILLINAI_SOURCE_UNITS_OUTPUT"), os.Getenv("KRILLINAI_SOURCE_UNITS_ENDPOINT")
	if sourcePath == "" || outputDir == "" || endpoint == "" {
		t.Skip("set source-units input, output and local benchmark endpoint")
	}
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.Llm.Model, config.Conf.Llm.BaseUrl = "deepseek-v4-pro", endpoint
	config.Conf.LlmFallback.BaseUrl = ""
	config.Conf.App.TranslateMaxAttempts, config.Conf.App.TranslateParallelNum, config.Conf.App.VttBatchSize = 3, 3, 10
	config.Conf.App.MaxSentenceLength = 75
	log.InitLogger()
	if err := os.MkdirAll(outputDir, 0700); err != nil {
		t.Fatal(err)
	}
	write := func(name string, value any) {
		data, err := json.MarshalIndent(value, "", "  ")
		if err == nil {
			err = os.WriteFile(filepath.Join(outputDir, name), data, 0600)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	blocks, err := util.ParseSrtFile(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	var texts []string
	for _, block := range blocks {
		texts = append(texts, block.OriginLanguageSentence)
	}
	tr := newTranslator(openai.NewClient(endpoint, "benchmark", "")).withTranslationRecovery(outputDir, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Minute)
	defer cancel()
	started := time.Now()
	prepared, err := tr.prepareSourceTranslation(ctx, texts, "en")
	if err != nil {
		t.Fatal(err)
	}
	write("source-units.json", prepared.SourceUnits)
	write("segmentation-metrics.json", map[string]any{"units": len(prepared.Texts), "source_preserved": validSourceUnits(strings.Join(strings.Fields(strings.Join(texts, " ")), " "), prepared.SourceUnits), "seconds": time.Since(started).Seconds()})
	result, err := tr.BatchTranslateSrtBlocks(ctx, blocks, "en", "zh_cn", nil)
	if err != nil {
		write("failure.json", map[string]any{"error": err.Error(), "seconds": time.Since(started).Seconds()})
		t.Fatal(err)
	}
	var sources []string
	sourceLong, targetLong := 0, 0
	for _, block := range result {
		sources = append(sources, block.OriginLanguageSentence)
		if subtitleTargetLength(block.OriginLanguageSentence) > 75 {
			sourceLong++
		}
		if subtitleTargetLength(block.TargetLanguageSentence) > 75 {
			targetLong++
		}
	}
	preserved := subtitleSegmentsPreserveText(strings.Join(strings.Fields(strings.Join(texts, " ")), " "), sources)
	write("translation-metrics.json", map[string]any{"units": len(prepared.Texts), "subtitles": len(result), "source_preserved": preserved, "source_over_75": sourceLong, "target_over_75": targetLong, "seconds": time.Since(started).Seconds()})
	if !preserved {
		t.Fatal("translated subtitles do not preserve the complete source")
	}
	svc := &YouTubeSubtitleService{}
	for _, output := range []struct {
		name  string
		write func([]*util.SrtBlock, string) error
	}{
		{"origin_language_srt.srt", svc.writeOriginLanguageSrtFile},
		{"target_language_srt.srt", svc.writeTargetLanguageSrtFile},
		{"bilingual_srt.srt", func(blocks []*util.SrtBlock, path string) error { return svc.writeBilingualSrtFile(blocks, path, true) }},
	} {
		if err := output.write(result, filepath.Join(outputDir, output.name)); err != nil {
			t.Fatal(err)
		}
	}
}
