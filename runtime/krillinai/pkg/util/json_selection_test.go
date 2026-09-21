package util

import "testing"

// TestExtractJSONObjectSelectionAmongCarriers 在“候选之后还有另一个候选”的输入上固定选取语义。
// TestExtractJSONObjectAcceptsPresentButEmptyField 和
// TestExtractJSONObjectLeavesUnparsableInputAlone/字段名大小写不一致时不算命中
// 的响应本身就是期望结果，接受该候选与一路跳到最后原样返回会得到相同的字符串，
// 因此它们看不出选取规则的变化；这里在后面再放一个含目标字段的对象，
// 让“接受”和“跳过”给出不同的结果：
//   - 字段值为空数组或 null 时仍然接受，不会改取后面的对象；
//   - 字段名大小写不一致时不接受，会继续扫描到精确匹配的对象。
//
// 修复前整段响应原样交给 encoding/json，三条都拿不到单个对象，因此都能区分修复前后的行为。
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
