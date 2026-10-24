package service

import (
	"encoding/json"
	"fmt"
	"krillin-ai/pkg/util"
	"strings"
)

// 只补缺失的结构结束符，绝不补文本、字段、值或分句。逐ID和覆盖校验仍必须通过。
// 避免已输出完整记录仅少一个根括号时重新请求整个批次。
func decodeSegmentJSON(response string, result *segmentResponse) error {
	data := util.ExtractJSONObject(response, "sentences")
	if err := json.Unmarshal([]byte(data), result); err == nil {
		return nil
	}
	data, err := closeSegmentJSON(data)
	if err != nil {
		return err
	}
	*result = segmentResponse{}
	return json.Unmarshal([]byte(data), result)
}

// Shared by both response formats; only append missing structural endings.
func closeSegmentJSON(data string) (string, error) {
	data = strings.TrimSpace(data)
	if !strings.HasPrefix(data, "{") || !(strings.HasSuffix(data, "}") || strings.HasSuffix(data, "]")) {
		return "", fmt.Errorf("invalid segment JSON")
	}
	var stack []byte
	quoted, escaped := false, false
	for i := 0; i < len(data); i++ {
		c := data[i]
		if quoted {
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				quoted = false
			}
			continue
		}
		switch c {
		case '"':
			quoted = true
		case '{':
			stack = append(stack, '}')
		case '[':
			stack = append(stack, ']')
		case '}', ']':
			if len(stack) == 0 || stack[len(stack)-1] != c {
				return "", fmt.Errorf("mismatched segment JSON")
			}
			stack = stack[:len(stack)-1]
		}
	}
	if quoted || len(stack) == 0 {
		return "", fmt.Errorf("invalid segment JSON")
	}
	for i := len(stack) - 1; i >= 0; i-- {
		data += string(stack[i])
	}
	return util.StripJSONTrailingCommas(data), nil
}
