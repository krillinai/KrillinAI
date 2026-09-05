package fasterwhisper

type FastwhisperProcessor struct {
	WorkDir string // 生成中间文件的目录
	Model   string
}

func NewFastwhisperProcessor(model string) *FastwhisperProcessor {
	return &FastwhisperProcessor{
		Model: model,
	}
}
