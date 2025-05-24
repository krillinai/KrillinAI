package server

import (
	"context"
	"fmt"
	"krillin-ai/config"
	"krillin-ai/internal/router"
	"krillin-ai/log"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

var BackEnd *http.Server

func StartBackend() error {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.Default()
	router.SetupRouter(engine)
	BackEnd = &http.Server{
		Addr: fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port),
		Handler: engine,
	}
	log.GetLogger().Info("服务启动", zap.String("host", config.Conf.Server.Host), zap.Int("port", config.Conf.Server.Port))
	// return engine.Run(fmt.Sprintf("%s:%d", config.Conf.Server.Host, config.Conf.Server.Port))
	err := BackEnd.ListenAndServe()
	if err != nil && err != http.ErrServerClosed {
		log.GetLogger().Error("服务启动失败", zap.Error(err))
		return err
	}
	log.GetLogger().Info("服务关闭")
	return nil
}

func StopBackend() error {
	if BackEnd == nil {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := BackEnd.Shutdown(ctx); err != nil {
		log.GetLogger().Error("服务关闭失败", zap.Error(err))
		return err
	}
	BackEnd = nil
	log.GetLogger().Info("服务已成功关闭")
	return nil
}
