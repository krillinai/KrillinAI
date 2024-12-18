package main

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"krillin-ai/config"
	"krillin-ai/internal/router"
	"krillin-ai/log"
)

type App struct {
	Engine *gin.Engine
}

func main() {
	var err error
	err = config.LoadConfig("./config/config.toml")
	if err != nil {
		panic(fmt.Sprintf("加载配置文件失败: %v", err))
	}

	log.InitLogger()
	defer log.GetLogger().Sync() // 确保日志被正确写入

	app := App{
		Engine: gin.Default(),
	}

	app.Engine = gin.Default()
	router.SetupRouter(app.Engine)
	_ = app.Engine.Run(fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port))
}
