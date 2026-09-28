package util

import (
	"encoding/json"
	"strings"
)

// ExtractJSONObject 从大模型返回的文本中提取顶层带有 requiredKey 字段的 JSON 对象。
// 本地模型（如通过 Ollama 运行的 llama3.1）经常在 JSON 前后附带对话式说明，
// 或在 } 、] 之前多输出一个逗号，这两种情况都会让 encoding/json 解析失败。
// 说明里还可能带上示例或解释用的 JSON（如 {} 或 {"note":"..."}），
// 因此这里扫描所有完整 JSON 值，跳过空的示例；多个有效回答则保留原始输入，
// 让调用方走现有的解析错误路径，而不是猜测一个结果。
func ExtractJSONObject(response, requiredKey string) string {
	trimmed := strings.TrimSpace(response)
	var selected string

	for offset := 0; offset < len(trimmed); {
		value, end, ok := extractFirstJSONValue(trimmed, offset)
		if !ok {
			break
		}
		if hasTopLevelKey(value, requiredKey) {
			if selected != "" {
				return trimmed
			}
			selected = value
		}
		offset = end
	}

	if selected != "" {
		return selected
	}
	return CleanMarkdownCodeBlock(response)
}

// extractFirstJSONValue 从 from 开始找到第一个 { 或 [，按嵌套深度取到匹配的结束符，
// 返回该 JSON 值、它在 s 中结束后的下一个位置，以及是否找到完整结构。
// 扫描会跳过字符串字面量中的内容，因此正文里的括号、引号和逗号不会被破坏。
// 结构不完整（缺少结束符）时不做猜测。
func extractFirstJSONValue(s string, from int) (string, int, bool) {
	start := strings.IndexAny(s[from:], "{[")
	if start < 0 {
		return "", len(s), false
	}
	start += from

	var depth int
	var inString, escaped bool
	for i := start; i < len(s); i++ {
		c := s[i]

		if inString {
			switch {
			case escaped:
				escaped = false
			case c == '\\':
				escaped = true
			case c == '"':
				inString = false
			}
			continue
		}

		switch c {
		case '"':
			inString = true
		case '{', '[':
			depth++
		case '}', ']':
			depth--
		}

		if depth == 0 {
			return StripJSONTrailingCommas(s[start : i+1]), i + 1, true
		}
	}

	return "", len(s), false
}

// hasTopLevelKey 判断 value 是不是顶层含有 key 字段的 JSON 对象。
// 数组、标量以及解析失败的内容都不算，嵌套在下层的同名字段也不算。
func hasTopLevelKey(value, key string) bool {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(value), &fields); err != nil {
		return false
	}
	field, ok := fields[key]
	if !ok {
		return false
	}
	valueText := strings.TrimSpace(string(field))
	return valueText != "null" && valueText != "[]"
}
