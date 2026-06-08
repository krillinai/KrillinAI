package pipeline

import (
	"context"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenderCoverPrompt(t *testing.T) {
	template := "{{title}}\n{{target_language}}\n{{style_hint}}"
	got := RenderCoverPrompt(template, CoverPromptData{
		Title:          "原始标题",
		TargetLanguage: "zh_cn",
		StyleHint:      "Bilibili 科技封面",
	})
	want := "原始标题\nzh_cn\nBilibili 科技封面"
	if got != want {
		t.Fatalf("RenderCoverPrompt() = %q, want %q", got, want)
	}
}

func TestGenerateCoverWritesPromptAndImage(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{
		coverImageB64: base64.StdEncoding.EncodeToString([]byte("png-bytes")),
	}
	req := CoverRequest{
		Workdir: dir,
		TaskID:  "demo",
		Prompt:  "电影感科技封面，醒目中文标题",
		Size:    "1536x1024",
	}

	resp, err := GenerateCover(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateCover() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, error = %#v", resp.Error)
	}
	if fake.lastCoverPrompt != req.Prompt {
		t.Fatalf("cover prompt = %q, want %q", fake.lastCoverPrompt, req.Prompt)
	}
	if fake.lastCoverSize != req.Size {
		t.Fatalf("cover size = %q, want %q", fake.lastCoverSize, req.Size)
	}

	promptData, err := os.ReadFile(filepath.Join(dir, "cover_prompt.final.txt"))
	if err != nil {
		t.Fatalf("prompt file not written: %v", err)
	}
	if string(promptData) != req.Prompt {
		t.Fatalf("prompt file = %q, want %q", string(promptData), req.Prompt)
	}
	imageData, err := os.ReadFile(filepath.Join(dir, "generated_cover.png"))
	if err != nil {
		t.Fatalf("cover image not written: %v", err)
	}
	if string(imageData) != "png-bytes" {
		t.Fatalf("cover image bytes = %q", string(imageData))
	}
	if !strings.HasSuffix(resp.Outputs.GeneratedCover, "generated_cover.png") {
		t.Fatalf("GeneratedCover = %q", resp.Outputs.GeneratedCover)
	}
}

func TestGenerateCoverRejectsEmptyPrompt(t *testing.T) {
	dir := t.TempDir()
	resp, err := GenerateCover(context.Background(), &fakeStageService{}, CoverRequest{
		Workdir: dir,
		TaskID:  "demo",
	})
	if err == nil {
		t.Fatalf("GenerateCover() error = nil, want error")
	}
	if resp.OK {
		t.Fatalf("OK = true, want false")
	}
	if resp.Error == nil || resp.Error.Code != "prompt_required" {
		t.Fatalf("error = %#v, want prompt_required", resp.Error)
	}
}
