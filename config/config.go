package config

import (
	"github.com/BurntSushi/toml"
)

type App struct {
	BasePath             string `toml:"base_path"`
	SegmentDuration      int    `toml:"segment_duration"`
	TranslateParallelNum int    `toml:"translate_parallel_num"`
}

type Server struct {
	Host string `toml:"host"`
	Port int    `toml:"port"`
}

type Openai struct {
	ApiKey string `toml:"api_key"`
}

type Config struct {
	App    App    `toml:"app"`
	Openai Openai `toml:"openai"`
	Server Server `toml:"server"`
}

var Conf Config

func LoadConfig(filePath string) error {
	// 读取TOML文件并解析
	_, err := toml.DecodeFile(filePath, &Conf)
	return err
}
