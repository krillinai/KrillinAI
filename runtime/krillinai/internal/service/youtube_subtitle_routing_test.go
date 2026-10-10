package service

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/util"
)

type subtitleRoutingCompleter struct{}

func (subtitleRoutingCompleter) ChatCompletion(prompt string) (string, error) {
	_, input, found := strings.Cut(prompt, "Input subtitles:\n")
	if !found {
		return "", nil
	}
	input, _, _ = strings.Cut(input, "\nRequired JSON format")
	matches := regexp.MustCompile("(?m)^(\\d+)\\. (.+)$").FindAllStringSubmatch(input, -1)
	translations := make([]map[string]any, 0, len(matches))
	for _, match := range matches {
		index, err := strconv.Atoi(match[1])
		if err != nil {
			return "", err
		}
		translations = append(translations, map[string]any{"index": index, "text": "测试译文：" + match[2]})
	}
	data, err := json.Marshal(map[string]any{"translations": translations})
	return string(data), err
}

func subtitleRoutingTestService(test *testing.T) *YouTubeSubtitleService {
	test.Helper()
	previousLogger := log.Logger
	log.Logger = zap.NewNop()
	previousApp := config.Conf.App
	config.Conf.App.EnableBlockVttBatch = false
	config.Conf.App.VttBatchSize = 10
	test.Cleanup(func() {
		log.Logger = previousLogger
		config.Conf.App = previousApp
	})
	return &YouTubeSubtitleService{translator: &Translator{chatCompleter: subtitleRoutingCompleter{}}}
}

func subtitleRoutingTestRequest(test *testing.T, content string) *YoutubeSubtitleReq {
	test.Helper()
	directory := test.TempDir()
	input := filepath.Join(directory, "source.en.vtt")
	if err := os.WriteFile(input, []byte(content), 0644); err != nil {
		test.Fatal(err)
	}
	return &YoutubeSubtitleReq{
		TaskBasePath:   directory,
		TaskId:         "routing-test",
		OriginLanguage: "en",
		TargetLanguage: "zh_cn",
		VttFile:        input,
		TaskPtr:        &types.SubtitleTask{},
	}
}

const blockSubtitleRoutingFixture = "WEBVTT\nKind: captions\nLanguage: en\n\n00:00:00.000 --> 00:00:03.000\nThere's a great expression that says, go together.\n\n00:00:10.000 --> 00:00:14.000\nPeople need leadership.\n\n00:00:21.000 --> 00:00:22.000\nNothing.\n"

func TestProcessYouTubeSubtitleRoutesBlockVttWhenBatchDisabled(test *testing.T) {
	service := subtitleRoutingTestService(test)
	service.translator = nil
	request := subtitleRoutingTestRequest(test, blockSubtitleRoutingFixture)
	request.SourceOnly = true
	output, err := service.processYouTubeSubtitle(context.Background(), request)
	if err != nil {
		test.Fatal(err)
	}
	blocks, err := util.ParseSrtFile(output)
	if err != nil {
		test.Fatal(err)
	}
	if len(blocks) != 3 || blocks[0].OriginLanguageSentence != "There's a great expression that says, go together." {
		test.Fatalf("整句字幕正文丢失: %+v", blocks)
	}
	if request.TaskPtr.ProcessPct != 100 {
		test.Fatalf("有效原文字幕未完成: %d", request.TaskPtr.ProcessPct)
	}
	if _, err := os.Stat(filepath.Join(request.TaskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)); !os.IsNotExist(err) {
		test.Fatalf("仅原文模式不应生成翻译字幕: %v", err)
	}
}

func TestProcessYouTubeSubtitleBlockVttProducesRequiredOutputs(test *testing.T) {
	service := subtitleRoutingTestService(test)
	for _, targetFirst := range []bool{false, true} {
		test.Run(strconv.FormatBool(targetFirst), func(test *testing.T) {
			request := subtitleRoutingTestRequest(test, blockSubtitleRoutingFixture)
			request.TargetLanguageFirst = targetFirst
			output, err := service.processYouTubeSubtitle(context.Background(), request)
			if err != nil {
				test.Fatal(err)
			}
			for _, name := range []string{
				types.SubtitleTaskOriginLanguageSrtFileName,
				types.SubtitleTaskTargetLanguageSrtFileName,
				types.SubtitleTaskBilingualSrtFileName,
				filepath.Join("output", "origin_language.txt"),
				filepath.Join("output", "target_language.txt"),
			} {
				data, err := os.ReadFile(filepath.Join(request.TaskBasePath, name))
				if err != nil || len(data) == 0 {
					test.Fatalf("必需产物缺失或为空 %s: %v", name, err)
				}
			}
			blocks, err := util.ParseSrtFile(output)
			if err != nil || len(blocks) != 3 {
				test.Fatalf("双语字幕数量=%d: %v", len(blocks), err)
			}
			firstIsTarget := strings.HasPrefix(blocks[0].OriginLanguageSentence, "测试译文：")
			if firstIsTarget != targetFirst {
				test.Fatal("双语字幕顺序与请求不一致")
			}
			if request.TaskPtr.ProcessPct != 100 {
				test.Fatalf("完成进度=%d", request.TaskPtr.ProcessPct)
			}
		})
	}
}

