package opencreatorapi

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"krillin-ai/internal/pipeline"
)

func TestRenderSubtitleKindsUsesBilingualOnlyWhenRequested(t *testing.T) {
	tests := []struct {
		name    string
		stage   StageType
		options map[string]interface{}
		want    []string
	}{
		{name: "target only", stage: StageRenderHorizontal, options: map[string]interface{}{}, want: []string{"target_subtitle"}},
		{name: "horizontal bilingual", stage: StageRenderHorizontal, options: map[string]interface{}{"bilingual": true}, want: []string{"bilingual_subtitle", "target_subtitle"}},
		{name: "vertical bilingual", stage: StageRenderVertical, options: map[string]interface{}{"bilingual": true}, want: []string{"vertical_subtitle", "bilingual_subtitle", "target_subtitle"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := renderSubtitleKinds(test.stage, test.options); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("renderSubtitleKinds() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestRenderSubtitleInputUsesHistoricalShortSubtitle(t *testing.T) {
	guard, err := NewPathGuard(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	jobDir, err := guard.JobDir("job_1")
	if err != nil {
		t.Fatal(err)
	}
	subtitleDir := filepath.Join(jobDir, "stages", "subtitle_stage", "krillin")
	if err := os.MkdirAll(subtitleDir, 0700); err != nil {
		t.Fatal(err)
	}
	bilingual := filepath.Join(subtitleDir, "bilingual_srt.srt")
	short := filepath.Join(subtitleDir, "short_origin_mixed_srt.srt")
	if err := os.WriteFile(bilingual, []byte("bilingual"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(short, []byte("short"), 0600); err != nil {
		t.Fatal(err)
	}
	index := artifactIndex{Artifacts: []artifactIndexEntry{{
		ID: "subtitle_1", Kind: "bilingual_subtitle",
		RelativePath: filepath.ToSlash(filepath.Join("stages", "subtitle_stage", "krillin", "bilingual_srt.srt")),
	}}}
	data, err := json.Marshal(index)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(jobDir, "artifact-index.json"), data, 0600); err != nil {
		t.Fatal(err)
	}

	runner := NewPipelineRunner(guard)
	got, err := runner.renderSubtitleInput(CreateTaskRequest{
		JobID: "job_1", StageType: StageRenderVertical,
		InputArtifactIDs: []string{"subtitle_1"},
		Options:          map[string]interface{}{"bilingual": true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != short {
		t.Fatalf("renderSubtitleInput() = %q, want historical short subtitle %q", got, short)
	}
}

func TestCollectSubtitleArtifactsIncludesVerticalSubtitle(t *testing.T) {
	guard, err := NewPathGuard(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	workdir, err := guard.StageWorkdir("job_1", "stage_1")
	if err != nil {
		t.Fatal(err)
	}
	paths := pipeline.Outputs{
		OriginVideo:         filepath.Join(workdir, "origin_video.mp4"),
		OriginSRT:           filepath.Join(workdir, "origin_language_srt.srt"),
		TargetSRT:           filepath.Join(workdir, "target_language_srt.srt"),
		BilingualSRT:        filepath.Join(workdir, "bilingual_srt.srt"),
		ShortOriginMixedSRT: filepath.Join(workdir, "short_origin_mixed_srt.srt"),
	}
	for _, path := range []string{
		paths.OriginVideo,
		paths.OriginSRT,
		paths.TargetSRT,
		paths.BilingualSRT,
		paths.ShortOriginMixedSRT,
	} {
		if err := os.WriteFile(path, []byte("fixture"), 0600); err != nil {
			t.Fatal(err)
		}
	}

	runner := NewPipelineRunner(guard)
	artifacts, err := runner.collectArtifacts(CreateTaskRequest{
		JobID: "job_1", StageRunID: "stage_1", StageType: StageSubtitle,
	}, paths)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, artifact := range artifacts {
		if artifact.Kind == "vertical_subtitle" {
			found = true
			if filepath.Base(artifact.RelativePath) != "short_origin_mixed_srt.srt" {
				t.Fatalf("vertical subtitle path = %q", artifact.RelativePath)
			}
		}
	}
	if !found {
		t.Fatal("vertical_subtitle artifact was not collected")
	}
}

func TestSubtitleStyleFromOptionsMapsMinorPrimaryColor(t *testing.T) {
	style, err := subtitleStyleFromOptions(map[string]interface{}{
		"subtitleStyle": map[string]interface{}{
			"version": float64(1),
			"horizontal": map[string]interface{}{
				"major": map[string]interface{}{
					"primary_color": "#FFE0A3",
					"outline_color": "#2B1B12",
					"outline":       float64(4),
				},
				"minor": map[string]interface{}{
					"primary_color": "#FFFFFF",
					"outline_color": "#2B1B12",
					"outline":       float64(4),
				},
			},
			"vertical": map[string]interface{}{
				"major": map[string]interface{}{"primary_color": "#FFE0A3"},
				"minor": map[string]interface{}{"primary_color": "#FFFFFF"},
			},
		},
	})
	if err != nil {
		t.Fatalf("subtitleStyleFromOptions() error = %v", err)
	}
	if style.Horizontal.Major.PrimaryColor != "#FFE0A3" {
		t.Fatalf("horizontal Major primary color = %q", style.Horizontal.Major.PrimaryColor)
	}
	if style.Horizontal.Minor.PrimaryColor != "#FFFFFF" {
		t.Fatalf("horizontal Minor primary color = %q, want English subtitle white", style.Horizontal.Minor.PrimaryColor)
	}
	if style.Vertical.Minor.PrimaryColor != "#FFFFFF" {
		t.Fatalf("vertical Minor primary color = %q, want English subtitle white", style.Vertical.Minor.PrimaryColor)
	}
	if style.Horizontal.Minor.Outline == nil || *style.Horizontal.Minor.Outline != 4 {
		t.Fatalf("horizontal Minor outline = %v, want 4", style.Horizontal.Minor.Outline)
	}
	if style.Horizontal.Minor.FontSize == nil || *style.Horizontal.Minor.FontSize != 10 {
		t.Fatalf("horizontal Minor default font size was not preserved: %v", style.Horizontal.Minor.FontSize)
	}
}
