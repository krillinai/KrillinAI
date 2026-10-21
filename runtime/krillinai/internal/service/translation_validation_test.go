package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// 模型返回使用固定样本，验证全部语言的路由、候选接收、持久化和恢复，
// 不把模拟响应测试当成模型实际翻译质量的证明。
func TestCatalogTranslationCandidatesPersistAndResume(t *testing.T) {
	texts := []string{"35.", "Muse.", "Pystock?", "東京", "محمد", "नमस्ते"}
	targets := []string{"35", "Muse", "Pystock", "東京", "محمد", "नमस्ते"}
	languages := 0
	for _, language := range types.LanguageCatalog {
		if !language.Speech {
			continue
		}
		languages++
		code := types.StandardLanguageCode(language.Code)
		for _, direction := range []struct{ source, target types.StandardLanguageCode }{{code, "zh_cn"}, {"zh_cn", code}} {
			t.Run(string(direction.source)+"_to_"+string(direction.target), func(t *testing.T) {
				calls := 0
				translator := &Translator{checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts}}
				translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
					calls++
					if !strings.HasPrefix(prompt, "任务：translation_content\n") {
						return "", fmt.Errorf("候选错误触发额外生成：%s", prompt[:min(len(prompt), 80)])
					}
					input, err := decodePairedTestInput(prompt)
					if err != nil || input.SourceLanguage != types.GetStandardLanguageName(direction.source) || input.TargetLanguage != types.GetStandardLanguageName(direction.target) {
						return "", fmt.Errorf("语言路由错误：%+v %v", input, err)
					}
					output := pairedTranslationOutput{}
					for i, target := range targets {
						output.Sentences = append(output.Sentences, pairedTranslationOutputSentence{ID: fmt.Sprint(i + 1), FullTarget: target})
					}
					data, err := json.Marshal(output)
					return string(data), err
				})
				for repeat := 0; repeat < 2; repeat++ {
					result, err := translator.translatePairedSentences(context.Background(), texts, direction.source, direction.target, 100, 10, nil)
					if err != nil || len(result) != len(targets) || calls != 1 {
						t.Fatalf("候选丢失或重复翻译：calls=%d result=%+v err=%v", calls, result, err)
					}
					for i, sentence := range result {
						if sentence.FullSource != texts[i] || sentence.FullTarget != targets[i] || sentence.DraftTarget != targets[i] {
							t.Fatalf("候选或初译记录被修改：%+v", sentence)
						}
					}
				}
				files, _ := filepath.Glob(filepath.Join(translator.checkpointDir, "translation-checkpoints", "*", "*.json"))
				if len(files) != len(texts) {
					t.Fatalf("检查点未逐句保存：%v", files)
				}
			})
		}
	}
	if languages != 123 {
		t.Fatalf("源语言及目标语言覆盖不完整：%d", languages)
	}
}

func TestSavedCandidatesReachReviewAndKeepDraftOnRejection(t *testing.T) {
	texts := []string{"35.", "Muse.", "نلتقي اليوم."}
	targets := []string{"35", "Muse", texts[2]}
	dir := t.TempDir()
	contentCalls, revisionCalls, verificationCalls := 0, 0, 0
	translator := &Translator{checkpointDir: dir, reviseTranslation: true, preparedTranslation: &preparedTranslationContext{Texts: texts}}
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		switch {
		case strings.HasPrefix(prompt, "任务：translation_content\n"):
			contentCalls++
			data, err := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{
				{ID: "1", FullTarget: targets[0]}, {ID: "2", FullTarget: targets[1]}, {ID: "3", FullTarget: targets[2]},
			}})
			return string(data), err
		case strings.HasPrefix(prompt, "任务：translation_revision\n"):
			revisionCalls++
			files, _ := filepath.Glob(filepath.Join(dir, "translation-checkpoints", "*", "*.json"))
			if len(files) != 3 {
				t.Fatal("审校前没有先保存全部初译")
			}
			if revisionCalls == 1 {
				if !strings.Contains(prompt, "quality_hints") || !strings.Contains(prompt, "unchanged_text_check_meaning") {
					t.Fatal("原样返回的语义疑点没有交给审校")
				}
				return `{"corrections":[{"sentence_id":"1","reason":"测试数字误改被核验拒绝","target_text":"53"},{"sentence_id":"2","reason":"专名允许原样保留","target_text":"Muse."},{"sentence_id":"3","reason":"普通句应译为中文","target_text":"我们今天见面。"}]}`, nil
			}
			if strings.Contains(prompt, texts[2]) {
				t.Fatal("已通过审校的句子被再次修订")
			}
			return "", errors.New("修订接口暂时不可用")
		case strings.HasPrefix(prompt, "任务：translation_revision_verify\n"):
			verificationCalls++
			return `{"accepted_ids":["2","3"],"reason":"35变成53不忠实原文；专名和阿拉伯语句子译文可接受。"}`, nil
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		return "", errors.New("未预期请求")
	})
	result, err := translator.translatePairedSentences(context.Background(), texts, "ar", "zh_cn", 100, 10, nil)
	if err != nil || len(result) != 3 || contentCalls != 1 || revisionCalls != 2 || verificationCalls != 1 {
		t.Fatalf("审校未正常回退：result=%+v content=%d revision=%d verify=%d err=%v", result, contentCalls, revisionCalls, verificationCalls, err)
	}
	for i, target := range []string{"35", "Muse.", "我们今天见面。"} {
		if result[i].FullTarget != target || result[i].DraftTarget != targets[i] {
			t.Fatalf("未保留初译或错误覆盖候选：%+v", result[i])
		}
	}
}

