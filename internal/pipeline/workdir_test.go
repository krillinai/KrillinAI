package pipeline

import (
	"os"
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
	t.Chdir(t.TempDir())
	taskID, workdir, err := ResolveWorkdir("https://www.youtube.com/watch?v=abc123", "")
	if err != nil {
		t.Fatalf("ResolveWorkdir() error = %v", err)
	}
	wantPrefix := filepath.Join("tasks", taskID)
	if !strings.HasPrefix(workdir, wantPrefix) {
		t.Fatalf("workdir = %q does not start with tasks/taskID %q", workdir, taskID)
	}
	if _, err := os.Stat(filepath.Join(workdir, "output")); err != nil {
		t.Fatalf("workdir output directory stat error = %v", err)
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
	if got := NormalizeInput(" https://example.com "); got != "https://example.com" {
		t.Fatalf("NormalizeInput(trimmed url) = %q", got)
	}
}

func TestMakeTaskIDEmptyInputUsesTaskFallback(t *testing.T) {
	got := makeTaskID("")
	if !strings.HasPrefix(got, "task_") {
		t.Fatalf("makeTaskID(empty) = %q, want task_ prefix", got)
	}
}

func TestMakeTaskIDUsesQueryVWithoutPath(t *testing.T) {
	got := makeTaskID("https://example.com?v=abc123")
	if !strings.HasPrefix(got, "abc123_") {
		t.Fatalf("makeTaskID(query v) = %q, want abc123_ prefix", got)
	}
}

func TestMakeTaskIDUsesEmptyQueryVAsFallback(t *testing.T) {
	got := makeTaskID("https://example.com/watch?v=")
	if !strings.HasPrefix(got, "task_") {
		t.Fatalf("makeTaskID(empty query v) = %q, want task_ prefix", got)
	}
}

func TestMakeTaskIDUsesEightCharSuffix(t *testing.T) {
	got := makeTaskID("abc")
	parts := strings.Split(got, "_")
	if len(parts) < 2 || len(parts[len(parts)-1]) != 8 {
		t.Fatalf("makeTaskID() = %q, want 8-character suffix", got)
	}
}
