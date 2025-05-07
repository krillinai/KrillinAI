package router

import (
	"krillin-ai/internal/handler"
	"krillin-ai/static"
	"net/http"

	"github.com/gin-gonic/gin"
)

func SetupRouter(r *gin.Engine) {
	api := r.Group("/api")

	hdl := handler.NewHandler()
	{
		api.POST("/capability/subtitleTask", hdl.StartSubtitleTask)
		api.GET("/capability/subtitleTask", hdl.GetSubtitleTask)
		api.POST("/capability/loadTask", hdl.LoadExistingTask)
		api.POST("/file", hdl.UploadFile)
		api.GET("/file/*filepath", hdl.DownloadFile)
	}

	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/static")
	})
	r.StaticFS("/static", http.FS(static.EmbeddedFiles))
}
