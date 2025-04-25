package service

import (
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"krillin-ai/pkg/aliyun"
	"krillin-ai/pkg/fasterwhisper"
	"krillin-ai/pkg/openai"
	"krillin-ai/pkg/whisperkit"

	"go.uber.org/zap"
)

type Service struct {
	Transcriber      types.Transcriber
	ChatCompleter    types.ChatCompleter
	TtsClient        types.Ttser
	OssClient        *aliyun.OssClient
	VoiceCloneClient *aliyun.VoiceCloneClient
}

func NewService() *Service {
	var transcriber types.Transcriber
	var chatCompleter types.ChatCompleter
	var ttsClient types.Ttser

	switch config.Conf.Transcribe.Provider.Name {
	case "openai":
		transcriber = openai.NewClient(config.Conf.Transcribe.OpenAI.BaseUrl, config.Conf.Transcribe.OpenAI.ApiKey, config.Conf.App.Proxy)
	case "aliyun":
		transcriber = aliyun.NewAsrClient(config.Conf.Transcribe.Aliyun.ApiKey)
	case "fasterwhisper":
		transcriber = fasterwhisper.NewFastwhisperProcessor(config.Conf.Transcribe.Fasterwhisper.Model)
	case "whispercpp":
		// transcriber = whispercpp.NewWhispercppProcessor(config.Conf.LocalModel.Whispercpp)
	case "whisperkit":
		transcriber = whisperkit.NewWhisperKitProcessor(config.Conf.Transcribe.Whisperkit.Model)
	}
	log.GetLogger().Info("当前选择的转录源： ", zap.String("transcriber", config.Conf.Transcribe.Provider.Name))

	// switch config.Conf.LLM.Provider {
	// case "openai":
	chatCompleter = openai.NewClient(config.Conf.LLM.BaseUrl, config.Conf.LLM.ApiKey, config.Conf.App.Proxy)
	// case "aliyun":
	// 	chatCompleter = aliyun.NewChatClient(config.Conf.Aliyun.Bailian.ApiKey)
	// }
	log.GetLogger().Info("LLM Model： ", zap.String("llm", config.Conf.LLM.Model))

	switch config.Conf.Tts.Provider.Name {
	case "openai":
		ttsClient = openai.NewClient(config.Conf.Tts.OpenAI.BaseUrl, config.Conf.Tts.OpenAI.ApiKey, config.Conf.App.Proxy)
	case "aliyun":
		ttsClient = aliyun.NewTtsClient(config.Conf.Tts.Aliyun.Speech.AccessKeyId, config.Conf.Tts.Aliyun.Speech.AccessKeySecret, config.Conf.Tts.Aliyun.Speech.AppKey)
	}

	return &Service{
		Transcriber:      transcriber,
		ChatCompleter:    chatCompleter,
		TtsClient:        ttsClient,
		OssClient:        aliyun.NewOssClient(config.Conf.Tts.Aliyun.Oss.AccessKeyId, config.Conf.Tts.Aliyun.Oss.AccessKeySecret, config.Conf.Tts.Aliyun.Oss.Bucket),
		VoiceCloneClient: aliyun.NewVoiceCloneClient(config.Conf.Tts.Aliyun.Speech.AccessKeyId, config.Conf.Tts.Aliyun.Speech.AccessKeySecret, config.Conf.Tts.Aliyun.Speech.AppKey),
	}
}
