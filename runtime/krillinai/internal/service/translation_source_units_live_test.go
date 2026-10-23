package service

import (
	"context"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/BurntSushi/toml"
)

// 显式指定既有词级字幕、隔离配置和输出目录才运行，不下载、不调用ASR。
func TestSemanticSourceTranslationLive(t *testing.T) {
	configPath := os.Getenv("KRILLINAI_SOURCE_UNITS_CONFIG")
	input := os.Getenv("KRILLINAI_SOURCE_UNITS_INPUT")
	output := os.Getenv("KRILLINAI_SOURCE_UNITS_OUTPUT")
	if configPath == "" || input == "" || output == "" {
		t.Skip("需要隔离的语义分句翻译评测配置")
	}
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	if _, err := toml.DecodeFile(configPath, &config.Conf); err != nil {
		t.Fatal(err)
	}
	blocks, err := util.ParseSrtFile(input)
	if err != nil {
		t.Fatal(err)
	}
	translator := NewTranslator().withSemanticSourceUnits().withTranslationRecovery(output, nil)
	result, err := translator.BatchTranslateSrtBlocks(context.Background(), blocks, "en", "zh_cn", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(output, 0700); err != nil {
		t.Fatal(err)
	}
	for _, product := range []struct{ name, kind string }{
		{types.SubtitleTaskOriginLanguageSrtFileName, "source"},
		{types.SubtitleTaskTargetLanguageSrtFileName, "target"},
		{types.SubtitleTaskBilingualSrtFileName, "bilingual"},
	} {
		var text strings.Builder
		for i, block := range result {
			line := block.OriginLanguageSentence
			if product.kind == "target" {
				line = block.TargetLanguageSentence
			} else if product.kind == "bilingual" {
				line = block.TargetLanguageSentence + "\n" + block.OriginLanguageSentence
			}
			fmt.Fprintf(&text, "%d\n%s\n%s\n\n", i+1, block.Timestamp, line)
		}
		if err := os.WriteFile(filepath.Join(output, product.name), []byte(text.String()), 0600); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("完整导出%d条原文、译文和双语字幕", len(result))
}
