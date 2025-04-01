package server

import (
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/router"
	"krillin-ai/log"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func StartBackend() error {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.Default()
	router.SetupRouter(engine)
	log.GetLogger().Info("服务启动", zap.String("host", config.Conf.Server.Host), zap.Int("port", config.Conf.Server.Port))
	return engine.Run(fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port))
}
