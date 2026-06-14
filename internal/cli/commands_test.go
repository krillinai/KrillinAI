package cli

import (
	"context"
	"errors"
	"krillin-ai/internal/pipeline"
	subtitlestyle "krillin-ai/internal/subtitle_style"
	"os"
	"path/filepath"
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

func TestParseSubtitleCommandAcceptsSubtitleStyleFile(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"local:demo.mp4",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", "tasks/demo",
		"--subtitle-style-file", "style.json",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.SubtitleStyleFile != "style.json" {
		t.Fatalf("SubtitleStyleFile = %q", cmd.SubtitleStyleFile)
	}
}

func TestParseTTSCommandRequiresInputSRT(t *testing.T) {
	_, err := Parse([]string{"tts", "--workdir", "tasks/demo"})
	if err == nil {
		t.Fatalf("Parse() error = nil, want error")
	}
}

func TestParseRenderCommandAcceptsSubtitleStyleFile(t *testing.T) {
	cmd, err := Parse([]string{
		"render-horizontal",
		"--workdir", "tasks/demo",
		"--video", "origin.mp4",
		"--subtitle", "bilingual.srt",
		"--subtitle-style-file", "style.json",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.SubtitleStyleFile != "style.json" {
		t.Fatalf("SubtitleStyleFile = %q", cmd.SubtitleStyleFile)
	}
}

func TestParseUpdateCommand(t *testing.T) {
	cmd, err := Parse([]string{
		"update",
		"--repo", "krillinai/KrillinAI",
		"--target", "/usr/local/bin/krillinai-cli",
		"--version", "v2.0.3",
		"--force",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Name != "update" {
		t.Fatalf("Name = %q, want update", cmd.Name)
	}
	if cmd.Update.Repo != "krillinai/KrillinAI" {
		t.Fatalf("Repo = %q", cmd.Update.Repo)
	}
	if cmd.Update.Target != "/usr/local/bin/krillinai-cli" {
		t.Fatalf("Target = %q", cmd.Update.Target)
	}
	if cmd.Update.Version != "v2.0.3" {
		t.Fatalf("Version = %q", cmd.Update.Version)
	}
	if !cmd.Update.Force {
		t.Fatal("Force = false, want true")
	}
}

func TestUpdateHelp(t *testing.T) {
	cmd, err := Parse([]string{"update", "--help"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if !cmd.Help || cmd.Name != "update" {
		t.Fatalf("Command = %#v, want update help", cmd)
	}
	help := Help(cmd)
	if !strings.Contains(help, "krillinai-cli update") || !strings.Contains(help, "--version") {
		t.Fatalf("Help() = %q, want update usage", help)
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
	if !strings.Contains(help, "update") {
		t.Fatalf("Help() = %q, want update command", help)
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

func TestHelpDryRunTextDoesNotClaimManifestWrites(t *testing.T) {
	commands := []string{"subtitle", "render-horizontal", "render-vertical"}
	for _, name := range commands {
		cmd, err := Parse([]string{name, "--help"})
		if err != nil {
			t.Fatalf("Parse(%s --help) error = %v", name, err)
		}
		help := Help(cmd)
		if strings.Contains(help, "write manifest") {
			t.Fatalf("%s help still claims dry-run writes manifest:\n%s", name, help)
		}
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

func TestExecuteDryRunUpdateReturnsJSONReadyResponse(t *testing.T) {
	cmd, err := Parse([]string{"update", "--dry-run"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if !resp.OK {
		t.Fatalf("OK = false, error = %#v", resp.Error)
	}
	if resp.Stage != pipeline.StageUpdate {
		t.Fatalf("Stage = %s, want update", resp.Stage)
	}
	if resp.Inputs["repo"] != "krillinai/KrillinAI" {
		t.Fatalf("repo input = %q", resp.Inputs["repo"])
	}
}

func TestExecuteDryRunRenderRejectsInvalidSubtitleStyleFile(t *testing.T) {
	cmd, err := Parse([]string{
		"render-horizontal",
		"--workdir", t.TempDir(),
		"--video", "origin.mp4",
		"--subtitle", "bilingual.srt",
		"--subtitle-style-file", "missing.json",
		"--dry-run",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if resp.OK {
		t.Fatalf("OK = true, want false for missing style file")
	}
	if resp.Error == nil || !strings.Contains(resp.Error.Message, "missing.json") {
		t.Fatalf("error = %#v, want missing style file message", resp.Error)
	}
}

func TestExecuteDryRunRenderLoadsSubtitleStyleFile(t *testing.T) {
	dir := t.TempDir()
	stylePath := filepath.Join(dir, "style.json")
	if err := os.WriteFile(stylePath, []byte(`{"horizontal":{"major":{"primary_color":"#FFFFFF"}}}`), 0644); err != nil {
		t.Fatal(err)
	}
	cmd, err := Parse([]string{
		"render-horizontal",
		"--workdir", dir,
		"--video", "origin.mp4",
		"--subtitle", "bilingual.srt",
		"--subtitle-style-file", stylePath,
		"--dry-run",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if !resp.OK {
		t.Fatalf("OK = false, error = %#v", resp.Error)
	}
	manifestPath := filepath.Join(dir, "krillinai_manifest.json")
	if _, err := os.Stat(manifestPath); !os.IsNotExist(err) {
		t.Fatalf("manifest exists after dry-run: err = %v", err)
	}
}

func TestLoadSubtitleStyleFindsRepoDefaultFromDifferentWorkingDir(t *testing.T) {
	originalWd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	defaultPath, ok, err := findDefaultSubtitleStylePath()
	if err != nil {
		t.Fatalf("findDefaultSubtitleStylePath() error = %v", err)
	}
	if !ok {
		t.Fatal("default subtitle style path not found")
	}
	t.Cleanup(func() {
		if err := os.Chdir(originalWd); err != nil {
			t.Fatalf("restore cwd: %v", err)
		}
	})
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatal(err)
	}

	style, err := loadSubtitleStyleForCLI("")
	if err != nil {
		t.Fatalf("loadSubtitleStyleForCLI() error = %v", err)
	}
	defaultFile, err := subtitlestyle.LoadOverrideFile(defaultPath)
	if err != nil {
		t.Fatalf("load default file: %v", err)
	}
	if style.Horizontal.Major.PrimaryColor != defaultFile.Horizontal.Major.PrimaryColor {
		t.Fatalf("primary color = %q, want repo default %q", style.Horizontal.Major.PrimaryColor, defaultFile.Horizontal.Major.PrimaryColor)
	}
}

func TestStyleLoadFailureClassifiesDefaultStyleErrorsAsInternal(t *testing.T) {
	err := defaultStyleLoadError(errors.New("broken default style"))
	resp := styleLoadFailure(pipeline.StageRenderHorizontal, "work", "task", err)
	if resp.Error == nil {
		t.Fatal("Error = nil, want style load error")
	}
	if resp.Error.Kind != pipeline.ErrorKindInternal {
		t.Fatalf("Kind = %s, want internal", resp.Error.Kind)
	}
	if resp.Error.Code != "default_subtitle_style_load_failed" {
		t.Fatalf("Code = %q, want default_subtitle_style_load_failed", resp.Error.Code)
	}
}

func TestStyleLoadFailureClassifiesUserStyleErrorsAsUsage(t *testing.T) {
	err := userStyleLoadError(errors.New("missing user style"))
	resp := styleLoadFailure(pipeline.StageRenderHorizontal, "work", "task", err)
	if resp.Error == nil {
		t.Fatal("Error = nil, want style load error")
	}
	if resp.Error.Kind != pipeline.ErrorKindUsage {
		t.Fatalf("Kind = %s, want usage", resp.Error.Kind)
	}
	if resp.Error.Code != "subtitle_style_load_failed" {
		t.Fatalf("Code = %q, want subtitle_style_load_failed", resp.Error.Code)
	}
}
