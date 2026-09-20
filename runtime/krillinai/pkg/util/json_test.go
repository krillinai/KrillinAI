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

// TestExtractJSONObjectOutputIsParsable 保证提取结果确实能被 encoding/json 解析，
// 这正是 issue #291 中失败的两类响应。
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

// TestCleanMarkdownCodeBlockStillStripsFences 固定 ExtractJSONObject 所依赖的代码块清理行为。
// (control) 该行为在修复前后一致，用于证明本次改动没有影响已有的去围栏逻辑。
func TestCleanMarkdownCodeBlockStillStripsFences(t *testing.T) {
	got := CleanMarkdownCodeBlock("```json\n{\"a\":1}\n```")
	if got != `{"a":1}` {
		t.Errorf("CleanMarkdownCodeBlock() = %q, want %q", got, `{"a":1}`)
	}
}
