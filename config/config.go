package config

import (
	"errors"
	"fmt"
	"github.com/BurntSushi/toml"
	"go.uber.org/zap"
	"krillin-ai/log"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
)

type App struct {
	SegmentDuration      int      `toml:"segment_duration"`
	TranslateParallelNum int      `toml:"translate_parallel_num"`
	Proxy                string   `toml:"proxy"`
	ParsedProxy          *url.URL `toml:"-"`
	TranscribeProvider   string   `toml:"transcribe_provider"`
	LlmProvider          string   `toml:"llm_provider"`
}

type Server struct {
	Host string `toml:"host"`
	Port int    `toml:"port"`
}

type LocalModel struct {
	Fasterwhisper string `toml:"fasterwhisper"`
	Whisperkit    string `toml:"whisperkit"`
	Whispercpp    string `toml:"whispercpp"`
}

type OpenAiWhisper struct {
	BaseUrl string `toml:"base_url"`
	ApiKey  string `toml:"api_key"`
}

type Openai struct {
	BaseUrl string        `toml:"base_url"`
	Model   string        `toml:"model"`
	ApiKey  string        `toml:"api_key"`
	Whisper OpenAiWhisper `toml:"whisper"`
}

type AliyunOss struct {
	AccessKeyId     string `toml:"access_key_id"`
	AccessKeySecret string `toml:"access_key_secret"`
	Bucket          string `toml:"bucket"`
}

type AliyunSpeech struct {
	AccessKeyId     string `toml:"access_key_id"`
	AccessKeySecret string `toml:"access_key_secret"`
	AppKey          string `toml:"app_key"`
}

type AliyunBailian struct {
	ApiKey string `toml:"api_key"`
}

type Aliyun struct {
	Oss     AliyunOss     `toml:"oss"`
	Speech  AliyunSpeech  `toml:"speech"`
	Bailian AliyunBailian `toml:"bailian"`
}

type Config struct {
	App        App        `toml:"app"`
	Server     Server     `toml:"server"`
	LocalModel LocalModel `toml:"local_model"`
	Openai     Openai     `toml:"openai"`
	Aliyun     Aliyun     `toml:"aliyun"`
}

var Conf = Config{
	App: App{
		SegmentDuration:      5,
		TranslateParallelNum: 5,
		TranscribeProvider:   "openai",
		LlmProvider:          "openai",
	},
	Server: Server{
		Host: "127.0.0.1",
		Port: 8888,
	},
	LocalModel: LocalModel{
		Fasterwhisper: "large-v2",
		Whisperkit:    "large-v2",
		Whispercpp:    "large-v2",
	},
}

// 检查必要的配置是否完整
func validateConfig() error {
	// 检查转写服务提供商配置
	switch Conf.App.TranscribeProvider {
	case "openai":
		if Conf.Openai.Whisper.ApiKey == "" {
			return errors.New("使用OpenAI转写服务需要配置 OpenAI API Key")
		}
	case "fasterwhisper":
		if Conf.LocalModel.Fasterwhisper != "tiny" && Conf.LocalModel.Fasterwhisper != "medium" && Conf.LocalModel.Fasterwhisper != "large-v2" {
			return errors.New("检测到开启了fasterwhisper，但模型选型配置不正确，请检查配置")
		}
	case "whisperkit":
		if runtime.GOOS != "darwin" {
			log.GetLogger().Error("whisperkit只支持macos", zap.String("当前系统", runtime.GOOS))
			return fmt.Errorf("whisperkit只支持macos")
		}
		if Conf.LocalModel.Whisperkit != "large-v2" {
			return errors.New("检测到开启了whisperkit，但模型选型配置不正确，请检查配置")
		}
	case "whispercpp":
		if Conf.LocalModel.Fasterwhisper != "tiny" && Conf.LocalModel.Fasterwhisper != "medium" && Conf.LocalModel.Fasterwhisper != "large-v2" {
			return errors.New("检测到开启了whisper.cpp，但模型选型配置不正确，请检查配置")
		}
	case "aliyun":
		if Conf.Aliyun.Speech.AccessKeyId == "" || Conf.Aliyun.Speech.AccessKeySecret == "" || Conf.Aliyun.Speech.AppKey == "" {
			return errors.New("使用阿里云语音服务需要配置相关密钥")
		}
	default:
		return errors.New("不支持的转录提供商")
	}

	// 检查LLM提供商配置
	switch Conf.App.LlmProvider {
	case "openai":
		if Conf.Openai.ApiKey == "" {
			return errors.New("使用OpenAI LLM服务需要配置 OpenAI API Key")
		}
	case "aliyun":
		if Conf.Aliyun.Bailian.ApiKey == "" {
			return errors.New("使用阿里云百炼服务需要配置 API Key")
		}
	default:
		return errors.New("不支持的LLM提供商")
	}

	return nil
}

func LoadConfig() {
	var err error
	configPath := "./config/config.toml"
	if _, err = os.Stat(configPath); os.IsNotExist(err) {
		return
	} else {
		log.GetLogger().Info("已找到配置文件，从配置文件中加载配置")
		if _, err = toml.DecodeFile(configPath, &Conf); err != nil {
			log.GetLogger().Error("加载配置文件失败", zap.Error(err))
			return
		}
	}
}

// 验证配置
func CheckConfig() error {
	var err error
	// 解析代理地址
	Conf.App.ParsedProxy, err = url.Parse(Conf.App.Proxy)
	if err != nil {
		return err
	}
	return validateConfig()
}

// SaveConfig 保存配置到文件
func SaveConfig() error {
	configPath := filepath.Join("config", "config.toml")

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		err = os.MkdirAll(filepath.Dir(configPath), os.ModePerm)
		if err != nil {
			return err
		}
	}

	data, err := toml.Marshal(Conf)
	if err != nil {
		return err
	}

	err = os.WriteFile(configPath, data, 0644)
	if err != nil {
		return err
	}

	return nil
}
