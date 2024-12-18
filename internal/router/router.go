package router

import (
	"github.com/gin-gonic/gin"
	"krillin-ai/internal/handler"
)

func SetupRouter(r *gin.Engine) {
	api := r.Group("/capability")
	hdl := handler.NewHandler()
	{
		api.POST("/subtitleTask", hdl.StartSubtitleTask)
		api.GET("/subtitleTask", hdl.GetSubtitleTask)
	}
}
