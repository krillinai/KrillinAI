package util

import "testing"

// TestExtractJSONObjectCandidateWalkBoundaries 补齐候选扫描在“诱饵本身不是合法 JSON”
// 以及“同名字段出现在不同层级”这两类输入上的判定。修复前取的是第一个 JSON 值，
// 这些响应都会把诱饵当成回答，因此每一条都能区分修复前后的行为。
func TestExtractJSONObjectCandidateWalkBoundaries(t *testing.T) {
	tests := []struct {
		name     string
		response string
		key      string
		want     string
	}{
		{
			// 诱饵字符串里的 { 只有在扫描器正确跳过字符串字面量时才不会打乱深度，
			// 深度算错就会把诱饵和真正的回答连成一个值。
			name:     "诱饵字符串内的括号不会吞掉后面的回答",
			response: `{"note":"{"} 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			// 括号闭合但内容不是合法 JSON：hasTopLevelKey 解析失败即跳过，扫描继续。
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
			// 顶层数组即使内部含有目标字段也不是候选，扫描会继续到后面的顶层对象。
			name:     "顶层数组内含同名字段时继续向后扫描",
			response: `[{"align":[9]}] 结果：{"align":[{"origin_part":"a"}]}`,
			key:      "align",
			want:     `{"align":[{"origin_part":"a"}]}`,
		},
		{
			// 与“同名字段只嵌套在下层时不算命中”互补：下层同名字段之后还有真正的顶层对象，
			// 说明跳过嵌套命中之后扫描不会就此停下。
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

// TestExtractJSONObjectStopsAtFirstCarrier 固定“命中即返回”的顺序语义：
// 有多个顶层候选都带目标字段时取最靠前的一个，回答之后的示例对象不参与选取。
// 修复前整段响应会被原样交给 encoding/json，因此两条都能区分修复前后的行为；
// 同时它们排除了“取最后一个候选”这种同样能修好 issue #291 的替代实现。
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

// TestExtractJSONObjectWhitespaceOnlyInput (control) 只有空白的响应在修复前后都返回空字符串：
// CleanMarkdownCodeBlock 先把输入清成空串，候选循环的 0 < 0 直接不进入。
// 用于固定入口处的这条边界，防止日后在空输入上返回别的东西或越界。
func TestExtractJSONObjectWhitespaceOnlyInput(t *testing.T) {
	if got := ExtractJSONObject("  \n\t ", "align"); got != "" {
		t.Errorf("ExtractJSONObject() = %q, want %q", got, "")
	}
}
