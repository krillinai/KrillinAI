package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/service"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// 使用真实 HTTP 客户端、翻译器、时间映射、文件导出和恢复检查点。
func TestSubtitleRecoveryIntegration(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf = config.Config{}
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.MaxSentenceLength = 50
	config.Conf.Llm.Model = "recovery-test"
	for _, route := range []string{"srt", "vtt"} {
		for _, length := range []int{51, 56} {
			t.Run(fmt.Sprintf("%s/%d", route, length), func(t *testing.T) {
				target := "译" + strings.Repeat("a", length-2)
				var calls atomic.Int32
				var layouts atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					var request struct {
						Messages []struct{ Content string } `json:"messages"`
					}
					if err := json.NewDecoder(r.Body).Decode(&request); err != nil || len(request.Messages) != 2 {
						t.Errorf("无效模型请求: %v", err)
						http.Error(w, "invalid request", http.StatusBadRequest)
						return
					}
					prompt := request.Messages[1].Content
					content := []byte(`{"summary":"问候","terms":[]}`)
					if strings.HasPrefix(prompt, "任务：translation_revision\n") {
						content = []byte(`{"corrections":[]}`)
					} else if !strings.HasPrefix(prompt, "任务：translation_context\n") {
						_, payload, _ := strings.Cut(prompt, "输入 JSON：\n")
						var input struct {
							Sentences []struct {
								Text       string `json:"text"`
								TargetText string `json:"target_text"`
							} `json:"sentences"`
						}
						if err := json.NewDecoder(strings.NewReader(payload)).Decode(&input); err != nil || len(input.Sentences) != 1 || input.Sentences[0].Text != "Hello." {
							t.Errorf("父句输入错误: %+v err=%v", input, err)
							http.Error(w, "invalid subtitle input", http.StatusBadRequest)
							return
						}
						if input.Sentences[0].TargetText == "" {
							calls.Add(1)
						} else {
							layouts.Add(1)
							if input.Sentences[0].TargetText != target {
								t.Error("重排未锁定父句完整译文")
							}
						}
						content, _ = json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": "1", "target_text": target, "segments": []any{map[string]string{"source": "Hello.", "target": target}}}}})
					}
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(map[string]any{"id": "recovery", "choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": string(content)}}}})
				}))
				defer server.Close()
				config.Conf.App.MaxSentenceLength = 50
				config.Conf.Llm.BaseUrl = server.URL + "/v1"
				workdir := t.TempDir()
				path := filepath.Join(workdir, "input."+route)
				input := "1\n00:00:01,000 --> 00:00:03,000\nHello.\n\n"
				if route == "vtt" {
					input = "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello.\n\n"
				}
				if err := os.WriteFile(path, []byte(input), 0600); err != nil {
					t.Fatal(err)
				}
				run := func() {
					svc := service.NewService()
					if route == "srt" {
						response, err := GenerateSubtitles(context.Background(), NewServiceAdapter(svc), SubtitleRequest{TaskID: "recovery", Workdir: workdir, InputSRT: path, OriginLang: "en", TargetLang: "zh_cn", BilingualTop: true})
						if err != nil || !response.OK {
							t.Fatalf("response=%+v err=%v", response, err)
						}
					} else {
						if _, err := svc.ProcessYouTubeSubtitle(context.Background(), &service.YoutubeSubtitleReq{TaskId: "recovery", TaskBasePath: workdir, VttFile: path, OriginLanguage: "en", TargetLanguage: "zh_cn", TargetLanguageFirst: true}); err != nil {
							t.Fatal(err)
						}
					}
					blocks, err := readSRTBlocks(filepath.Join(workdir, types.SubtitleTaskTargetLanguageSrtFileName))
					if err != nil || len(blocks) != 1 || strings.Join(blocks[0].Lines, "\n") != target || blocks[0].Timestamp != "00:00:01,000 --> 00:00:03,000" {
						t.Fatalf("最终导出内容或时间丢失: %+v err=%v", blocks, err)
					}
				}
				run()
				if calls.Load() != 1 {
					t.Fatalf("完整父句不应重复翻译: %d", calls.Load())
				}
				config.Conf.App.MaxSentenceLength = 20
				run()
				if calls.Load() != 1 {
					t.Fatalf("修改排版设置后重译了已保存内容: %d", calls.Load())
				}
				if layouts.Load() == 0 {
					t.Fatal("修改显示目标后未验证冻结译文的排版恢复路径")
				}
			})
		}
	}
}

