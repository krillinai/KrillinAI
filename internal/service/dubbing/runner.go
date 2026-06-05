package dubbing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
)

type Result struct {
	Plan   []PlanItem
	Chunks []Chunk
	Report Report
	DubSRT string
	Audio  string
	Video  string
}

type Runner struct {
	deps Dependencies
}

func NewRunner(deps Dependencies) *Runner {
	if deps.Config.MaxChunkSize <= 0 {
		deps.Config = DefaultConfig()
	}
	if deps.FFmpeg == nil {
		deps.FFmpeg = defaultFFmpegRunner
	}
	if deps.Duration == nil {
		deps.Duration = util.GetAudioDuration
	}
	if deps.OutputAudio == "" && deps.Workdir != "" {
		deps.OutputAudio = filepath.Join(deps.Workdir, types.TtsResultAudioFileName)
	}
	if deps.OutputVideo == "" && deps.Workdir != "" {
		deps.OutputVideo = filepath.Join(deps.Workdir, types.SubtitleTaskVideoWithTtsFileName)
	}
	return &Runner{deps: deps}
}

func (r *Runner) Run(ctx context.Context) (Result, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := r.validate(); err != nil {
		return Result{}, err
	}

	cues, err := ParseSRTFile(r.deps.InputSRT)
	if err != nil {
		return Result{}, err
	}
	if len(cues) == 0 {
		return Result{}, errors.New("input srt has no cues")
	}

	dubbingDir := filepath.Join(r.deps.Workdir, DubbingDirName)
	segmentsDir := filepath.Join(dubbingDir, "segments")
	if err := os.MkdirAll(segmentsDir, 0755); err != nil {
		return Result{}, err
	}

	cleanedCues := cleanCuesForSpeech(cues)
	if err := WriteSRTFile(filepath.Join(dubbingDir, DubbingInputFileName), cleanedCues); err != nil {
		return Result{}, err
	}

	planner := NewPlanner(r.deps.Config, NewStatisticalEstimator(), NewLLMOptimizer(r.deps.Chat))
	plan, chunks, err := planner.Plan(cues, r.deps.Language)
	if err != nil {
		return Result{}, err
	}

	plan, err = GenerateRawSegments(ctx, r.deps.TTS, plan, r.deps.Voice, segmentsDir, r.deps.FFmpeg, r.deps.Duration)
	if err != nil {
		return Result{}, err
	}

	fitted, report, err := FitTimeline(plan, chunks, r.deps.Config)
	if err != nil {
		return Result{}, err
	}

	dubSRT := filepath.Join(dubbingDir, DubSubtitleFileName)
	if err := WriteSRTFile(dubSRT, BuildDubCues(fitted)); err != nil {
		return Result{}, err
	}
	if err := writeJSON(filepath.Join(dubbingDir, DubbingPlanFileName), fitted); err != nil {
		return Result{}, err
	}
	if err := writeJSON(filepath.Join(dubbingDir, DubbingReportName), report); err != nil {
		return Result{}, err
	}

	if err := ensureParentDir(r.deps.OutputAudio); err != nil {
		return Result{}, err
	}
	if err := AssembleAudio(fitted, segmentsDir, r.deps.OutputAudio, r.deps.FFmpeg); err != nil {
		return Result{}, err
	}
	if err := ensureNonEmptyFile(r.deps.OutputAudio, "output audio"); err != nil {
		return Result{}, err
	}

	if err := ensureParentDir(r.deps.OutputVideo); err != nil {
		return Result{}, err
	}
	if err := r.deps.FFmpeg(buildMuxArgs(r.deps.InputVideo, r.deps.OutputAudio, r.deps.OutputVideo)); err != nil {
		return Result{}, err
	}
	if err := ensureNonEmptyFile(r.deps.OutputVideo, "output video"); err != nil {
		return Result{}, err
	}

	return Result{
		Plan:   fitted,
		Chunks: chunks,
		Report: report,
		DubSRT: dubSRT,
		Audio:  r.deps.OutputAudio,
		Video:  r.deps.OutputVideo,
	}, nil
}

func (r *Runner) validate() error {
	if r.deps.Workdir == "" {
		return errors.New("workdir is required")
	}
	if r.deps.InputSRT == "" {
		return errors.New("input srt is required")
	}
	if r.deps.TTS == nil {
		return errors.New("tts is required")
	}
	if r.deps.InputVideo == "" {
		return errors.New("input video is required")
	}
	if err := ensureNonEmptyFile(r.deps.InputVideo, "input video"); err != nil {
		return err
	}
	return nil
}

func cleanCuesForSpeech(cues []Cue) []Cue {
	cleaned := make([]Cue, len(cues))
	copy(cleaned, cues)
	for i := range cleaned {
		cleaned[i].Text = CleanTextForSpeech(cleaned[i].Text)
	}
	return cleaned
}

func ensureParentDir(path string) error {
	dir := filepath.Dir(path)
	if dir == "" || dir == "." {
		return nil
	}
	return os.MkdirAll(dir, 0755)
}

func ensureNonEmptyFile(path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("%s %s: %w", label, path, err)
	}
	if info.IsDir() {
		return fmt.Errorf("%s %s is a directory", label, path)
	}
	if info.Size() == 0 {
		return fmt.Errorf("%s %s is empty", label, path)
	}
	return nil
}

func writeJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0644)
}
