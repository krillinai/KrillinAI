package log

import "go.uber.org/zap"

var Logger *zap.Logger

func InitLogger() {
	var err error
	Logger, err = zap.NewProduction()
	if err != nil {
		panic("无法初始化日志： " + err.Error())
	}
}

func GetLogger() *zap.Logger {
	return Logger
}
