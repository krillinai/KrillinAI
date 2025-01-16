package config

import (
	"errors"
	"github.com/BurntSushi/toml"
	"net/url"
	"os"
	"strconv"
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
	FasterWhisper string `toml:"faster_whisper"`
}

type Openai struct {
	BaseUrl string `toml:"base_url"`
	Model   string `toml:"model"`
	ApiKey  string `toml:"api_key"`
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
		FasterWhisper: "medium",
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
	if v := os.Getenv("KRILLIN_FASTER_WHISPER"); v != "" {
		Conf.LocalModel.FasterWhisper = v
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
		if Conf.Openai.ApiKey == "" {
			return errors.New("使用OpenAI转写服务需要配置 OpenAI API Key")
		}
	case "fasterwhisper":
		if Conf.LocalModel.FasterWhisper != "tiny" && Conf.LocalModel.FasterWhisper != "medium" && Conf.LocalModel.FasterWhisper != "large-v2" {
			return errors.New("检测到开启了fasterwhisper，但模型选型配置不正确，请检查配置")
		}
	case "aliyun":
		if Conf.Aliyun.Speech.AccessKeyId == "" || Conf.Aliyun.Speech.AccessKeySecret == "" || Conf.Aliyun.Speech.AppKey == "" {
			return errors.New("使用阿里云语音服务需要配置相关密钥")
		}
	default:
		return errors.New("不支持的转写服务提供商")
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

func LoadConfig(filePath string) error {
	var err error

	// 如果提供了配置文件路径，则尝试加载
	if filePath != "" {
		_, err = toml.DecodeFile(filePath, &Conf)
		if err != nil {
			return err
		}
	}

	// 加载环境变量配置
	loadFromEnv()

	// 解析代理地址
	Conf.App.ParsedProxy, err = url.Parse(Conf.App.Proxy)
	if err != nil {
		return err
	}

	// 如果使用fasterwhisper，强制设置并行数为1
	if Conf.App.TranscribeProvider == "fasterwhisper" {
		Conf.App.TranslateParallelNum = 1
	}

	// 验证配置
	return validateConfig()
}
