package config

import (
	"github.com/BurntSushi/toml"
)

type App struct {
	SegmentDuration      int `toml:"segment_duration"`
	TranslateParallelNum int `toml:"translate_parallel_num"`
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
	// 读取TOML文件并解析
	_, err := toml.DecodeFile(filePath, &Conf)
	return err
}