// 超长结果不能绕过最终检查；续跑复用完整译文，并以重新配对的原文映射时间。
func TestSubtitleFinalLengthRecoveryIntegration(t *testing.T) {
	log.InitLogger()
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf = config.Config{}
	config.Conf.App.TranslateParallelNum = 1
	config.Conf.App.MaxSentenceLength = 65
	config.Conf.Llm.Model = "final-length-test"
	source := "I read books because they help me understand the world, and I share what I learn with my friends."
	target := "我读书是因为书能帮助我理解世界，我也会把学到的东西分享给朋友。"
	for _, route := range []string{"srt", "vtt"} {
		t.Run(route, func(t *testing.T) {
			var ready atomic.Bool
			var translations, splits atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Messages []struct{ Content string } `json:"messages"`
				}
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil || len(request.Messages) != 2 {
					t.Errorf("无效模型请求: %v", err)
					http.Error(w, "invalid request", http.StatusBadRequest)
					return
				}
				prompt := request.Messages[1].Content
				content := []byte(`{"summary":"阅读的益处","terms":[]}`)
				switch {
				case strings.HasPrefix(prompt, "任务：translation_context\n"):
				case strings.HasPrefix(prompt, "任务：translation_revision\n"):
					content = []byte(`{"corrections":[]}`)
				case strings.HasPrefix(prompt, "任务：translation_layout_review\n"):
					content = []byte(`{"reviews":[{"sentence_id":"1","aligned":true,"natural_boundaries":true,"reason":"固定样例配对与切口对应"}],"corrections":[]}`)
				case strings.HasPrefix(prompt, "任务：translation_length_boundary_review\n"):
					content = []byte(`{"acceptable":true,"reason":"阅读的原因与向朋友分享两段均保持完整。"}`)
				default:
					_, payload, _ := strings.Cut(prompt, "输入 JSON：\n")
					var input struct {
						Sentences []struct {
							Text       string `json:"text"`
							TargetText string `json:"target_text"`
						} `json:"sentences"`
					}
					if err := json.NewDecoder(strings.NewReader(payload)).Decode(&input); err != nil || len(input.Sentences) != 1 || input.Sentences[0].Text != source {
						t.Errorf("父句被改变: %+v err=%v", input, err)
						http.Error(w, "invalid subtitle input", http.StatusBadRequest)
						return
					}
					segments := []any{map[string]string{"source": source, "target": target}}
					if strings.HasPrefix(prompt, "任务：translation_length_split\n") {
						splits.Add(1)
						if ready.Load() {
							if input.Sentences[0].TargetText != target {
								t.Error("续跑未冻结已有完整译文")
							}
							segments = []any{
								map[string]string{"source": "I read books because they help me understand the world,", "target": "我读书是因为书能帮助我理解世界，"},
								map[string]string{"source": "and I share what I learn with my friends.", "target": "我也会把学到的东西分享给朋友。"},
							}
						}
					} else if input.Sentences[0].TargetText == "" {
						translations.Add(1)
					}
					content, _ = json.Marshal(map[string]any{"sentences": []any{map[string]any{"sentence_id": "1", "target_text": target, "segments": segments}}})
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"finish_reason": "stop", "message": map[string]string{"role": "assistant", "content": string(content)}}}})
			}))
			defer server.Close()
			config.Conf.Llm.BaseUrl = server.URL + "/v1"
			workdir := t.TempDir()
			path := filepath.Join(workdir, "input."+route)
			input := "1\n00:00:01,000 --> 00:00:09,000\n" + source + "\n\n"
			if route == "vtt" {
				input = "WEBVTT\n\n00:00:01.000 --> 00:00:09.000\n" + source + "\n\n"
			}
			if err := os.WriteFile(path, []byte(input), 0600); err != nil {
				t.Fatal(err)
			}
			run := func() error {
				svc := service.NewService()
				if route == "vtt" {
					_, err := svc.ProcessYouTubeSubtitle(context.Background(), &service.YoutubeSubtitleReq{TaskId: "length", TaskBasePath: workdir, VttFile: path, OriginLanguage: "en", TargetLanguage: "zh_cn", TargetLanguageFirst: true})
					return err
				}
				_, err := GenerateSubtitles(context.Background(), NewServiceAdapter(svc), SubtitleRequest{TaskID: "length", Workdir: workdir, InputSRT: path, OriginLang: "en", TargetLang: "zh_cn", BilingualTop: true})
				return err
			}
			if err := run(); err == nil || !strings.Contains(err.Error(), "75") {
				t.Fatalf("三次后仍超长应明确失败: %v", err)
			}
			if _, err := os.Stat(filepath.Join(workdir, types.SubtitleTaskTargetLanguageSrtFileName)); !os.IsNotExist(err) {
				t.Fatal("超长回退结果不应导出")
			}
			ready.Store(true)
			if err := run(); err != nil {
				t.Fatal(err)
			}
			if translations.Load() != 1 || splits.Load() != 4 {
				t.Fatalf("续跑重复翻译或绕过检测: translations=%d splits=%d", translations.Load(), splits.Load())
			}
			origin, err := readSRTBlocks(filepath.Join(workdir, types.SubtitleTaskOriginLanguageSrtFileName))
			if err != nil {
				t.Fatal(err)
			}
			translated, err := readSRTBlocks(filepath.Join(workdir, types.SubtitleTaskTargetLanguageSrtFileName))
			if err != nil || len(origin) != 2 || len(translated) != 2 {
				t.Fatalf("字幕未重新分成两条: origin=%+v target=%+v err=%v", origin, translated, err)
			}
			for i := range origin {
				if origin[i].Timestamp != translated[i].Timestamp || len(origin[i].Lines) != 1 || len(translated[i].Lines) != 1 || len(origin[i].Lines[0]) > 75 {
					t.Fatalf("分段后原译时间或单行不一致: %+v %+v", origin[i], translated[i])
				}
			}
			if strings.Join(origin[0].Lines, "")+" "+strings.Join(origin[1].Lines, "") != source || strings.Join(translated[0].Lines, "")+strings.Join(translated[1].Lines, "") != target || !strings.HasPrefix(origin[0].Timestamp, "00:00:01,000") || !strings.HasSuffix(origin[1].Timestamp, "00:00:09,000") {
				t.Fatal("新增切口丢失原译或改变父句起止时间")
			}
		})
	}
}
