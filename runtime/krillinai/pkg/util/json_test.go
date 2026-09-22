package util

import (
	"encoding/json"
	"testing"
)

func TestExtractJSONObject(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "对话式前缀",
			response: "以下是分割后的结果：\n\n\n{\n  \"align\": [\n    { \"origin_part\": \"I want to show you\" }\n  ]\n}\n",
			key:      "align",
			want:     "{\n  \"align\": [\n    { \"origin_part\": \"I want to show you\" }\n  ]\n}",
		},
		{
			name:     "对话式后缀",
			response: "{\"short_sentences\":[{\"text\":\"a\"}]}\n\n希望这个结果对你有帮助！",
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}]}`,
		},
		{
			name:     "对象尾随逗号",
			response: "{\n\"short_sentences\":[{\n\"text\": \"the owl is a symbol\",\n}] \n}",
			key:      "short_sentences",
			want:     "{\n\"short_sentences\":[{\n\"text\": \"the owl is a symbol\"}] \n}",
		},
		{
			name:     "数组尾随逗号",
			response: `{"short_sentences":[{"text":"a"},{"text":"b"},]}`,
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"},{"text":"b"}]}`,
		},
		{
			name:     "前缀与尾随逗号同时出现",
			response: "以下是分割后的结果：\n```json\n{\"short_sentences\":[{\"text\":\"a\"},]}\n```",
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}]}`,
		},
		{
			name:     "Markdown 代码块",
			response: "```json\n{\"align\":[{\"origin_part\":\"a\",\"translated_part\":\"b\"}]}\n```",
			key:      "align",
			want:     `{"align":[{"origin_part":"a","translated_part":"b"}]}`,
		},
		{
			name:     "已经是合法 JSON 时保持不变",
			response: `{"short_sentences":[{"text":"a"}]}`,
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}]}`,
		},
		{
			name:     "跳过不含目标字段的前置对象",
			response: `{"a":1} {"b":2}`,
			key:      "b",
			want:     `{"b":2}`,
		},
		{
			name:     "目标字段在第一个对象时不再继续扫描",
			response: `{"a":1} {"b":2}`,
			key:      "a",
			want:     `{"a":1}`,
		},
		{
			name:     "字符串内的括号不影响匹配",
			response: `{"text":"a } b ] c"}`,
			key:      "text",
			want:     `{"text":"a } b ] c"}`,
		},
		{
			name:     "字符串内的逗号不被删除",
			response: `{"text":"a, "}`,
			key:      "text",
			want:     `{"text":"a, "}`,
		},
		{
			name:     "转义引号不会提前结束字符串",
			response: `{"text":"he said \"} \" and left",}`,
			key:      "text",
			want:     `{"text":"he said \"} \" and left"}`,
		},
		{
			name:     "无 JSON 结构时原样返回",
			response: "  抱歉，我无法完成这个请求  ",
			key:      "short_sentences",
			want:     "抱歉，我无法完成这个请求",
		},
		{
			name:     "空字符串",
			response: "",
			key:      "short_sentences",
			want:     "",
		},
		{
			name:     "只有空白",
			response: "  \n\t ",
			key:      "align",
			want:     "",
		},
		{
			name:     "结构不完整时原样返回",
			response: `{"short_sentences":[{"text":"a"}`,
			key:      "short_sentences",
			want:     `{"short_sentences":[{"text":"a"}`,
		},
		{
			name:     "空对象不含目标字段",
			response: "{}",
			key:      "align",
			want:     "{}",
		},
		{
			name:     "顶层数组不是对象",
			response: "[]",
			key:      "align",
			want:     "[]",
		},
		{
			name:     "嵌套结构的多处尾随逗号",
			response: `{"a":{"b":[{"c":1},]},}`,
			key:      "a",
			want:     `{"a":{"b":[{"c":1}]}}`,
		},
		{
			name:     "连续逗号一并去除",
			response: `{"a":1,,}`,
			key:      "a",
			want:     `{"a":1}`,
		},
		{
			name:     "结束符不匹配时不做猜测",
			response: "[}",
			key:      "align",
			want:     "[}",
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

// TestExtractJSONObjectScannerBoundaries 覆盖扫描器的边界：转义处理、行尾符号、
// BOM、Unicode 转义与更深的嵌套。
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

// TestExtractJSONObjectSkipsDecoyValues 说明文字里的方括号、示意性对象或空对象都不含
// 目标字段，扫描继续往后找，直到命中顶层带该字段的对象。
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

// TestExtractJSONObjectLeavesUnparsableInputAlone 结构损坏或没有合适候选时不做猜测，
// 原样返回去除首尾空白的输入，调用方因此仍能拿到真实的解析错误。
// 取候选时按字段名精确匹配，大小写不一致也算不命中。
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
			name:     "围栏内没有候选含目标字段时返回去围栏后的文本",
			response: "```json\n{\"note\":\"x\"}\n```",
			key:      "align",
			want:     `{"note":"x"}`,
		},
		{
			name:     "同名字段只嵌套在下层时不算命中",
			response: `{"data":{"align":[{"origin_part":"a"}]}}`,
			key:      "align",
			want:     `{"data":{"align":[{"origin_part":"a"}]}}`,
		},
		{
			name:     "字段名大小写不一致时不算命中",
			response: `{"Align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"Align":[{"origin_part":"a"}]}`,
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

// TestExtractJSONObjectCandidateWalkBoundaries 覆盖“诱饵本身不是合法 JSON”以及
// “同名字段出现在不同层级”这两类输入上的判定。
func TestExtractJSONObjectCandidateWalkBoundaries(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "诱饵字符串内的括号不会吞掉后面的回答",
			response: `{"note":"{"} 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "括号闭合但无法解析的诱饵被跳过",
			response: `{"a":} 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "只有逗号的诱饵被跳过",
			response: `{,} 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "顶层数组内含同名字段时继续向后扫描",
			response: `[{"align":[9]}] 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "先出现嵌套同名字段再出现顶层对象时取顶层的",
			response: `{"data":{"align":[9]}} {"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "首个大括号前的逗号被丢弃",
			response: `,{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "空字符串值后的尾随逗号被去掉",
			response: `{"align":"",}`,
			key:      "align",
			want:     `{"align":""}`,
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

// TestExtractJSONObjectStopsAtFirstCarrier 有多个顶层候选都带目标字段时取最靠前的一个，
// 回答之后的示例对象不参与选取。
func TestExtractJSONObjectStopsAtFirstCarrier(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "多个候选都含目标字段时取最前面的",
			response: `{"align":[{"origin_part":"a"}]} {"align":[{"origin_part":"b"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "回答之后的示例对象不影响结果",
			response: `{"align":[{"origin_part":"a"}]} 仅供参考：{}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
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

// TestExtractJSONObjectSelectionAmongCarriers 在“候选之后还有另一个候选”的输入上固定选取语义：
// 字段值为空数组或 null 时仍然接受，不会改取后面的对象；字段名大小写不一致时不接受，
// 会继续扫描到精确匹配的对象。
func TestExtractJSONObjectSelectionAmongCarriers(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "字段为空数组的候选仍然优先于后面的候选",
			response: `{"align":[]} {"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[]}`,
		},
		{
			name:     "字段为 null 的候选仍然优先于后面的候选",
			response: `{"align":null} {"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":null}`,
		},
		{
			name:     "大小写不一致的候选被跳过后取精确匹配的",
			response: `{"Align":[{"origin_part":"a"}]} {"align":[{"origin_part":"b"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"b"}]}`,
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

// TestExtractJSONObjectFenceAndWalkOrder 先去 Markdown 围栏、再按候选向后扫描，
// 因此围栏内外的示例对象都会先变成普通文本、再被候选扫描跳过。
func TestExtractJSONObjectFenceAndWalkOrder(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			name:     "围栏内的示例对象被跳过",
			response: "```json\n{} {\"align\":[{\"origin_part\":\"a\"}]}\n```",
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "围栏之前的示例对象被跳过",
			response: "示例：{\"note\":\"x\"}\n```json\n{\"align\":[{\"origin_part\":\"a\"}]}\n```",
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			name:     "字符串里的围栏标记不影响候选边界",
			response: "{\"note\":\"```json\"} {\"align\":[{\"origin_part\":\"a\"}]}",
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
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

// TestExtractJSONObjectNonASCIITrailingComma 容错只覆盖 ASCII 逗号（cutset 为 " \t\r\n,"），
// 中文全角逗号不在其中，带全角逗号的候选仍是非法 JSON、算不命中并继续向后扫描。
func TestExtractJSONObjectNonASCIITrailingComma(t *testing.T) {
	const response = `{"align":[1]，} {"align":[{"origin_part":"a"}]}`
	const want = `{"align":[{"origin_part":"a"}]}`

	if got := ExtractJSONObject(response, "align"); got != want {
		t.Errorf("ExtractJSONObject() = %q, want %q", got, want)
	}
}

// TestExtractJSONObjectDuplicateTopLevelKey 顶层字段重复时仍算命中：encoding/json 解到 map
// 时后出现的同名字段会覆盖前一个，但字段依然存在，因此应当就地返回该候选。
func TestExtractJSONObjectDuplicateTopLevelKey(t *testing.T) {
	const response = `{"note":"见下"} {"align":[1],"align":[2]}`
	const want = `{"align":[1],"align":[2]}`

	if got := ExtractJSONObject(response, "align"); got != want {
		t.Errorf("ExtractJSONObject() = %q, want %q", got, want)
	}
}

// TestExtractJSONObjectOutputIsParsable 提取结果必须能被 encoding/json 解析，且带有目标字段。
func TestExtractJSONObjectOutputIsParsable(t *testing.T) {
	responses := []struct {
		name     string
		response string
		key      string
	}{
		{
			name:     "场景一_尾随逗号",
			response: "{\n\"short_sentences\":[{\n\"text\": \"And the reason why they chose the owl is because\",\n},\n{\n\"text\": \"the owl is a symbol used in Europe...\",\n}] \n}",
			key:      "short_sentences",
		},
		{
			name:     "场景二_中文对话式前缀",
			response: "以下是分割后的结果：\n\n\n{\n  \"align\": [\n    { \"origin_part\": \"I want to show you\", \"translated_part\": \"Ich möchte es Ihnen zeigen\" }\n  ]\n}\n",
			key:      "align",
		},
	}

	for _, tt := range responses {
		t.Run(tt.name, func(t *testing.T) {
			var payload map[string]any
			if err := json.Unmarshal([]byte(ExtractJSONObject(tt.response, tt.key)), &payload); err != nil {
				t.Fatalf("解析提取结果失败: %v", err)
			}
			if _, ok := payload[tt.key]; !ok {
				t.Fatalf("提取结果缺少 %q 字段: %v", tt.key, payload)
			}
		})
	}
}
