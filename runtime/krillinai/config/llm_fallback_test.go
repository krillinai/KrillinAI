package config

import (
	"testing"

	"github.com/BurntSushi/toml"
)

func TestLLMFallbackConfigRoundTripAndValidation(t *testing.T) {
	previous := Conf
	t.Cleanup(func() { Conf = previous })
	for _, tc := range []struct {
		name    string
		value   OpenaiCompatibleConfig
		invalid bool
	}{
		{"disabled", OpenaiCompatibleConfig{}, false},
		{"configured", OpenaiCompatibleConfig{BaseUrl: "https://api.deepseek.com", ApiKey: "test-key", Model: "deepseek-flash"}, false},
		{"missing_key", OpenaiCompatibleConfig{BaseUrl: "https://api.deepseek.com", Model: "deepseek-flash"}, true},
		{"missing_model", OpenaiCompatibleConfig{BaseUrl: "https://api.deepseek.com", ApiKey: "test-key"}, true},
		{"invalid_url", OpenaiCompatibleConfig{BaseUrl: "api.deepseek.com", ApiKey: "test-key", Model: "deepseek-flash"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			Conf.LlmFallback = tc.value
			data, err := toml.Marshal(Conf)
			if err != nil {
				t.Fatal(err)
			}
			var restored Config
			if _, err := toml.Decode(string(data), &restored); err != nil || restored.LlmFallback != tc.value {
				t.Fatalf("配置未正确持久化: %v", err)
			}
			if err := CheckBaseConfig(); (err != nil) != tc.invalid {
				t.Fatalf("配置校验结果错误: %v", err)
			}
		})
	}
}
