package service

import (
	"fmt"
	"krillin-ai/config"
	"krillin-ai/log"
	"os"
	"path/filepath"
	"testing"

	"github.com/BurntSushi/toml"
	"go.uber.org/zap"
)

func Test_isValidSplitContent(t *testing.T) {
	dir := t.TempDir()
	splitContentFile := filepath.Join(dir, "srt_no_ts_1.srt")
	originalTextFile := filepath.Join(dir, "origin_1.txt")
	splitContentFixture := "1\n[学习速记是一项技能]\n[learning shorthand is a skill]\n\n2\n[它能够改变你的人生]\n[that could change your life]\n"
	originalTextFixture := "learning shorthand is a skillthat could change your life"

	if err := os.WriteFile(splitContentFile, []byte(splitContentFixture), 0o600); err != nil {
		t.Fatalf("写入分割内容测试文件失败: %v", err)
	}
	if err := os.WriteFile(originalTextFile, []byte(originalTextFixture), 0o600); err != nil {
		t.Fatalf("写入原始文本测试文件失败: %v", err)
	}

	// 读取分割内容文件
	splitContent, err := os.ReadFile(splitContentFile)
	if err != nil {
		t.Fatalf("读取分割内容文件失败: %v", err)
	}

	// 读取原始文本文件
	originalText, err := os.ReadFile(originalTextFile)
	if err != nil {
		t.Fatalf("读取原始文本文件失败: %v", err)
	}

	// 执行测试
	if _, err := parseAndCheckContent(string(splitContent), string(originalText)); err != nil {
		t.Errorf("parseAndCheckContent() error = %v, want nil", err)
	}
}

func loadTestConfig() bool {
	var err error
	configPath := "../../config/config.toml"
	if _, err = os.Stat(configPath); os.IsNotExist(err) {
		log.GetLogger().Info("未找到配置文件")
		return false
	} else {
		log.GetLogger().Info("已找到配置文件，从配置文件中加载配置")
		if _, err = toml.DecodeFile(configPath, &config.Conf); err != nil {
			log.GetLogger().Error("加载配置文件失败", zap.Error(err))
			return false
		}
		return true
	}
}

func initService() *Service {
	log.InitLogger()
	loadTestConfig()
	return NewService()
}

func Test_splitOriginLongSentence(t *testing.T) {
	// 固定的测试文件路径
	testText := "then one more thing is search for file count file explorer note count is the name of the plug in install it and once enabled you can see that now I can see how many files are in each are inside each individual folder even the nested folders are showing properly now how many files are in them"
	s := initService()
	// 执行测试
	splitTextSentences, err := s.splitOriginLongSentence(testText)
	if err != nil {
		t.Errorf("splitOriginLongSentence() error = %v, want nil", err)
	}

	fmt.Println("testText:", testText)
	for i, sentence := range splitTextSentences {
		fmt.Printf("Sentence %d: %s\n", i+1, sentence)
	}
}
