package router

import (
	"krillin-ai/internal/handler"
	"krillin-ai/static"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Task 定义任务结构体
type Task struct {
	TaskID   string `json:"task_id"`
	TaskName string `json:"task_name"`
	Status   string `json:"status"`
	Progress int    `json:"progress"`
}

// Response 定义响应结构体
type Response struct {
	Success bool   `json:"success"`
	Data    []Task `json:"data"`
	Message string `json:"message"`
}

func SetupRouter(r *gin.Engine) {
	api := r.Group("/api")

	hdl := handler.NewHandler()
	{
		api.POST("/capability/subtitleTask", hdl.StartSubtitleTask)
		api.GET("/capability/subtitleTask", hdl.GetSubtitleTask)
		api.POST("/file", hdl.UploadFile)
		api.GET("/file/*filepath", hdl.DownloadFile)

		api.GET("/tasks", func(c *gin.Context) { // 路径为 /api/tasks
			tasks := []Task{
				{
					TaskID:   "1",
					TaskName: "视频翻译任务",
					Status:   "processing",
					Progress: 50,
				},
				{
					TaskID:   "2",
					TaskName: "音频处理任务",
					Status:   "completed",
					Progress: 100,
				},
				{
					TaskID:   "3",
					TaskName: "字幕合成任务",
					Status:   "interrupted",
					Progress: 30,
				},
			}
			response := Response{
				Success: true,
				Data:    tasks,
				Message: "获取任务列表成功",
			}
			c.JSON(http.StatusOK, response)
		})
	}

	r.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/static")
	})
	r.StaticFS("/static", http.FS(static.EmbeddedFiles))
}
