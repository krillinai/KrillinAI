package voices

import (
	"fmt"
	"sort"
	"strings"

	"krillin-ai/internal/pipeline"
)

const (
	ProviderAliyun = "aliyun"
	ProviderOpenAI = "openai"
	ProviderEdge   = "edge-tts"
	Minimax        = "minimax"
)

func List(provider string) ([]pipeline.Voice, error) {
	provider = strings.TrimSpace(strings.ToLower(provider))
	switch provider {
	case ProviderAliyun:
		return cloneVoices(aliyunVoices), nil
	case ProviderOpenAI:
		return cloneVoices(openaiVoices), nil
	case Minimax:
		return cloneVoices(minimaxVoices), nil
	case ProviderEdge:
		return nil, fmt.Errorf("edge-tts voice listing is not supported yet; use edge-tts --list-voices")
	default:
		return nil, fmt.Errorf("unsupported tts provider: %s", provider)
	}
}

func Providers() []string {
	return []string{ProviderAliyun, ProviderOpenAI, Minimax, ProviderEdge}
}

func cloneVoices(in []pipeline.Voice) []pipeline.Voice {
	out := append([]pipeline.Voice(nil), in...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Provider != out[j].Provider {
			return out[i].Provider < out[j].Provider
		}
		return out[i].Code < out[j].Code
	})
	return out
}

var aliyunVoices = []pipeline.Voice{
	{Provider: ProviderAliyun, Code: "longxiaochun_v2", Name: "龙小淳", Language: "zh-CN", Gender: "female", Scenario: "通用女声"},
	{Provider: ProviderAliyun, Code: "longxiaoxia_v2", Name: "龙小夏", Language: "zh-CN", Gender: "female", Scenario: "自然女声"},
	{Provider: ProviderAliyun, Code: "longxiaocheng_v2", Name: "龙小诚", Language: "zh-CN", Gender: "male", Scenario: "通用男声"},
	{Provider: ProviderAliyun, Code: "longxiaobai_v2", Name: "龙小白", Language: "zh-CN", Gender: "female", Scenario: "甜美女声"},
	{Provider: ProviderAliyun, Code: "longlaotie_v2", Name: "龙老铁", Language: "zh-CN", Gender: "male", Scenario: "东北口音"},
	{Provider: ProviderAliyun, Code: "longshu_v2", Name: "龙叔", Language: "zh-CN", Gender: "male", Scenario: "沉稳男声"},
	{Provider: ProviderAliyun, Code: "longshuo_v2", Name: "龙硕", Language: "zh-CN", Gender: "male", Scenario: "朗读男声"},
	{Provider: ProviderAliyun, Code: "longjing_v2", Name: "龙婧", Language: "zh-CN", Gender: "female", Scenario: "新闻女声"},
	{Provider: ProviderAliyun, Code: "longmiao_v2", Name: "龙妙", Language: "zh-CN", Gender: "female", Scenario: "客服女声"},
	{Provider: ProviderAliyun, Code: "longyue_v2", Name: "龙悦", Language: "zh-CN", Gender: "female", Scenario: "温柔女声"},
}

var openaiVoices = []pipeline.Voice{
	{Provider: ProviderOpenAI, Code: "alloy", Language: "multi", Scenario: "balanced"},
	{Provider: ProviderOpenAI, Code: "ash", Language: "multi", Scenario: "calm"},
	{Provider: ProviderOpenAI, Code: "ballad", Language: "multi", Scenario: "expressive"},
	{Provider: ProviderOpenAI, Code: "coral", Language: "multi", Scenario: "warm"},
	{Provider: ProviderOpenAI, Code: "echo", Language: "multi", Scenario: "clear"},
	{Provider: ProviderOpenAI, Code: "fable", Language: "multi", Scenario: "narration"},
	{Provider: ProviderOpenAI, Code: "nova", Language: "multi", Scenario: "bright"},
	{Provider: ProviderOpenAI, Code: "onyx", Language: "multi", Scenario: "deep"},
	{Provider: ProviderOpenAI, Code: "sage", Language: "multi", Scenario: "neutral"},
	{Provider: ProviderOpenAI, Code: "shimmer", Language: "multi", Scenario: "soft"},
}

var minimaxVoices = []pipeline.Voice{
	{Provider: Minimax, Code: "English_Graceful_Lady", Name: "Graceful Lady", Language: "en", Gender: "female", Scenario: "优雅女声"},
	{Provider: Minimax, Code: "English_radiant_girl", Name: "Radiant Girl", Language: "en", Gender: "female", Scenario: "活泼女声"},
	{Provider: Minimax, Code: "English_Insightful_Speaker", Name: "Insightful Speaker", Language: "en", Gender: "male", Scenario: "沉稳男声"},
	{Provider: Minimax, Code: "English_Persuasive_Man", Name: "Persuasive Man", Language: "en", Gender: "male", Scenario: "有说服力男声"},
	{Provider: Minimax, Code: "English_expressive_narrator", Name: "Expressive Narrator", Language: "en", Gender: "male", Scenario: "旁白"},
	{Provider: Minimax, Code: "English_Lucky_Robot", Name: "Lucky Robot", Language: "en", Gender: "neutral", Scenario: "机器人"},
}
