package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"os"
	"path/filepath"
	"strings"
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

type fixedSplitCompleter struct{}

func (fixedSplitCompleter) ChatCompletion(string) (string, error) {
	return `{"short_sentences":[{"text":"then one more thing is search for file count"},{"text":"file explorer note count is the name of the plug in"}]}`, nil
}

func Test_splitOriginLongSentence(t *testing.T) {
	// 固定的测试文件路径
	testText := "then one more thing is search for file count file explorer note count is the name of the plug in install it and once enabled you can see that now I can see how many files are in each are inside each individual folder even the nested folders are showing properly now how many files are in them"
	s := &Service{ChatCompleter: fixedSplitCompleter{}}
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

type echoBatchCompleter struct {
	batchSizes []int
}

func (c *echoBatchCompleter) ChatCompletion(prompt string) (string, error) {
	const marker = "输入 JSON：\n"
	start := strings.LastIndex(prompt, marker)
	if start < 0 {
		return "", errors.New("missing input JSON")
	}
	var input struct {
		Items []struct {
			Index int    `json:"index"`
			Text  string `json:"text"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(prompt[start+len(marker):]), &input); err != nil {
		return "", err
	}
	c.batchSizes = append(c.batchSizes, len(input.Items))
	output := struct {
		Translations []struct {
			Index int    `json:"index"`
			Text  string `json:"text"`
		} `json:"translations"`
	}{}
	for _, item := range input.Items {
		output.Translations = append(output.Translations, struct {
			Index int    `json:"index"`
			Text  string `json:"text"`
		}{Index: item.Index, Text: "translated: " + item.Text})
	}
	data, err := json.Marshal(output)
	return string(data), err
}

func TestSplitTextAndTranslateUsesBatchesAndReportsProgress(t *testing.T) {
	previousMaxSentenceLength := config.Conf.App.MaxSentenceLength
	config.Conf.App.MaxSentenceLength = 100
	t.Cleanup(func() { config.Conf.App.MaxSentenceLength = previousMaxSentenceLength })

	parts := make([]string, 13)
	for index := range parts {
		parts[index] = fmt.Sprintf("Sentence number %d is here.", index+1)
	}
	completer := &echoBatchCompleter{}
	service := Service{ChatCompleter: completer}
	var progress []int
	results, err := service.splitTextAndTranslateV2(
		context.Background(),
		t.TempDir(),
		strings.Join(parts, " "),
		types.StandardLanguageCode("en"),
		types.StandardLanguageCode("zh_cn"),
		false,
		0,
		func(completed, total int) error {
			if total != 13 {
				t.Fatalf("progress total = %d, want 13", total)
			}
			progress = append(progress, completed)
			return nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(completer.batchSizes) != "[12 1]" {
		t.Fatalf("batch sizes = %v, want [12 1]", completer.batchSizes)
	}
	if fmt.Sprint(progress) != "[12 13]" {
		t.Fatalf("progress = %v, want [12 13]", progress)
	}
	if len(results) != 13 || results[12].TranslatedText == results[12].OriginText {
		t.Fatalf("unexpected results: %+v", results)
	}
}

type scriptedCompleter struct {
	responses []string
	calls     int
}

func (c *scriptedCompleter) ChatCompletion(string) (string, error) {
	if c.calls >= len(c.responses) {
		return "", errors.New("unexpected call")
	}
	response := c.responses[c.calls]
	c.calls++
	return response, nil
}

func TestTranslateSentenceRangeSplitsFailedBatch(t *testing.T) {
	log.InitLogger()
	completer := &scriptedCompleter{responses: []string{
		`not-json`,
		`{"translations":[{"index":1,"text":"A"},{"index":2,"text":"B"}]}`,
		`{"translations":[{"index":1,"text":"C"},{"index":2,"text":"D"}]}`,
	}}
	service := Service{ChatCompleter: completer}
	sentences := []string{"a", "b", "c", "d"}
	results := make([]*TranslatedItem, len(sentences))
	var completed []int
	err := service.translateSentenceRange(
		context.Background(),
		sentences,
		results,
		0,
		len(sentences),
		types.StandardLanguageCode("zh_cn"),
		false,
		func(count int) error {
			completed = append(completed, count)
			return nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if completer.calls != 3 || fmt.Sprint(completed) != "[2 2]" {
		t.Fatalf("calls = %d, completed = %v", completer.calls, completed)
	}
	if got := []string{results[0].TranslatedText, results[1].TranslatedText, results[2].TranslatedText, results[3].TranslatedText}; fmt.Sprint(got) != "[A B C D]" {
		t.Fatalf("translations = %v", got)
	}
}

func TestParseTranslationBatchRejectsMissingItems(t *testing.T) {
	_, err := parseTranslationBatch(`{"translations":[{"index":1,"text":"A"}]}`, 2)
	if err == nil {
		t.Fatal("parseTranslationBatch() error = nil, want count error")
	}
}

func TestParseTranslationBatchAcceptsFencedJSON(t *testing.T) {
	translations, err := parseTranslationBatch("```JSON\n{\"translations\":[{\"index\":1,\"text\":\"A\"}]}\n```", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(translations) != 1 || translations[0] != "A" {
		t.Fatalf("translations = %v", translations)
	}
}
