package whisperkit

type WhisperKitProcessor struct {
	WorkDir string // 生成中间文件的目录
	Model   string
}

func NewWhisperKitProcessor(model string) *WhisperKitProcessor {
	return &WhisperKitProcessor{
		Model: model,
	}
}
