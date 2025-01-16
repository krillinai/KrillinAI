package main

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/deps"
	"krillin-ai/internal/router"
	"krillin-ai/log"
	"os"
)

type App struct {
	Engine *gin.Engine
}

func main() {
	var err error
	log.InitLogger()
	defer log.GetLogger().Sync() // 确保日志被正确写入

	configPath := "./config/config.toml"
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// 配置文件不存在，仅使用环境变量
		log.GetLogger().Info("配置文件不存在，将仅使用环境变量配置")
		err = config.LoadConfig("")
	} else {
		// 配置文件存在，加载配置文件
		err = config.LoadConfig(configPath)
	}

	if err != nil {
		log.GetLogger().Error("加载配置失败", zap.Error(err))
		return
	}

	err = deps.CheckDependency()
	if err != nil {
		log.GetLogger().Error("依赖环境准备失败", zap.Error(err))
		return
	}

	gin.SetMode(gin.ReleaseMode)
	app := App{
		Engine: gin.Default(),
	}

	router.SetupRouter(app.Engine)
	_ = app.Engine.Run(fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port))
}
