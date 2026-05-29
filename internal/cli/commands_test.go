package cli

import "testing"

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
}

func TestParseTTSCommandRequiresInputSRT(t *testing.T) {
	_, err := Parse([]string{"tts", "--workdir", "tasks/demo"})
	if err == nil {
		t.Fatalf("Parse() error = nil, want error")
	}
}
