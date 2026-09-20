package util

import "testing"

// TestExtractJSONScannerBoundaries 覆盖扫描器本身的边界：转义处理、行尾符号、
// BOM、Unicode 转义与更深的嵌套。这些输入在修复前都会原样带着噪声交给
// encoding/json，因此每一条都能区分修复前后的行为。
func TestExtractJSONScannerBoundaries(t *testing.T) {
	tests := []struct {
		name     string
		response string
		want     string
	}{
		{
			name:     "转义反斜杠结尾的字符串后仍能识别尾随逗号",
			response: `{"a":"x\\",}`,
			want:     `{"a":"x\\"}`,
		},
		{
			name:     "Windows 换行的尾随逗号",
			response: "{\r\n\"a\": 1,\r\n}",
			want:     "{\r\n\"a\": 1}",
		},
		{
			name:     "BOM 前缀被丢弃",
			response: "\ufeff{\"a\":1}",
			want:     `{"a":1}`,
		},
		{
			name:     "字符串内的 Unicode 转义不影响嵌套深度",
			response: `{"a":"\u007d","b":2,}`,
			want:     `{"a":"\u007d","b":2}`,
		},
		{
			name:     "三层嵌套的连续尾随逗号",
			response: `{"a":{"b":{"c":[1,],},},}`,
			want:     `{"a":{"b":{"c":[1]}}}`,
		},
		{
			name:     "嵌套数组的尾随逗号",
			response: `[[1,],]`,
			want:     `[[1]]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSON(tt.response); got != tt.want {
				t.Errorf("ExtractJSON() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestExtractJSONTakesFirstJSONValue 固定“取第一个 JSON 值”的语义。
// 扫描从第一个 { 或 [ 开始，因此正文里出现在真正 JSON 之前的方括号或
// 示意性对象会被当作目标。这是该实现已知且有意的取舍，在此显式钉住，
// 以免日后被误认为回归。
func TestExtractJSONTakesFirstJSONValue(t *testing.T) {
	tests := []struct {
		name     string
		response string
		want     string
	}{
		{
			name:     "正文中的方括号先于真正的 JSON 被选中",
			response: `See [1] below: {"short_sentences":[{"text":"a"}]}`,
			want:     `[1]`,
		},
		{
			name:     "示意性对象先于真正的 JSON 被选中",
			response: `{"note":"见下"} 结果：{"short_sentences":[{"text":"a"}]}`,
			want:     `{"note":"见下"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSON(tt.response); got != tt.want {
				t.Errorf("ExtractJSON() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestExtractJSONLeavesUnparsableInputAlone (control) 结构损坏时函数不做猜测，
// 修复前后都原样返回去除首尾空白的输入，调用方因此仍能拿到真实的解析错误。
// 与表驱动用例中的 "[}"" 互为反向：这里覆盖相反的括号顺序，以及字符串未闭合
// （结尾是孤立反斜杠）这一条不同的代码路径。
func TestExtractJSONLeavesUnparsableInputAlone(t *testing.T) {
	tests := []struct {
		name     string
		response string
		want     string
	}{
		{
			name:     "结束符顺序相反",
			response: "{]",
			want:     "{]",
		},
		{
			name:     "字符串未闭合且以孤立反斜杠结尾",
			response: `{"a":"x\`,
			want:     `{"a":"x\`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSON(tt.response); got != tt.want {
				t.Errorf("ExtractJSON() = %q, want %q", got, tt.want)
			}
		})
	}
}