func TestProcessYouTubeSubtitleRejectsInvalidBlockVtt(test *testing.T) {
	service := subtitleRoutingTestService(test)
	for _, content := range []string{
		"WEBVTT\n",
		"WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n\n",
		"WEBVTT\n\n00:00:02.000 --> 00:00:01.000\nInvalid time interval.\n",
	} {
		request := subtitleRoutingTestRequest(test, content)
		request.SourceOnly = true
		if _, err := service.processYouTubeSubtitle(context.Background(), request); err == nil {
			test.Fatal("空字幕或无效时间轴不应成功")
		}
		if request.TaskPtr.ProcessPct == 100 {
			test.Fatal("不合格字幕不应报告完成")
		}
	}
}

func TestProcessYouTubeSubtitleRejectsMissingVtt(test *testing.T) {
	service := subtitleRoutingTestService(test)
	request := subtitleRoutingTestRequest(test, blockSubtitleRoutingFixture)
	request.VttFile = filepath.Join(request.TaskBasePath, "missing.vtt")
	if _, err := service.processYouTubeSubtitle(context.Background(), request); err == nil {
		test.Fatal("格式检测失败不应默认按逐词字幕处理")
	}
}

func TestDetectVttFormatScansBeyondFirstHundredLines(test *testing.T) {
	service := subtitleRoutingTestService(test)
	content := "WEBVTT\n" + strings.Repeat("\n", 110) + "00:00:00.000 --> 00:00:02.000\nHello<00:00:00.800><c> world.</c>\n"
	request := subtitleRoutingTestRequest(test, content)
	hasWordTimestamps, err := service.DetectVttFormat(request.VttFile)
	if err != nil || !hasWordTimestamps {
		test.Fatalf("后段逐词时间戳未识别: %v", err)
	}
}

func TestProcessYouTubeSubtitleDoesNotCompleteWithoutTextOutputs(test *testing.T) {
	service := subtitleRoutingTestService(test)
	request := subtitleRoutingTestRequest(test, blockSubtitleRoutingFixture)
	if err := os.WriteFile(filepath.Join(request.TaskBasePath, "output"), []byte("阻止创建文本目录"), 0644); err != nil {
		test.Fatal(err)
	}
	if _, err := service.processYouTubeSubtitle(context.Background(), request); err == nil {
		test.Fatal("必需文本产物无法生成时不应成功")
	}
	if request.TaskPtr.ProcessPct == 100 {
		test.Fatal("必需产物缺失时不应报告完成")
	}
}

func TestValidateYouTubeSubtitleBlocksRejectsMissingContent(test *testing.T) {
	service := subtitleRoutingTestService(test)
	for _, blocks := range [][]*util.SrtBlock{
		nil,
		{nil},
		{{Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: " "}},
		{{Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: "Hello.", TargetLanguageSentence: " "}},
	} {
		if err := service.validateYouTubeSubtitleBlocks(blocks, true); err == nil {
			test.Fatal("字幕缺少原文或译文时不应成功")
		}
	}
}

func TestProcessYouTubeSubtitleProductionVttRegression(test *testing.T) {
	root := os.Getenv("KRILLIN_VTT_TASKS_DIR")
	if root == "" {
		test.Skip("设置KRILLIN_VTT_TASKS_DIR后运行真实失败字幕回归")
	}
	service := subtitleRoutingTestService(test)
	service.translator = nil
	fixtures := []struct {
		directory string
		videoID   string
		wanted    int
	}{
		{"watch_vwZYnJfL4_2fzY", "wZYnJfL4c2Y", 914},
		{"watch_vGABhTBPy_oySd", "GABhTBPyg_E", 785},
		{"watch_vGsP3OeE0_Jffq", "GsP3OeE0eMo", 726},
	}
	for _, fixture := range fixtures {
		test.Run(fixture.videoID, func(test *testing.T) {
			data, err := os.ReadFile(filepath.Join(root, fixture.directory, fixture.videoID+".en.vtt"))
			if err != nil {
				test.Fatal(err)
			}
			request := subtitleRoutingTestRequest(test, string(data))
			request.SourceOnly = true
			output, err := service.processYouTubeSubtitle(context.Background(), request)
			if err != nil {
				test.Fatal(err)
			}
			blocks, err := util.ParseSrtFile(output)
			if err != nil || len(blocks) != fixture.wanted {
				test.Fatalf("输出字幕=%d，预期=%d: %v", len(blocks), fixture.wanted, err)
			}
			test.Logf("修复后保留全部%d条字幕", len(blocks))
		})
	}
}
