package pipeline

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveWorkdirExplicit(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "custom")
	taskID, workdir, err := ResolveWorkdir("https://www.youtube.com/watch?v=abc123", dir)
	if err != nil {
		t.Fatalf("ResolveWorkdir() error = %v", err)
	}
	if workdir != dir {
		t.Fatalf("workdir = %q, want %q", workdir, dir)
	}
	if taskID == "" {
		t.Fatalf("taskID is empty")
	}
}

func TestResolveWorkdirDefault(t *testing.T) {
	taskID, workdir, err := ResolveWorkdir("https://www.youtube.com/watch?v=abc123", "")
	if err != nil {
		t.Fatalf("ResolveWorkdir() error = %v", err)
	}
	if !strings.HasPrefix(workdir, filepath.Join("tasks", taskID)) {
		t.Fatalf("workdir = %q does not start with tasks/taskID %q", workdir, taskID)
	}
}

func TestNormalizeLocalInput(t *testing.T) {
	got := NormalizeInput("demo.mp4")
	if got != "local:demo.mp4" {
		t.Fatalf("NormalizeInput() = %q, want local:demo.mp4", got)
	}
	if got := NormalizeInput("local:demo.mp4"); got != "local:demo.mp4" {
		t.Fatalf("NormalizeInput(local) = %q", got)
	}
	if got := NormalizeInput("https://www.bilibili.com/video/BV123"); got != "https://www.bilibili.com/video/BV123" {
		t.Fatalf("NormalizeInput(url) = %q", got)
	}
}