func TestPlainTranslationAcceptsNamesAndDigitsOnLastAttempt(t *testing.T) {
	for _, tc := range []struct{ source, target string }{{"35.", "35"}, {"Pystock?", "Pystock"}, {"محمد", "محمد"}} {
		t.Run(tc.source, func(t *testing.T) {
			calls := 0
			translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
				calls++
				if calls < 3 {
					return `{"sentences":[]}`, nil
				}
				data, err := json.Marshal(pairedTranslationOutputSentence{ID: "1", FullTarget: tc.target})
				return string(data), err
			})}
			input := pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: tc.source}}}
			var saved pairedSentence
			remaining, err := translator.translateContentBatch(context.Background(), input, "ar", "ja", func(sentence pairedSentence, _ bool) error { saved = sentence; return nil })
			if err != nil || len(remaining.Sentences) != 0 || calls != 3 || saved.FullTarget != tc.target || saved.DraftTarget != tc.target {
				t.Fatalf("最后一次有效候选被丢弃：calls=%d saved=%+v remaining=%+v err=%v", calls, saved, remaining, err)
			}
		})
	}
}

func TestLargeTranslationCandidateIsSavedBeforeReviewAndLayoutFallback(t *testing.T) {
	const source = "Hi."
	target := strings.Repeat("完整初译", 1600)
	dir := t.TempDir()
	contentCalls := 0
	translator := &Translator{checkpointDir: dir, reviseTranslation: true, preparedTranslation: &preparedTranslationContext{Texts: []string{source}}}
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			contentCalls++
			data, err := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{{ID: "1", FullTarget: target}}})
			return string(data), err
		}
		return "", errors.New("审校或排版不可用")
	})
	result, err := translator.translatePairedSentences(context.Background(), []string{source}, "de", "zh_cn", 100, 10, nil)
	if err != nil || len(result) != 1 || contentCalls != 1 || result[0].FullTarget != target || result[0].DraftTarget != target || !result[0].LayoutFallback {
		t.Fatalf("超长候选未保存或回退失败：calls=%d count=%d err=%v", contentCalls, len(result), err)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "translation-checkpoints", "*", "*.json"))
	if len(files) != 1 {
		t.Fatalf("超长初译检查点丢失：%v", files)
	}
}

func TestMissingTranslationKeepsSourceAndRetriesOnlyFailedSentence(t *testing.T) {
	for _, invalid := range []string{"", "。！？", "译文\n第二行"} {
		t.Run(fmt.Sprintf("%q", invalid), func(t *testing.T) {
			texts := []string{"35.", "Muse."}
			calls := 0
			translator := &Translator{checkpointDir: t.TempDir(), preparedTranslation: &preparedTranslationContext{Texts: texts}}
			translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				calls++
				if calls == 1 {
					data, err := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{{ID: "1", FullTarget: "35"}, {ID: "2", FullTarget: invalid}}})
					return string(data), err
				}
				data, err := json.Marshal(pairedTranslationOutputSentence{ID: "2", FullTarget: invalid})
				if calls == 2 {
					data, err = json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{{ID: "2", FullTarget: invalid}}})
				}
				return string(data), err
			})
			result, err := translator.translatePairedSentences(context.Background(), texts, "de", "ja", 100, 10, nil)
			if err != nil || len(result) != 2 || result[1].FullTarget != texts[1] || result[1].TranslationFallbackReason == "" || calls != 3 {
				t.Fatalf("失败句未按原文回退或无限重试：calls=%d result=%+v err=%v", calls, result, err)
			}
			files, _ := filepath.Glob(filepath.Join(translator.checkpointDir, "translation-checkpoints", "*", "*.json"))
			if len(files) != 2 {
				t.Fatalf("未分别保存译文和回退检查点：%v", files)
			}
			data, _ := os.ReadFile(files[0])
			var saved pairedSentence
			if json.Unmarshal(data, &saved) != nil || saved.ID != "1" || saved.FullTarget != "35" {
				t.Fatalf("已有初译丢失：%s", data)
			}
			translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
				input, err := decodePairedTestInput(prompt)
				if err != nil || len(input.Sentences) != 1 || input.Sentences[0].ID != "2" {
					t.Fatal("恢复时重做已保存句子")
				}
				return `{"sentences":[{"sentence_id":"2","target_text":"Muse"}]}`, nil
			})
			result, err = translator.translatePairedSentences(context.Background(), texts, "de", "ja", 100, 10, nil)
			if err != nil || len(result) != 2 || result[1].TranslationFallbackReason != "" || !slices.Equal([]string{result[0].FullTarget, result[1].FullTarget}, []string{"35", "Muse"}) {
				t.Fatalf("未从检查点恢复：result=%+v err=%v", result, err)
			}
		})
	}
}
