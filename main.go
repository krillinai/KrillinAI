package main

import (
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/router"
	"krillin-ai/log"
	"krillin-ai/pkg/util"

	"github.com/gin-gonic/gin"
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

	err = util.CheckAndDownloadFfmpeg()
	if err != nil {
		panic(fmt.Sprintf("ffmpeg环境准备失败: %v", err))
	}
	err = util.CheckAndDownloadYtDlp()
	if err != nil {
		panic(fmt.Sprintf("yt-dlp环境准备失败: %v", err))
	}

	app := App{
		Engine: gin.Default(),
	}

	app.Engine = gin.Default()
	router.SetupRouter(app.Engine)
	_ = app.Engine.Run(fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port))
}
