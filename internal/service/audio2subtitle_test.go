package service

import (
	"os"
	"testing"
)

func Test_isValidSplitContent(t *testing.T) {
	// 固定的测试文件路径
	splitContentFile := "g:\\bin\\AI\\tasks\\gdQRrtQP\\srt_no_ts_1.srt"
	originalTextFile := "g:\\bin\\AI\\tasks\\gdQRrtQP\\output\\origin_1.txt"

	// 读取分割内容文件
	splitContent, err := os.ReadFile(splitContentFile)
	if err != nil {
		t.Fatalf("读取分割内容文件失败: %v", err)
	}

	// 读取原始文本文件
	originalText, err := os.ReadFile(originalTextFile)
	if err != nil {
		t.Fatalf("读取原始文本文件失败: %v", err)
	}

	// 执行测试
	if _, err := parseAndCheckContent(string(splitContent), string(originalText)); err != nil {
		t.Errorf("parseAndCheckContent() error = %v, want nil", err)
	}
}
