package config

import (
	"errors"
	"fmt"
	"krillin-ai/log"
	"net/url"
	"os"
	"runtime"
	"strconv"

	"github.com/BurntSushi/toml"
	"go.uber.org/zap"
)

type App struct {
	SegmentDuration      int    `toml:"segment_duration"`
	TranslateParallelNum int    `toml:"translate_parallel_num"`
	Proxy                string `toml:"proxy"`
	ParsedProxy          *url.URL
	TranscribeProvider   string `toml:"transcribe_provider"`
	LlmProvider          string `toml:"llm_provider"`
}

type Server struct {
	Host string `toml:"host"`
	Port int    `toml:"port"`
}

type LocalModel struct {
	Whisper string `toml:"whisper"`
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
		Whisper: "large-v2",
	},
}

// 从环境变量加载配置
func loadFromEnv() {
	// App 配置
	if v := os.Getenv("KRILLIN_SEGMENT_DURATION"); v != "" {
		if duration, err := strconv.Atoi(v); err == nil {
			Conf.App.SegmentDuration = duration
		}
	}
	if v := os.Getenv("KRILLIN_TRANSLATE_PARALLEL_NUM"); v != "" {
		if num, err := strconv.Atoi(v); err == nil {
			Conf.App.TranslateParallelNum = num
		}
	}
	if v := os.Getenv("KRILLIN_PROXY"); v != "" {
		Conf.App.Proxy = v
	}
	if v := os.Getenv("KRILLIN_TRANSCRIBE_PROVIDER"); v != "" {
		Conf.App.TranscribeProvider = v
	}
	if v := os.Getenv("KRILLIN_LLM_PROVIDER"); v != "" {
		Conf.App.LlmProvider = v
	}

	// Server 配置
	if v := os.Getenv("KRILLIN_SERVER_HOST"); v != "" {
		Conf.Server.Host = v
	}
	if v := os.Getenv("KRILLIN_SERVER_PORT"); v != "" {
		if port, err := strconv.Atoi(v); err == nil {
			Conf.Server.Port = port
		}
	}

	// LocalModel 配置
	if v := os.Getenv("KRILLIN_LOCAL_WHISPER"); v != "" {
		Conf.LocalModel.Whisper = v
	}

	// OpenAI 配置
	if v := os.Getenv("KRILLIN_OPENAI_BASE_URL"); v != "" {
		Conf.Openai.BaseUrl = v
	}
	if v := os.Getenv("KRILLIN_OPENAI_MODEL"); v != "" {
		Conf.Openai.Model = v
	}
	if v := os.Getenv("KRILLIN_OPENAI_API_KEY"); v != "" {
		Conf.Openai.ApiKey = v
	}

	// Whisper配置
	if v := os.Getenv("KRILLIN_OPENAI_WHISPER_BASE_URL"); v != "" {
		Conf.Openai.Whisper.BaseUrl = v
	}
	if v := os.Getenv("KRILLIN_OPENAI_WHISPER_API_KEY"); v != "" {
		Conf.Openai.Whisper.ApiKey = v
	}

	// Aliyun OSS 配置
	if v := os.Getenv("KRILLIN_ALIYUN_OSS_ACCESS_KEY_ID"); v != "" {
		Conf.Aliyun.Oss.AccessKeyId = v
	}
	if v := os.Getenv("KRILLIN_ALIYUN_OSS_ACCESS_KEY_SECRET"); v != "" {
		Conf.Aliyun.Oss.AccessKeySecret = v
	}
	if v := os.Getenv("KRILLIN_ALIYUN_OSS_BUCKET"); v != "" {
		Conf.Aliyun.Oss.Bucket = v
	}

	// Aliyun Speech 配置
	if v := os.Getenv("KRILLIN_ALIYUN_SPEECH_ACCESS_KEY_ID"); v != "" {
		Conf.Aliyun.Speech.AccessKeyId = v
	}
	if v := os.Getenv("KRILLIN_ALIYUN_SPEECH_ACCESS_KEY_SECRET"); v != "" {
		Conf.Aliyun.Speech.AccessKeySecret = v
	}
	if v := os.Getenv("KRILLIN_ALIYUN_SPEECH_APP_KEY"); v != "" {
		Conf.Aliyun.Speech.AppKey = v
	}

	// Aliyun Bailian 配置
	if v := os.Getenv("KRILLIN_ALIYUN_BAILIAN_API_KEY"); v != "" {
		Conf.Aliyun.Bailian.ApiKey = v
	}
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
		if Conf.LocalModel.Whisper != "tiny" && Conf.LocalModel.Whisper != "medium" && Conf.LocalModel.Whisper != "large-v2" {
			return errors.New("检测到开启了fasterwhisper，但模型选型配置不正确，请检查配置")
		}
	case "whisperkit":
		if runtime.GOOS != "darwin" {
			log.GetLogger().Error("whisperkit只支持macos", zap.String("当前系统", runtime.GOOS))
			return fmt.Errorf("whisperkit只支持macos")
		}
		if Conf.LocalModel.Whisper != "large-v2" {
			return errors.New("检测到开启了whisperkit，但模型选型配置不正确，请检查配置")
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

func LoadConfig() error {
	var err error
	configPath := "./config/config.toml"

	// 检查配置文件是否存在
	if _, statErr := os.Stat(configPath); os.IsNotExist(statErr) {
		// 配置文件不存在，从环境变量加载
		log.GetLogger().Info("未找到配置文件，从环境变量中加载配置")
		loadFromEnv()
	} else {
		// 配置文件存在，优先从配置文件加载
		log.GetLogger().Info("已找到配置文件，从配置文件中加载配置")
		_, err = toml.DecodeFile(configPath, &Conf)
		if err != nil {
			return fmt.Errorf("配置文件解析失败: %w", err)
		}
	}

	// 解析代理地址
	Conf.App.ParsedProxy, err = url.Parse(Conf.App.Proxy)
	if err != nil {
		return err
	}

	// 本地模型不并发
	if Conf.App.TranscribeProvider == "fasterwhisper" || Conf.App.TranscribeProvider == "whisperkit" {
		Conf.App.TranslateParallelNum = 1
	}

	// 验证配置
	return validateConfig()
}
