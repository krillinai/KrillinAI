package dubbing

import (
	"context"
	"krillin-ai/internal/types"
)

const (
	DubbingDirName       = "dubbing"
	DubbingInputFileName = "dubbing_input.srt"
	DubbingPlanFileName  = "dubbing_plan.json"
	DubbingReportName    = "dubbing_report.json"
	DubSubtitleFileName  = "dub.srt"
)

type Config struct {
	MinSubtitleDuration float64
	MaxChunkSize        int
	GapTolerance        float64
	SpeedMin            float64
	SpeedAccept         float64
	SpeedMax            float64
	EnableTextRewrite   bool
	RewriteMaxAttempts  int
	Estimator           string
}

func DefaultConfig() Config {
	return Config{
		MinSubtitleDuration: 2.5,
		MaxChunkSize:        5,
		GapTolerance:        1.5,
		SpeedMin:            0.95,
		SpeedAccept:         1.15,
		SpeedMax:            1.30,
		EnableTextRewrite:   true,
		RewriteMaxAttempts:  2,
		Estimator:           "statistical",
	}
}

type Cue struct {
	Index int
	Start float64
	End   float64
	Text  string
}

func (c Cue) Duration() float64 {
	return c.End - c.Start
}

type PlanItem struct {
	Index              int     `json:"index"`
	OriginalStart      float64 `json:"original_start"`
	OriginalEnd        float64 `json:"original_end"`
	NewStart           float64 `json:"new_start"`
	NewEnd             float64 `json:"new_end"`
	OriginalText       string  `json:"original_text"`
	CleanText          string  `json:"clean_text"`
	SpokenText         string  `json:"spoken_text"`
	EstimatedDuration  float64 `json:"estimated_duration"`
	EstimateConfidence float64 `json:"estimate_confidence"`
	ActualDuration     float64 `json:"actual_duration"`
	SpeedFactor        float64 `json:"speed_factor"`
	ChunkID            int     `json:"chunk_id"`
	RewriteAttempts    int     `json:"rewrite_attempts"`
	Warning            string  `json:"warning,omitempty"`
}

type Chunk struct {
	ID    int
	Items []int
	Start float64
	End   float64
}

type Report struct {
	Warnings       []string `json:"warnings"`
	FailedIndexes  []int    `json:"failed_indexes"`
	MaxSpeedFactor float64  `json:"max_speed_factor"`
	RewriteCount   int      `json:"rewrite_count"`
}

type CommandRunner func(args []string) error
type DurationProbe func(path string) (float64, error)

type Dependencies struct {
	TTS         types.Ttser
	Chat        types.ChatCompleter
	Language    types.StandardLanguageCode
	Voice       string
	Workdir     string
	InputSRT    string
	InputVideo  string
	OutputAudio string
	OutputVideo string
	Config      Config
	FFmpeg      CommandRunner
	Duration    DurationProbe
}

type TextOptimizer interface {
	Optimize(ctx context.Context, text string, availableSeconds float64, reason string) (string, error)
}
