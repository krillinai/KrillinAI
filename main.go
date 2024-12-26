package main

import (
	"fmt"
	"go.uber.org/zap"
	"krillin-ai/config"
	"krillin-ai/internal/router"
	"krillin-ai/log"
	"krillin-ai/pkg/util"

	"github.com/gin-gonic/gin"
)

type App struct {
	Engine   *gin.Engine
	ProxyUrl string
}

func main() {
	var err error
	log.InitLogger()
	defer log.GetLogger().Sync() // 确保日志被正确写入

	err = config.LoadConfig("./config/config.toml")
	if err != nil {
		log.GetLogger().Error("加载配置文件失败: %v", zap.Error(err))
		return
	}
	err = util.CheckAndDownloadFfmpeg()
	if err != nil {
		log.GetLogger().Error("ffmpeg环境准备失败", zap.Error(err))
		return

	}
	err = util.CheckAndDownloadFfprobe()
	if err != nil {
		log.GetLogger().Error("ffprobe环境准备失败", zap.Error(err))
		return
	}
	err = util.CheckAndDownloadYtDlp()
	if err != nil {
		log.GetLogger().Error("yt-dlp环境准备失败", zap.Error(err))
		return
	}

	gin.SetMode(gin.ReleaseMode)
	app := App{
		Engine: gin.Default(),
	}

	app.Engine = gin.Default()
	router.SetupRouter(app.Engine)
	_ = app.Engine.Run(fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port))
}
