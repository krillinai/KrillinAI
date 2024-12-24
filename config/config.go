package config

import (
	"github.com/BurntSushi/toml"
	"net/url"
)

type App struct {
	SegmentDuration      int    `toml:"segment_duration"`
	TranslateParallelNum int    `toml:"translate_parallel_num"`
	Proxy                string `toml:"proxy"`
	ParsedProxy          *url.URL
}

type Server struct {
	Host string `toml:"host"`
	Port int    `toml:"port"`
}

type Openai struct {
	ApiKey string `toml:"api_key"`
}

type Aliyun struct {
	AccessKeyId     string `toml:"access_key_id"`
	AccessKeySecret string `toml:"access_key_secret"`
	AppKey          string `toml:"app_key"`
	CosyVoiceWsAddr string `toml:"cosy_voice_ws_addr"`
}

type Config struct {
	App    App    `toml:"app"`
	Server Server `toml:"server"`
	Openai Openai `toml:"openai"`
	Aliyun Aliyun `toml:"aliyun"`
}

var Conf Config

func LoadConfig(filePath string) error {
	_, err := toml.DecodeFile(filePath, &Conf)
	if err != nil {
		return err
	}
	// 解析代理地址
	Conf.App.ParsedProxy, err = url.Parse(Conf.App.Proxy)
	return err
}
