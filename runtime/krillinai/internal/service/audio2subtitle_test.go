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

type progressTranscriber struct {
	progress []int
}

func (t progressTranscriber) Transcription(audioFile, language, workDir string) (*types.TranscriptionData, error) {
	return t.TranscriptionWithProgress(audioFile, language, workDir, nil)
}

func (t progressTranscriber) TranscriptionWithProgress(
	_, _, _ string,
	reportProgress func(percent int),
) (*types.TranscriptionData, error) {
	for _, percent := range t.progress {
		if reportProgress != nil {
			reportProgress(percent)
		}
	}
	return &types.TranscriptionData{Text: "transcribed"}, nil
}

func TestTranscribeAudioForwardsProviderProgress(t *testing.T) {
	service := Service{Transcriber: progressTranscriber{progress: []int{0, 33, 66, 100}}}
	var reported []int

	result, err := service.transcribeAudio(
		0,
		"sample.mp3",
		"zh_cn",
		t.TempDir(),
		func(percent int) {
			reported = append(reported, percent)
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "transcribed" {
		t.Fatalf("transcription text = %q", result.Text)
	}
	if got := fmt.Sprint(reported); got != "[0 33 66 100]" {
		t.Fatalf("reported progress = %s", got)
	}
}

func TestAudioProcessPercentUsesDetailedTranscriptionAndTranslationProgress(t *testing.T) {
	const (
		splitWeight      = 0.1
		transcribeWeight = 0.4
		translateWeight  = 0.5
	)
	tests := []struct {
		name          string
		split         int
		transcription float64
		translation   float64
		want          uint8
	}{
		{name: "audio split", split: 1, want: 22},
		{name: "transcription one third", split: 1, transcription: 0.33, want: 32},
		{name: "transcription two thirds", split: 1, transcription: 0.66, want: 42},
		{name: "transcription complete", split: 1, transcription: 1, want: 52},
		{name: "primary translation complete", split: 1, transcription: 1, translation: 0.35, want: 65},
		{name: "long sentence halfway", split: 1, transcription: 1, translation: 0.675, want: 77},
		{name: "subtitle processing complete", split: 1, transcription: 1, translation: 1, want: 90},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			transcription := map[int]float64{}
			if test.transcription > 0 {
				transcription[0] = test.transcription
			}
			translation := map[int]float64{}
			if test.translation > 0 {
				translation[0] = test.translation
			}
			got := audioProcessPercent(
				1,
				test.split,
				transcription,
				translation,
				splitWeight,
				transcribeWeight,
				translateWeight,
			)
			if got != test.want {
				t.Fatalf("audioProcessPercent() = %d, want %d", got, test.want)
			}
		})
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

func TestSplitTranslateItemReportsLongSentenceProgress(t *testing.T) {
	previousMaxSentenceLength := config.Conf.App.MaxSentenceLength
	config.Conf.App.MaxSentenceLength = 10
	t.Cleanup(func() { config.Conf.App.MaxSentenceLength = previousMaxSentenceLength })

	completer := &scriptedCompleter{responses: []string{
		`{"align":[{"origin_part":"first origin part","translated_part":"first translated part"}]}`,
		`{"align":[{"origin_part":"second origin part","translated_part":"second translated part"}]}`,
	}}
	service := Service{ChatCompleter: completer}
	items := []*TranslatedItem{
		{OriginText: "short", TranslatedText: "short"},
		{
			OriginText:     strings.Repeat("first origin ", 8),
			TranslatedText: strings.Repeat("first translated ", 8),
		},
		{
			OriginText:     strings.Repeat("second origin ", 8),
			TranslatedText: strings.Repeat("second translated ", 8),
		},
	}
	var progress []string

	_, err := service.splitTranslateItem(items, func(completed, total int) {
		progress = append(progress, fmt.Sprintf("%d/%d", completed, total))
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := fmt.Sprint(progress); got != "[0/2 1/2 2/2]" {
		t.Fatalf("progress = %s", got)
	}
}
