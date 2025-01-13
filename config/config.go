package config

import (
	"errors"
	"github.com/BurntSushi/toml"
	"net/url"
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

var Conf Config

func LoadConfig(filePath string) error {
	var err error
	_, err = toml.DecodeFile(filePath, &Conf)
	if err != nil {
		return err
	}
	// 解析代理地址
	Conf.App.ParsedProxy, err = url.Parse(Conf.App.Proxy)
	if err != nil {
		return err
	}
	if Conf.App.TranscribeProvider == "fasterwhisper" {
		Conf.App.TranslateParallelNum = 1
		if Conf.LocalModel.FasterWhisper != "tiny" && Conf.LocalModel.FasterWhisper != "medium" && Conf.LocalModel.FasterWhisper != "large-v2" {
			return errors.New("检测到开启了fasterwhisper，但模型选型配置不正确，请检查配置")
		}
	}
	return nil
}
