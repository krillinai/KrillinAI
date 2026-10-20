package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"go.uber.org/zap"
)

//go:embed subtitle_nlp.py
var translationNLPWorker string

//go:embed subtitle_nlp_split_prompt.txt
var translationNLPSplitPrompt string

const translationNLPTokenTarget = 20

type translationNLPResult struct {
	Model        string     `json:"model"`
	ModelVersion string     `json:"model_version"`
	Unavailable  string     `json:"unavailable,omitempty"`
	Segments     [][]string `json:"segments"`
	Tokens       [][]int    `json:"tokens"`
}

type translationNLPSegmenter func(context.Context, []string, types.StandardLanguageCode) (translationNLPResult, error)

func translationNLPPython() string {
	if python := os.Getenv("KRILLINAI_NLP_PYTHON"); python != "" {
		return python
	}
	if runtime.GOOS == "windows" {
		return "python"
	}
	return "python3"
}

func runTranslationNLP(ctx context.Context, texts []string, language types.StandardLanguageCode) (translationNLPResult, error) {
	var result translationNLPResult
	input, err := json.Marshal(struct {
		Language types.StandardLanguageCode `json:"language"`
		Texts    []string                   `json:"texts"`
	}{types.NormalizeLanguage(string(language)), texts})
	if err != nil {
		return result, err
	}
	workerContext, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	// No shell, text interpolation, model download, or dependency on VideoLingo paths.
	cmd := exec.CommandContext(workerContext, translationNLPPython(), "-I", "-c", translationNLPWorker)
	cmd.Stdin = bytes.NewReader(input)
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return result, ctx.Err()
	}
	if err != nil {
		return result, fmt.Errorf("NLP worker unavailable: %w", err)
	}
	if err := json.Unmarshal(output, &result); err != nil {
		return result, err
	}
	return result, nil
}

func validTranslationNLPResult(texts []string, result translationNLPResult, language types.StandardLanguageCode) bool {
	if result.Unavailable != "" || result.Model == "" || len(result.Segments) != len(texts) || len(result.Tokens) != len(texts) {
		return false
	}
	for i, text := range texts {
		parts := result.Segments[i]
		if len(parts) == 0 || len(parts) != len(result.Tokens[i]) || !subtitleSegmentsPreserveText(text, parts) || !subtitleSegmentsHaveSafeBoundaries(parts) {
			return false
		}
		// The shared validator also protects words, dates, names, URLs and number/unit spans.
		if len(parts) > 1 && !validTranslationSentencePartsWithLimit(text, parts, language, len(parts)) {
			return false
		}
		for j, part := range parts {
			if !hasSubtitleContent(part) || result.Tokens[i][j] < 1 {
				return false
			}
		}
	}
	return true
}

// 每个父句对应一组边界建议；不改变翻译单位、句子 ID 或上下文范围。
// 不可用时返回 nil，调用方仍按完整父句翻译并使用通用排版参考。
func (t *Translator) prepareTranslationNLPHints(ctx context.Context, texts []string, language types.StandardLanguageCode) ([][]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if len(texts) == 0 {
		return nil, nil
	}
	segmenter := t.nlpSegmenter
	if segmenter == nil {
		segmenter = runTranslationNLP
		if t.nlpRuntime != nil {
			segmenter = t.nlpRuntime.segment
		}
	}
	cachePath := ""
	if t.checkpointDir != "" {
		identity, _ := json.Marshal([]any{translationNLPWorker, translationNLPPython(), language, texts})
		hash := sha256.Sum256(identity)
		cachePath = filepath.Join(t.checkpointDir, "translation-nlp", hex.EncodeToString(hash[:])+".json")
	}
	var result translationNLPResult
	if cachePath != "" {
		data, _ := os.ReadFile(cachePath)
		_ = json.Unmarshal(data, &result)
	}
	if !validTranslationNLPResult(texts, result, language) {
		var err error
		result, err = segmenter(ctx, texts, language)
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if err != nil || !validTranslationNLPResult(texts, result, language) {
			// 可选预处理降级不是翻译恢复事件，不能触发恢复/取消回调。
			reason := result.Unavailable
			if reason == "" {
				reason = "worker_or_validation_failed"
			}
			log.GetLogger().Warn("当前源语言的句法分句暂不可用，已使用通用分句继续翻译", zap.String("language", string(language)), zap.String("reason", reason))
			return nil, nil
		}
		if cachePath != "" {
			if err := saveTranslationPresegmentationJSON(cachePath, result); err != nil {
				return nil, fmt.Errorf("保存NLP分句检查点失败: %w", err)
			}
		}
	}
	prepared := make([][]string, len(texts))
	for i, parts := range result.Segments {
		for j, part := range parts {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			units := []string{strings.TrimSpace(part)}
			if count := result.Tokens[i][j]; count > translationNLPTokenTarget {
				// Token count is a source-model hint, independent of subtitle display width.
				prompt := fmt.Sprintf(translationNLPSplitPrompt, translationNLPTokenTarget, count)
				var err error
				units, err = t.refineTranslationSentenceWithPrompt(ctx, part, units, language, prompt, 2*((count+translationNLPTokenTarget-1)/translationNLPTokenTarget)+1)
				if err != nil {
					return nil, err
				}
			}
			prepared[i] = append(prepared[i], units...)
		}
	}
	return prepared, nil
}
