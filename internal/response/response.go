package response

import "github.com/gin-gonic/gin"

type Response struct {
	Error int32  `json:"error"`
	Msg   string `json:"msg"`
	Data  any    `json:"data"`
}

func R(c *gin.Context, data any) {
	c.JSON(200, data)
}
