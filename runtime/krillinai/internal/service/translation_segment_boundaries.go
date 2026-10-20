package service

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"os/exec"
	"strings"
	"time"
)

type translationNLPBoundaryRequest struct {
	Source string   `json:"source"`
	Parts  []string `json:"parts"`
}
type translationNLPBoundaryChecker func(context.Context, []translationNLPBoundaryRequest, types.StandardLanguageCode) ([]string, error)

// 使用实际源语言模型验证依存边，不靠英文词尾列表推测其他语言。
// 无模型时沿用已经明确记录的NLP降级；不得因此宣称句法校验通过。
func runTranslationNLPBoundaryCheck(ctx context.Context, requests []translationNLPBoundaryRequest, language types.StandardLanguageCode) ([]string, error) {
	data, _ := json.Marshal(struct {
		Language types.StandardLanguageCode      `json:"language"`
		Requests []translationNLPBoundaryRequest `json:"boundary_requests"`
	}{language, requests})
	work, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	command := exec.CommandContext(work, translationNLPPython(), "-I", "-c", translationNLPWorker)
	command.Stdin = bytes.NewReader(data)
	output, err := command.Output()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return make([]string, len(requests)), nil
		}
		return nil, fmt.Errorf("源文切口句法校验执行失败: %w", err)
	}
	var result struct {
		Unavailable string   `json:"unavailable"`
		Issues      []string `json:"issues"`
	}
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, err
	}
	if result.Unavailable != "" {
		return make([]string, len(requests)), nil
	}
	if len(result.Issues) != len(requests) {
		return nil, fmt.Errorf("源文切口句法响应缺失")
	}
	return result.Issues, nil
}

//go:embed translation_source_cut.py
var translationSourceCutWorker string

func chooseParsedSegmentCutOptions(ctx context.Context, input pairedTranslationInput, work []segmentOverflow, language types.StandardLanguageCode, runtimes ...*translationNLPRuntime) (map[string][][]string, error) {
	requests := []map[string]any{}
	for _, w := range work {
		requests = append(requests, map[string]any{"source": w.Source, "minimum_pieces": w.MinPieces})
	}
	data, _ := json.Marshal(map[string]any{"language": language, "soft": min(input.MaxTargetChars, 75), "requests": requests})
	worker := strings.Split(translationNLPWorker, "\nif __name__ == \"__main__\":")[0] + "\n" + translationSourceCutWorker
	run, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	var output []byte
	var err error
	if len(runtimes) > 0 && runtimes[0] != nil {
		output, err = runtimes[0].exchange(run, data)
	} else {
		command := exec.CommandContext(run, translationNLPPython(), "-I", "-c", worker)
		command.Stdin = bytes.NewReader(data)
		output, err = command.Output()
	}
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	if err != nil {
		return nil, nil
	} // 初始NLP已记录不可用；保持语义分句回退。
	var result struct {
		Unavailable string       `json:"unavailable"`
		Options     [][][]string `json:"options"`
	}
	if json.Unmarshal(output, &result) != nil || result.Unavailable != "" || len(result.Options) != len(work) {
		return nil, nil
	}
	return filterParsedSegmentCutOptions(work, result.Options, language), nil
}

func filterParsedSegmentCutOptions(work []segmentOverflow, options [][][]string, language types.StandardLanguageCode) map[string][][]string {
	if len(options) != len(work) {
		return nil
	}
	cuts := map[string][][]string{}
	for i, w := range work {
		if len(options[i]) == 0 || len(options[i]) > 3 {
			continue
		}
		// 候选可能含标点独立成段等无效方案；逐项过滤，不能连带丢弃合法方案。
		for _, parts := range options[i] {
			if len(parts) < max(2, w.MinPieces) || !validTranslationSentencePartsWithLimit(w.Source, parts, language, len(parts)) {
				continue
			}
			valid := true
			for _, part := range parts {
				if subtitleTargetLength(part) > 75 {
					valid = false
					break
				}
			}
			if valid {
				cuts[w.ID] = append(cuts[w.ID], parts)
			}
		}
	}
	if len(cuts) == 0 {
		return nil
	}
	return cuts
}
