package whisperx

type WhisperXProcessor struct {
	WorkDir string // 生成中间文件的目录
	Model   string
}

func NewWhisperXProcessor(model string) *WhisperXProcessor {
	return &WhisperXProcessor{
		Model: model,
	}
}
