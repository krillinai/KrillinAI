package cli

import (
	"context"
	"krillin-ai/internal/pipeline"
	"strings"
	"testing"
)

func TestParseSubtitleCommand(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"https://www.youtube.com/watch?v=abc",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", "tasks/demo",
		"--caption-source", "any",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Name != "subtitle" {
		t.Fatalf("Name = %q, want subtitle", cmd.Name)
	}
	if cmd.Subtitle.Input != "https://www.youtube.com/watch?v=abc" {
		t.Fatalf("Input = %q", cmd.Subtitle.Input)
	}
	if cmd.Subtitle.Workdir != "tasks/demo" {
		t.Fatalf("Workdir = %q", cmd.Subtitle.Workdir)
	}
	if !cmd.Subtitle.BilingualTop {
		t.Fatalf("BilingualTop = false, want true by default")
	}
}

func TestParseSubtitleCommandCanPutTargetLanguageOnBottom(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"https://www.youtube.com/watch?v=abc",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", "tasks/demo",
		"--bilingual-top=false",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Subtitle.BilingualTop {
		t.Fatalf("BilingualTop = true, want false when explicitly disabled")
	}
}

func TestParseTTSCommandRequiresInputSRT(t *testing.T) {
	_, err := Parse([]string{"tts", "--workdir", "tasks/demo"})
	if err == nil {
		t.Fatalf("Parse() error = nil, want error")
	}
}

func TestParseRootHelp(t *testing.T) {
	cmd, err := Parse([]string{"--help"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if !cmd.Help || cmd.Name != "" {
		t.Fatalf("Command = %#v, want root help", cmd)
	}
	help := Help(cmd)
	if !strings.Contains(help, "Usage:") || !strings.Contains(help, "subtitle") {
		t.Fatalf("Help() = %q, want root usage with commands", help)
	}
}

func TestParseSubcommandHelp(t *testing.T) {
	cmd, err := Parse([]string{"subtitle", "--help"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if !cmd.Help || cmd.Name != "subtitle" {
		t.Fatalf("Command = %#v, want subtitle help", cmd)
	}
	help := Help(cmd)
	if !strings.Contains(help, "Usage:") || !strings.Contains(help, "--origin-lang") {
		t.Fatalf("Help() = %q, want subtitle usage with flags", help)
	}
}

func TestParseCoverCommand(t *testing.T) {
	cmd, err := Parse([]string{
		"cover",
		"--workdir", "tasks/demo",
		"--task-id", "demo",
		"--prompt", "电影感科技封面，醒目中文标题",
		"--size", "1536x1024",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Name != "cover" {
		t.Fatalf("Name = %q, want cover", cmd.Name)
	}
	if cmd.Cover.Workdir != "tasks/demo" {
		t.Fatalf("Workdir = %q", cmd.Cover.Workdir)
	}
	if cmd.Cover.Prompt != "电影感科技封面，醒目中文标题" {
		t.Fatalf("Prompt = %q", cmd.Cover.Prompt)
	}
	if cmd.Cover.Size != "1536x1024" {
		t.Fatalf("Size = %q", cmd.Cover.Size)
	}
}

func TestParseCoverCommandRequiresPrompt(t *testing.T) {
	_, err := Parse([]string{"cover", "--workdir", "tasks/demo"})
	if err == nil {
		t.Fatalf("Parse() error = nil, want error")
	}
}

func TestParseCoverCommandHelp(t *testing.T) {
	cmd, err := Parse([]string{"cover", "--help"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if !cmd.Help || cmd.Name != "cover" {
		t.Fatalf("Command = %#v, want cover help", cmd)
	}
	help := Help(cmd)
	if !strings.Contains(help, "--prompt") {
		t.Fatalf("Help() = %q, want cover flags", help)
	}
}

func TestExecuteDryRunSubtitleReturnsJSONReadyResponse(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"local:demo.mp4",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", t.TempDir(),
		"--dry-run",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if !resp.OK {
		t.Fatalf("OK = false, error = %#v", resp.Error)
	}
	if resp.Stage != pipeline.StageSubtitle {
		t.Fatalf("Stage = %s", resp.Stage)
	}
}
