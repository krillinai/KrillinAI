package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	subtitlestyle "krillin-ai/internal/subtitle_style"
	"krillin-ai/internal/types"
)

func TestSubtitleDocumentPreservesTextRolesAndTimeline(t *testing.T) {
	doc := SubtitleDocument{Width: 1920, Height: 1080, Horizontal: true, Bilingual: true, SubtitlePosition: "bottom", Cues: []SubtitleDocumentCue{
		{StartMS: 1230, EndMS: 4560, Text: "译文，保留标点！\n手动换行。", SourceText: strings.Repeat("Full source context, ", 15)},
		{StartMS: 2000, EndMS: 5000, Text: "重叠字幕"},
	}}
	ass, err := CompileSubtitleDocument(doc, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"00:00:01.23,00:00:04.56", "00:00:02.00,00:00:05.00", `译文，保留标点！\N手动换行。`, doc.Cues[0].SourceText, "YCbCr Matrix: None"} {
		if !strings.Contains(ass, want) {
			t.Fatalf("missing %q in %s", want, ass)
		}
	}
	line := strings.Split(ass, "Dialogue: 0,")[1]
	if strings.Index(line, `\rMinor`) > strings.Index(line, `\rMajor`) {
		t.Fatal("bottom translation must follow source")
	}
	if strings.Count(ass, "Dialogue:") != 2 {
		t.Fatal("overlapping events were merged")
	}
}

func TestSubtitleDocumentMatchesSRTAdapter(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:01,230 --> 00:00:04,560\n译文！\nOriginal, with punctuation.\n\n"), 0600); err != nil {
		t.Fatal(err)
	}
	step := &types.SubtitleTaskStepParam{RenderWidth: 1920, RenderHeight: 1080}
	doc, err := subtitleDocumentFromSRT(input, true, step)
	if err != nil {
		t.Fatal(err)
	}
	fromSRT, err := CompileSubtitleDocument(doc, nil)
	if err != nil {
		t.Fatal(err)
	}
	expected, err := CompileSubtitleDocument(SubtitleDocument{Width: 1920, Height: 1080, Horizontal: true, Bilingual: true, SubtitlePosition: "top", Cues: []SubtitleDocumentCue{{StartMS: 1230, EndMS: 4560, Text: "译文！", SourceText: "Original, with punctuation."}}}, nil)
	if err != nil || fromSRT != expected {
		t.Fatalf("different compiler output: %v", err)
	}
	step.RenderLineMode = "target-only"
	doc, err = subtitleDocumentFromSRT(input, true, step)
	if err != nil || doc.Bilingual || doc.Cues[0].Text != "译文！\nOriginal, with punctuation." {
		t.Fatalf("multiline monolingual changed roles: %#v %v", doc, err)
	}
}

func TestSubtitleDocumentEscapesControlTextAndRejectsInvalidTimeline(t *testing.T) {
	doc := SubtitleDocument{Width: 720, Height: 1280, MajorTitle: "Title\nDialogue: injected", Cues: []SubtitleDocumentCue{{StartMS: 0, EndMS: 1000, Text: `Literal {\pos(0,0)} and \N`}}}
	ass, err := CompileSubtitleDocument(doc, nil)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(ass, "\nDialogue:") != 2 || strings.Contains(ass, `Literal {\pos`) || strings.Contains(ass, `and \N`) {
		t.Fatalf("unescaped text: %s", ass)
	}
	doc.Cues[0].EndMS = 0
	if _, err := CompileSubtitleDocument(doc, nil); err == nil {
		t.Fatal("invalid timeline accepted")
	}
}

func TestSubtitleDisplayResolution(t *testing.T) {
	for _, test := range []struct {
		name, input   string
		width, height int
	}{
		{"ordinary", `{"streams":[{"width":1920,"height":1080}]}`, 1920, 1080},
		{"anamorphic", `{"streams":[{"width":720,"height":576,"sample_aspect_ratio":"16:15"}]}`, 768, 576},
		{"rotated", `{"streams":[{"width":1920,"height":1080,"side_data_list":[{"rotation":-90}]}]}`, 1080, 1920},
		{"rotated anamorphic", `{"streams":[{"width":720,"height":576,"sample_aspect_ratio":"16:15","tags":{"rotate":"90"}}]}`, 576, 768},
	} {
		t.Run(test.name, func(t *testing.T) {
			w, h, err := subtitleDisplayResolution([]byte(test.input))
			if err != nil || w != test.width || h != test.height {
				t.Fatalf("got %dx%d %v", w, h, err)
			}
		})
	}
	if _, _, err := subtitleDisplayResolution([]byte(`{"streams":[]}`)); err == nil {
		t.Fatal("missing dimensions accepted")
	}
}

func TestSubtitleDocumentUnicodeWrapPreservesWordsAndWhitespace(t *testing.T) {
	style := subtitlestyle.DefaultStyleSet().Horizontal.Major
	text := strings.Repeat("مرحبا بالعالم،  ", 6)
	parts := wrapDocumentLine(text, style, &types.SubtitleTaskStepParam{RenderWidth: 640, RenderHeight: 360}, false)
	if len(parts) < 2 || strings.Join(parts, "") != text {
		t.Fatalf("lost text: %#v", parts)
	}
	for _, part := range parts[:len(parts)-1] {
		if !strings.HasSuffix(part, "بالعالم،") && !strings.HasSuffix(part, "مرحبا") && !strings.HasSuffix(part, " ") {
			t.Fatalf("split inside Arabic word: %q", part)
		}
	}
}
