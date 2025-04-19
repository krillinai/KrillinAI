package whispercpp

type WhispercppProcessor struct {
	WorkDir string // 生成中间文件的目录
	Model   string
}

func NewWhispercppProcessor(model string) *WhispercppProcessor {
	return &WhispercppProcessor{
		Model: model,
	}
}
