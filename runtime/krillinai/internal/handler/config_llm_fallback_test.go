package handler

import (
	"bytes"
	"encoding/json"
	"krillin-ai/config"
	"krillin-ai/log"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/BurntSushi/toml"
	"github.com/gin-gonic/gin"
)

func TestConfigFallbackDoesNotExposeSecretAndSurvivesUpdates(t *testing.T) {
	for _, action := range []string{"legacy_client", "round_trip", "change_key", "disable"} {
		t.Run(action, func(t *testing.T) {
			log.InitLogger()
			previous, previousBackup, previousUpdated := config.Conf, config.ConfigBackup, configUpdated
			t.Cleanup(func() { config.Conf, config.ConfigBackup, configUpdated = previous, previousBackup, previousUpdated })
			t.Chdir(t.TempDir())
			config.Conf.App.Proxy = ""
			config.Conf.Transcribe.Provider = "openai"
			config.Conf.Transcribe.Openai.ApiKey = "asr-test-key"
			config.Conf.LlmFallback = config.OpenaiCompatibleConfig{BaseUrl: "https://api.deepseek.com", ApiKey: "fallback-test-key", Model: "deepseek-flash"}
			h := Handler{}
			router := gin.New()
			router.GET("/config", h.GetConfig)
			router.POST("/config", h.UpdateConfig)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/config", nil))
			var initial struct {
				Data ConfigRequest `json:"data"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &initial); err != nil {
				t.Fatal(err)
			}
			if strings.Contains(response.Body.String(), "fallback-test-key") || initial.Data.LlmFallback == nil || !initial.Data.LlmFallback.Configured || initial.Data.LlmFallback.Model != "deepseek-flash" {
				t.Fatal("备用源密钥被回显或状态不完整")
			}
			switch action {
			case "legacy_client":
				initial.Data.LlmFallback = nil
			case "change_key":
				initial.Data.LlmFallback.ApiKey = "replacement-test-key"
			case "disable":
				initial.Data.LlmFallback = &LLMFallbackConfigRequest{}
			}
			body, err := json.Marshal(initial.Data)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, "/config", bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			response = httptest.NewRecorder()
			router.ServeHTTP(response, request)
			var result struct {
				Error int `json:"error"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.Error != 0 {
				t.Fatal("更新配置失败")
			}
			want := "fallback-test-key"
			if action == "change_key" {
				want = "replacement-test-key"
			}
			if action == "disable" {
				want = ""
			}
			if config.Conf.LlmFallback.ApiKey != want {
				t.Fatal("配置更新丢失或误改了备用源密钥")
			}
			data, err := os.ReadFile(filepath.Join("config", "config.toml"))
			if err != nil {
				t.Fatal(err)
			}
			var restored config.Config
			if _, err := toml.Decode(string(data), &restored); err != nil || restored.LlmFallback != config.Conf.LlmFallback {
				t.Fatal("备用源未正确保存")
			}
		})
	}
}
