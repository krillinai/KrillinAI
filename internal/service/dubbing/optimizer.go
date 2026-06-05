package dubbing

import (
	"context"
	"fmt"
	"krillin-ai/internal/types"
	"strings"
)

type LLMOptimizer struct {
	chat types.ChatCompleter
}

func NewLLMOptimizer(chat types.ChatCompleter) *LLMOptimizer {
	return &LLMOptimizer{chat: chat}
}

func (o *LLMOptimizer) Optimize(ctx context.Context, text string, availableSeconds float64, reason string) (string, error) {
	if ctx != nil {
		if err := ctx.Err(); err != nil {
			return "", err
		}
	}
	if o == nil || o.chat == nil {
		return text, nil
	}
	prompt := fmt.Sprintf(`请把下面字幕改写成更自然、更短、 更适合口播的一句话。
要求：
1. 保留核心含义，不添加新事实。
2. 输出目标语言文本，不要解释。
3. 输出单行纯文本。
4. 尽量适合 %.1f 秒内自然朗读。
触发原因：%s

字幕：
%s`, availableSeconds, reason, text)
	resp, err := o.chat.ChatCompletion(prompt)
	if err != nil {
		return "", err
	}
	resp = strings.TrimSpace(resp)
	resp = strings.ReplaceAll(resp, "\r", " ")
	resp = strings.ReplaceAll(resp, "\n", " ")
	resp = strings.Join(strings.Fields(resp), " ")
	if resp == "" {
		return text, nil
	}
	return resp, nil
}
