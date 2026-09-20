package util

import "strings"

// ExtractJSON 从大模型返回的文本中提取第一个完整的 JSON 值。
// 本地模型（如通过 Ollama 运行的 llama3.1）经常在 JSON 前后附带对话式说明，
// 或在 } 、] 之前多输出一个逗号，这两种情况都会让 encoding/json 解析失败。
// 该函数先去掉 Markdown 代码块标记，再从第一个 { 或 [ 开始按嵌套深度找到匹配的结束符，
// 丢弃前后多余的文本，并去掉结束符前的尾随逗号。
// 扫描会跳过字符串字面量中的内容，因此正文里的括号、引号和逗号不会被破坏。
// 若文本中不存在 JSON 结构，或结构不完整（缺少结束符），则原样返回去除首尾空白的输入，
// 让调用方拿到真实的解析错误。
func ExtractJSON(response string) string {
	trimmed := CleanMarkdownCodeBlock(response)

	start := strings.IndexAny(trimmed, "{[")
	if start < 0 {
		return trimmed
	}

	var (
		builder  strings.Builder
		depth    int
		inString bool
		escaped  bool
	)
	for i := start; i < len(trimmed); i++ {
		c := trimmed[i]

		if inString {
			builder.WriteByte(c)
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
			trimTrailingComma(&builder)
			depth--
		}

		builder.WriteByte(c)

		if depth == 0 {
			return builder.String()
		}
	}

	// 结构不完整，不做猜测
	return trimmed
}

// trimTrailingComma 去掉已写入内容末尾的逗号（含其后的空白），用于容忍结束符前的尾随逗号。
// 末尾没有逗号时保持原内容不变，避免改动合法 JSON 的缩进。
func trimTrailingComma(builder *strings.Builder) {
	current := builder.String()
	cleaned := strings.TrimRight(current, " \t\r\n,")
	if !strings.Contains(current[len(cleaned):], ",") {
		return
	}
	builder.Reset()
	builder.WriteString(cleaned)
}
