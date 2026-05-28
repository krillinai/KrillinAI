package pipeline

import (
	"fmt"
	"krillin-ai/pkg/util"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// ResolveWorkdir returns a task ID and work directory, creating workdir/output.
func ResolveWorkdir(input, explicit string) (string, string, error) {
	taskID := makeTaskID(input)
	workdir := explicit
	if workdir == "" {
		workdir = filepath.Join("tasks", taskID)
	}
	if err := os.MkdirAll(filepath.Join(workdir, "output"), 0755); err != nil {
		return "", "", err
	}
	return taskID, workdir, nil
}

func makeTaskID(input string) string {
	trimmed := strings.TrimSpace(input)
	last := trimmed
	if trimmed == "" {
		last = "task"
	} else if parsed, err := url.Parse(trimmed); err == nil {
		query := parsed.Query()
		if values, ok := query["v"]; ok && len(values) > 0 {
			last = values[0]
		} else if parsed.Path != "" {
			parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
			last = parts[len(parts)-1]
		}
	}
	last = strings.ReplaceAll(last, " ", "")
	runes := []rune(last)
	if len(runes) > 16 {
		runes = runes[:16]
	}
	baseInput := string(runes)
	if strings.TrimSpace(baseInput) == "" {
		baseInput = "task"
	}
	base := util.SanitizePathName(baseInput)
	if base == "" {
		base = "task"
	}
	return fmt.Sprintf("%s_%s", base, util.GenerateRandStringWithUpperLowerNum(8))
}

func NormalizeInput(input string) string {
	input = strings.TrimSpace(input)
	if strings.HasPrefix(input, "local:") ||
		strings.HasPrefix(input, "http://") ||
		strings.HasPrefix(input, "https://") {
		return input
	}
	return "local:" + input
}
