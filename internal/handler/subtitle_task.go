package handler

import (
	"github.com/gin-gonic/gin"
	"krillin-ai/internal/dto"
	"krillin-ai/internal/response"
)

func (h Handler) StartSubtitleTask(c *gin.Context) {
	var req dto.StartVideoSubtitleTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		response.R(c, response.Response{
			Error: -1,
			Msg:   "参数错误",
			Data:  nil,
		})
		return
	}

	svc := h.Service

	data, err := svc.StartSubtitleTask(req)
	if err != nil {
		response.R(c, response.Response{
			Error: -1,
			Msg:   err.Error(),
			Data:  nil,
		})
		return
	}
	response.R(c, response.Response{
		Error: 0,
		Msg:   "成功",
		Data:  data,
	})
}

func (h Handler) GetSubtitleTask(c *gin.Context) {
	var req dto.GetVideoSubtitleTaskReq
	if err := c.ShouldBindQuery(&req); err != nil {
		response.R(c, response.Response{
			Error: -1,
			Msg:   "参数错误",
			Data:  nil,
		})
		return
	}
	svc := h.Service
	data, err := svc.GetTaskStatus(req)
	if err != nil {
		response.R(c, response.Response{
			Error: -1,
			Msg:   err.Error(),
			Data:  nil,
		})
		return
	}
	response.R(c, response.Response{
		Error: 0,
		Msg:   "成功",
		Data:  data,
	})
}

func (h Handler) UploadFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.R(c, response.Response{
			Error: -1,
			Msg:   "未能获取文件",
			Data:  nil,
		})
		return
	}

	savePath := "./uploads/" + file.Filename
	if err = c.SaveUploadedFile(file, savePath); err != nil {
		response.R(c, response.Response{
			Error: -1,
			Msg:   "文件保存失败",
			Data:  nil,
		})
		return
	}

	response.R(c, response.Response{
		Error: 0,
		Msg:   "文件上传成功",
		Data:  gin.H{"file_path": "local:" + savePath},
	})
}
