package config

import (
	"errors"
	"fmt"
	"krillin-ai/log"
	"net/url"
	"os"
	"path/filepath"
	"runtime"

	"github.com/BurntSushi/toml"
	"go.uber.org/zap"
)

type App struct {
	SegmentDuration      int      `toml:"segment_duration"`
	TranslateParallelNum int      `toml:"translate_parallel_num"`
	Proxy                string   `toml:"proxy"`
	ParsedProxy          *url.URL `toml:"-"`
	// TranscribeProvider   string   `toml:"transcribe_provider"`
	// LlmProvider          string   `toml:"llm_provider"`
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

type Fasterwhisper struct {
	Model string `toml:"model"`
}

type Whisperkit struct {
	Model string `toml:"model"`
}

type OpenAiWhisper struct {
	BaseUrl string `toml:"base_url"`
	ApiKey  string `toml:"api_key"`
}

type Openai struct {
	BaseUrl string `toml:"base_url"`
	Model   string `toml:"model"`
	ApiKey  string `toml:"api_key"`
	// Whisper OpenAiWhisper `toml:"whisper"`
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

type LLM struct {
	BaseUrl string `toml:"base_url"`
	ApiKey  string `toml:"api_key"`
	Model   string `toml:"model"`
}

type Provider struct {
	Name string `toml:"name"`
}

type TranscribeAliyun struct {
	ApiKey string `toml:"api_key"`
}

type Transcribe struct {
	Provider      Provider         `toml:"provider"`
	OpenAI        Openai           `toml:"openai"`
	Fasterwhisper Fasterwhisper    `toml:"fasterwhisper"`
	Whisperkit    Whisperkit       `toml:"whisperkit"`
	Aliyun        TranscribeAliyun `toml:"aliyun"`
}

type Tts struct {
	Provider Provider  `toml:"provider"`
	OpenAI   Openai    `toml:"openai"`
	Aliyun   TTSAliyun `toml:"aliyun"`
}

type TTSAliyun struct {
	Oss     AliyunOss     `toml:"oss"`
	Speech  AliyunSpeech  `toml:"speech"`
	Bailian AliyunBailian `toml:"bailian"`
}

type Config struct {
	App        App        `toml:"app"`
	Server     Server     `toml:"server"`
	LLM        LLM        `toml:"llm"`
	Transcribe Transcribe `toml:"transcribe"`
	Tts        Tts        `toml:"tts"`
	// LocalModel LocalModel `toml:"local_model"`
	// Openai     Openai     `toml:"openai"`
	// Aliyun     Aliyun     `toml:"aliyun"`
}

var Conf = Config{
	App: App{
		SegmentDuration:      5,
		TranslateParallelNum: 5,
		// TranscribeProvider:   "openai",
		// LlmProvider:          "openai",
	},
	Server: Server{
		Host: "127.0.0.1",
		Port: 8888,
	},

	// LocalModel: LocalModel{
	// 	Fasterwhisper: "large-v2",
	// 	Whisperkit:    "large-v2",
	// },
}

// 检查必要的配置是否完整
func validateConfig() error {
	// 检查LLM提供商配置
	if Conf.LLM.BaseUrl == "" || Conf.LLM.ApiKey == "" || Conf.LLM.Model == "" {
		return errors.New("使用LLM服务需要配置 BaseUrl 和 ApiKey")
	}
	// switch Conf.LLM.Provider {
	// case "openai":
	// 	if Conf.Openai.ApiKey == "" {
	// 		return errors.New("使用OpenAI LLM服务需要配置 OpenAI API Key")
	// 	}
	// case "aliyun":
	// 	if Conf.Aliyun.Bailian.ApiKey == "" {
	// 		return errors.New("使用阿里云百炼服务需要配置 API Key")
	// 	}
	// default:
	// 	return errors.New("不支持的LLM提供商")
	// }

	// 检查转录服务提供商配置
	switch Conf.Transcribe.Provider.Name {
	case "openai":
		if Conf.Transcribe.OpenAI.ApiKey == "" {
			return errors.New("使用OpenAI转写服务需要配置 OpenAI API Key")
		} else if Conf.Transcribe.OpenAI.BaseUrl == "" {
			return errors.New("使用OpenAI转写服务需要配置 BaseUrl")
		} else if Conf.Transcribe.OpenAI.Model == "" {
			return errors.New("使用OpenAI转写服务需要配置 Model")
		}
	case "fasterwhisper":
		if Conf.Transcribe.Fasterwhisper.Model != "tiny" && Conf.Transcribe.Fasterwhisper.Model != "medium" && Conf.Transcribe.Fasterwhisper.Model != "large-v2" {
			return errors.New("检测到开启了fasterwhisper，但模型选型配置不正确，请检查配置")
		}
	case "whisperkit":
		Conf.App.TranslateParallelNum = 1
		if runtime.GOOS != "darwin" {
			log.GetLogger().Error("whisperkit只支持macos", zap.String("当前系统", runtime.GOOS))
			return fmt.Errorf("whisperkit只支持macos")
		}
		if Conf.Transcribe.Whisperkit.Model != "large-v2" {
			return errors.New("检测到开启了whisperkit，但模型选型配置不正确，请检查配置")
		}
	case "whispercpp":
		if runtime.GOOS != "windows" { // 当前先仅支持win，模型仅支持large-v2，最小化产品
			log.GetLogger().Error("whispercpp only support windows", zap.String("current os", runtime.GOOS))
			return fmt.Errorf("whispercpp only support windows")
		}
		// if Conf.LocalModel.Whispercpp != "large-v2" {
		// 	return errors.New("检测到开启了whisper.cpp，但模型选型配置不正确，请检查配置")
		// }
	case "aliyun":
		if Conf.Transcribe.Aliyun.ApiKey == "" {
			return errors.New("使用阿里云语音服务需要配置相关密钥")
		}
	default:
		return errors.New("不支持的转录提供商")
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
		_, err = toml.DecodeFile(configPath, &Conf)
		if err != nil {
			log.GetLogger().Error("加载配置文件失败", zap.Error(err))
			return
		}
		log.GetLogger().Info("加载配置文件成功", zap.String("config_path", configPath))
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
