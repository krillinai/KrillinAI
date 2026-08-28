package voices

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"krillin-ai/internal/pipeline"
	"krillin-ai/internal/ttsprovider"
)

const (
	ProviderAliyun = "aliyun"
	ProviderOpenAI = "openai"
	Minimax        = "minimax"
)

func List(ctx context.Context, provider string) ([]pipeline.Voice, error) {
	provider = strings.TrimSpace(strings.ToLower(provider))
	client, err := ttsprovider.New(provider)
	if err != nil {
		return nil, err
	}
	values, err := client.ListVoices(ctx)
	if err != nil {
		return nil, fmt.Errorf("list %s voices: %w", provider, err)
	}
	result := make([]pipeline.Voice, 0, len(values))
	for _, voice := range values {
		result = append(result, pipeline.Voice{
			Code:            voice.Code,
			Name:            voice.Name,
			Language:        voice.Language,
			Gender:          voice.Gender,
			Provider:        voice.Provider,
			Scenario:        voice.Scenario,
			Kind:            voice.Kind,
			SupportedModels: append([]string(nil), voice.SupportedModels...),
			Recommended:     voice.Recommended,
		})
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].Kind != result[j].Kind {
			return result[i].Kind < result[j].Kind
		}
		if result[i].Recommended != result[j].Recommended {
			return result[i].Recommended
		}
		return result[i].Code < result[j].Code
	})
	return result, nil
}

func Providers() []string {
	return []string{ProviderAliyun, ProviderOpenAI, Minimax}
}
