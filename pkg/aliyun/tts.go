package aliyun

import (
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	nls "github.com/aliyun/alibabacloud-nls-go-sdk"
)

type TtsUserParam struct {
	F      io.Writer
	Logger *nls.NlsLogger
}

// TtsClient 语音合成客户端
type TtsClient struct {
	AccessKeyId     string
	AccessKeySecret string
	AppKey          string
}

func NewTtsClient(accessKeyId, accessKeySecret, appKey string) *TtsClient {
	return &TtsClient{
		AccessKeyId:     accessKeyId,
		AccessKeySecret: accessKeySecret,
		AppKey:          appKey,
	}
}

// Text2Speech 将文本转换为语音并保存到文件
func (c *TtsClient) Text2Speech(text, voice, outputFile string) error {
	fout, err := os.OpenFile(outputFile, os.O_RDWR|os.O_TRUNC|os.O_CREATE, 0666)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer fout.Close()

	logger := nls.NewNlsLogger(os.Stderr, "TTS", log.LstdFlags|log.Lmicroseconds)
	logger.SetLogSil(false)
	logger.SetDebug(true)

	// 用户参数
	ttsUserParam := &TtsUserParam{
		F:      fout,
		Logger: logger,
	}

	param := nls.DefaultSpeechSynthesisParam()
	param.Voice = voice // 设置语音类型

	var token string
	token, err = CreateToken(c.AccessKeyId, c.AccessKeySecret)
	config := nls.NewConnectionConfigWithToken(nls.DEFAULT_URL, c.AppKey, token)

	// 语音合成实例
	var tts *nls.SpeechSynthesis
	tts, err = nls.NewSpeechSynthesis(config, logger, false,
		onTaskFailed, onSynthesisResult, nil,
		onCompleted, onClose, ttsUserParam)
	if err != nil {
		return fmt.Errorf("failed to create speech synthesis instance: %w", err)
	}

	// 启动任务
	var ch chan bool
	ch, err = tts.Start(text, param, nil)
	if err != nil {
		return fmt.Errorf("failed to start speech synthesis: %w", err)
	}

	// 等待任务完成
	if err = waitReady(ch, logger); err != nil {
		return fmt.Errorf("speech synthesis task failed: %w", err)
	}

	// 关闭实例
	tts.Shutdown()
	logger.Println("Speech synthesis completed and saved to", outputFile)
	return nil
}

// onTaskFailed 任务失败回调
func onTaskFailed(text string, param any) {
	p, ok := param.(*TtsUserParam)
	if !ok {
		log.Default().Fatal("invalid logger")
		return
	}
	p.Logger.Println("TaskFailed:", text)
}

// onSynthesisResult 合成结果回调
func onSynthesisResult(data []byte, param any) {
	p, ok := param.(*TtsUserParam)
	if !ok {
		log.Default().Fatal("invalid logger")
		return
	}
	if _, err := p.F.Write(data); err != nil {
		p.Logger.Println("Failed to write data to file:", err)
	}
}

// onCompleted 任务完成回调
func onCompleted(text string, param any) {
	p, ok := param.(*TtsUserParam)
	if !ok {
		log.Default().Fatal("invalid logger")
		return
	}
	p.Logger.Println("onCompleted:", text)
}

// onClose 连接关闭回调
func onClose(param any) {
	p, ok := param.(*TtsUserParam)
	if !ok {
		log.Default().Fatal("invalid logger")
		return
	}
	p.Logger.Println("onClosed")
}

// waitReady 等待任务完成
func waitReady(ch chan bool, logger *nls.NlsLogger) error {
	select {
	case done := <-ch:
		if !done {
			logger.Println("Wait failed")
			return errors.New("wait failed")
		}
		logger.Println("Wait done")
	case <-time.After(60 * time.Second):
		logger.Println("Wait timeout")
		return errors.New("wait timeout")
	}
	return nil
}
