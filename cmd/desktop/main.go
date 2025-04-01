package main

import (
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/desktop"
	"krillin-ai/internal/server"
	"krillin-ai/log"
	"os"
)

func main() {
	log.InitLogger()
	defer log.GetLogger().Sync()

	config.LoadConfig()
	if config.Conf.App.TranscribeProvider == "" || config.Conf.App.LlmProvider == "" {
		// 确保有最基础的配置
		config.Conf.App.TranscribeProvider = "openai"
		config.Conf.App.LlmProvider = "openai"
		err := config.SaveConfig()
		if err != nil {
			log.GetLogger().Error("保存配置失败", zap.Error(err))
			os.Exit(1)
		}
	}
	config.LoadConfig()
	go func() {
		if err := server.StartBackend(); err != nil {
			log.GetLogger().Error("后端服务启动失败", zap.Error(err))
			os.Exit(1)
		}
	}()
	desktop.Show()
}
