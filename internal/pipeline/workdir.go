package pipeline

import (
	"fmt"
	"krillin-ai/pkg/util"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

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
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Path != "" {
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		last = parts[len(parts)-1]
		if v := parsed.Query().Get("v"); v != "" {
			last = v
		}
	}
	last = strings.ReplaceAll(last, " ", "")
	runes := []rune(last)
	if len(runes) > 16 {
		runes = runes[:16]
	}
	base := util.SanitizePathName(string(runes))
	if base == "" {
		base = "task"
	}
	return fmt.Sprintf("%s_%s", base, util.GenerateRandStringWithUpperLowerNum(4))
}

func NormalizeInput(input string) string {
	if strings.HasPrefix(input, "local:") ||
		strings.HasPrefix(input, "http://") ||
		strings.HasPrefix(input, "https://") {
		return input
	}
	return "local:" + input
}
