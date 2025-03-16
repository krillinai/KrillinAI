package main

import (
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/internal/server"
	"krillin-ai/log"
	"os"
)

func main() {
	log.InitLogger()
	defer log.GetLogger().Sync()

	var err error
	config.LoadConfig()

	if err = config.CheckConfig(); err != nil {
		log.GetLogger().Error("加载配置失败", zap.Error(err))
		return
	}

	if err = deps.CheckDependency(); err != nil {
		log.GetLogger().Error("依赖环境准备失败", zap.Error(err))
		return
	}
	if err = server.StartBackend(); err != nil {
		log.GetLogger().Error("后端服务启动失败", zap.Error(err))
		os.Exit(1)
	}
}
