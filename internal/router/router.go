package router

import (
	"krillin-ai/internal/handler"
	"krillin-ai/internal/service"

	"github.com/gin-gonic/gin"
)

func SetupRouter(r *gin.Engine) {
	api := r.Group("/capability")
	hdl := handler.NewHandler()
	{
		api.POST("/subtitleTask", hdl.StartSubtitleTask)
		api.GET("/subtitleTask", hdl.GetSubtitleTask)
	}

	// 提供静态文件
	r.Static("/source", "./source")
	r.Static("/static", "./static")

	// 添加 API 路由
	r.POST("/api/submit", gin.WrapF(service.RenderPage))

	// 添加根路由
	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})
}
