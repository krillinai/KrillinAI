package util

import "testing"

// TestExtractJSONObjectFenceAndWalkOrder 固定“先去 Markdown 围栏、再按候选向后扫描”这一顺序。
// ExtractJSONObject 先调用 CleanMarkdownCodeBlock，再在结果上逐个取候选，
// 因此围栏内外的示例对象都会先变成普通文本、再被候选扫描跳过。
// 已有的“Markdown 代码块”用例只有围栏、没有示例对象，
// “示例空对象被跳过”只有示例对象、没有围栏，两者的组合此前没有用例覆盖。
// 修复前整段响应只去围栏就交给 encoding/json，两条都拿不到单个对象，能区分修复前后。
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

// TestExtractJSONObjectNonASCIITrailingComma 固定 trimTrailingComma 的字符集边界。
// 它只去掉 ASCII 逗号（cutset 为 " \t\r\n,"），中文全角逗号不在其中，
// 因此带全角逗号的候选仍然是非法 JSON、会被 hasTopLevelKey 判为不命中并继续向后扫描，
// 而不是被“修好”后当成回答。这保证容错只覆盖已知的尾随逗号形态，不会猜测其他写法。
// 修复前整段响应直接交给 encoding/json，拿不到后面那个对象，能区分修复前后。
func TestExtractJSONObjectNonASCIITrailingComma(t *testing.T) {
	const response = `{"align":[1]，} {"align":[{"origin_part":"a"}]}`
	const want = `{"align":[{"origin_part":"a"}]}`

	if got := ExtractJSONObject(response, "align"); got != want {
		t.Errorf("ExtractJSONObject() = %q, want %q", got, want)
	}
}

// TestExtractJSONObjectDuplicateTopLevelKey 固定顶层字段重复时仍算命中。
// encoding/json 解到 map 时后出现的同名字段会覆盖前一个，但字段依然存在，
// 因此这类响应属于“模型的真正回答”，应当就地返回，而不是跳过后落到原样返回。
// 前面放一个不含目标字段的示例对象，使“接受该候选”和“跳到最后原样返回”的结果不同。
func TestExtractJSONObjectDuplicateTopLevelKey(t *testing.T) {
	const response = `{"note":"见下"} {"align":[1],"align":[2]}`
	const want = `{"align":[1],"align":[2]}`

	if got := ExtractJSONObject(response, "align"); got != want {
		t.Errorf("ExtractJSONObject() = %q, want %q", got, want)
	}
}
