package log

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"os"
)

var Logger *zap.Logger

func InitLogger() {
	file, err := os.OpenFile("app.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		panic("无法打开日志文件: " + err.Error())
	}

	fileSyncer := zapcore.AddSync(file)
	consoleSyncer := zapcore.AddSync(os.Stdout)

	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	core := zapcore.NewTee(
		zapcore.NewCore(zapcore.NewJSONEncoder(encoderConfig), fileSyncer, zap.DebugLevel),      // 写入文件（JSON 格式）
		zapcore.NewCore(zapcore.NewConsoleEncoder(encoderConfig), consoleSyncer, zap.InfoLevel), // 输出到终端
	)

	Logger = zap.New(core, zap.AddCaller())
}

func GetLogger() *zap.Logger {
	return Logger
}
