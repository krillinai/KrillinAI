package util

import "testing"

// TestExtractJSONObjectScannerBoundaries 覆盖扫描器本身的边界：转义处理、行尾符号、
// BOM、Unicode 转义与更深的嵌套。这些输入在修复前都会原样带着噪声交给
// encoding/json，因此每一条都能区分修复前后的行为。
func TestExtractJSONObjectScannerBoundaries(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "转义反斜杠结尾的字符串后仍能识别尾随逗号",
			response: `{"a":"x\\",}`,
			key:      "a",
			want:     `{"a":"x\\"}`,
		},
		{
			name:     "Windows 换行的尾随逗号",
			response: "{\r\n\"a\": 1,\r\n}",
			key:      "a",
			want:     "{\r\n\"a\": 1}",
		},
		{
			name:     "BOM 前缀被丢弃",
			response: "\ufeff{\"a\":1}",
			key:      "a",
			want:     `{"a":1}`,
		},
		{
			name:     "字符串内的 Unicode 转义不影响嵌套深度",
			response: `{"a":"\u007d","b":2,}`,
			key:      "a",
			want:     `{"a":"\u007d","b":2}`,
		},
		{
			name:     "三层嵌套的连续尾随逗号",
			response: `{"a":{"b":{"c":[1,],},},}`,
			key:      "a",
			want:     `{"a":{"b":{"c":[1]}}}`,
		},
		{
			name:     "嵌套数组的尾随逗号",
			response: `{"a":[[1,],],}`,
			key:      "a",
			want:     `{"a":[[1]]}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSONObject(tt.response, tt.key); got != tt.want {
				t.Errorf("ExtractJSONObject() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestExtractJSONObjectSkipsDecoyValues 钉住按字段选取候选的语义：
// 正文里出现在真正回答之前的方括号、示意性对象或空对象都不含目标字段，
// 会被跳过，扫描继续往后找，直到命中顶层带该字段的对象。
// 修复前取的是第一个 JSON 值，这些用例都会拿到错误的候选。
func TestExtractJSONObjectSkipsDecoyValues(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "正文中的方括号被跳过",
			response: `See [1] below: {"short_sentences":[{"text":"a"}]}`,
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}]}`,
		},
		{
			name:     "示意性对象被跳过",
			response: `{"note":"见下"} 结果：{"short_sentences":[{"text":"a"}]}`,
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}]}`,
		},
		{
			name:     "示例空对象被跳过",
			response: "格式如 {}：\n{\"align\":[{\"origin_part\":\"a\",\"translated_part\":\"b\"}]}",
			key:      "align",
			want:     `{"align":[{"origin_part":"a","translated_part":"b"}]}`,
		},
		{
			name:     "多个诱饵连续出现",
			response: `例如 [] 或 {} 或 {"text":"x"}，实际结果：{"translations":[{"index":1,"text":"一"}]}`,
			key:      "translations",
			want:     `{"translations":[{"index":1,"text":"一"}]}`,
		},
		{
			name:     "诱饵中带尾随逗号也能跳过",
			response: `{"note":"见下",} 结果：{"short_sentences":[{"text":"a"},]}`,
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}]}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSONObject(tt.response, tt.key); got != tt.want {
				t.Errorf("ExtractJSONObject() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestExtractJSONObjectLeavesUnparsableInputAlone (control) 结构损坏或没有合适候选时
// 函数不做猜测，修复前后都原样返回去除首尾空白的输入，调用方因此仍能拿到真实的解析错误。
// 与表驱动用例中的 "[}" 互为反向：这里覆盖相反的括号顺序、字符串未闭合
// （结尾是孤立反斜杠），以及所有候选都不含目标字段这几条不同的代码路径。
func TestExtractJSONObjectLeavesUnparsableInputAlone(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "结束符顺序相反",
			response: "{]",
			key:      "align",
			want:     "{]",
		},
		{
			name:     "字符串未闭合且以孤立反斜杠结尾",
			response: `{"a":"x\`,
			key:      "a",
			want:     `{"a":"x\`,
		},
		{
			name:     "未闭合的诱饵吞掉后文时整体原样返回",
			response: `{ 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{ 结果：{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "没有任何候选含目标字段",
			response: `{"note":"x"} {"other":1}`,
			key:      "align",
			want:     `{"note":"x"} {"other":1}`,
		},
		{
			name:     "同名字段只嵌套在下层时不算命中",
			response: `{"data":{"align":[{"origin_part":"a"}]}}`,
			key:      "align",
			want:     `{"data":{"align":[{"origin_part":"a"}]}}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSONObject(tt.response, tt.key); got != tt.want {
				t.Errorf("ExtractJSONObject() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestExtractJSONObjectAcceptsPresentButEmptyField (control) 说明字段存在即视为命中：
// 模型明确回答了一个空列表或 null 时不再继续往后扫描，这与“找不到字段”是两回事。
// 这两条在修复前后都通过（输入本身就是目标对象），用于固定“存在即命中”的判定，
// 防止日后把空值误判成没有回答而继续扫描后面的内容。
func TestExtractJSONObjectAcceptsPresentButEmptyField(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "字段为空数组",
			response: `{"align":[]}`,
			key:      "align",
			want:     `{"align":[]}`,
		},
		{
			name:     "字段为 null",
			response: `{"align":null}`,
			key:      "align",
			want:     `{"align":null}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ExtractJSONObject(tt.response, tt.key); got != tt.want {
				t.Errorf("ExtractJSONObject() = %q, want %q", got, tt.want)
			}
		})
	}
}
