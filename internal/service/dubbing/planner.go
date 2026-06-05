package dubbing

import (
	"context"

	"krillin-ai/internal/types"
)

type Planner struct {
	cfg       Config
	estimator DurationEstimator
	optimizer TextOptimizer
}

func NewPlanner(cfg Config, estimator DurationEstimator, optimizer TextOptimizer) *Planner {
	if cfg.MaxChunkSize <= 0 {
		cfg = DefaultConfig()
	}
	if estimator == nil {
		estimator = NewStatisticalEstimator()
	}
	return &Planner{
		cfg:       cfg,
		estimator: estimator,
		optimizer: optimizer,
	}
}

func (p *Planner) Plan(cues []Cue, language types.StandardLanguageCode) ([]PlanItem, []Chunk, error) {
	if len(cues) == 0 {
		return nil, nil, nil
	}

	plan := make([]PlanItem, len(cues))
	for i, cue := range cues {
		clean := CleanTextForSpeech(cue.Text)
		estimate, confidence, err := p.estimator.Estimate(clean, language)
		if err != nil {
			return nil, nil, err
		}

		spoken := clean
		rewriteAttempts := 0
		available := cue.Duration() + p.cfg.GapTolerance
		if p.cfg.EnableTextRewrite && estimate > available && p.optimizer != nil {
			optimized, err := p.optimizer.Optimize(context.Background(), clean, available, "estimated_too_long")
			if err == nil && optimized != "" {
				spoken = optimized
				rewriteAttempts = 1
			}
		}

		plan[i] = PlanItem{
			Index:              cue.Index,
			OriginalStart:      cue.Start,
			OriginalEnd:        cue.End,
			OriginalText:       cue.Text,
			CleanText:          clean,
			SpokenText:         spoken,
			EstimatedDuration:  estimate,
			EstimateConfidence: confidence,
			RewriteAttempts:    rewriteAttempts,
		}
	}

	chunks := p.makeChunks(cues, plan)
	for _, chunk := range chunks {
		for _, item := range chunk.Items {
			plan[item].ChunkID = chunk.ID
		}
	}

	return plan, chunks, nil
}

func (p *Planner) makeChunks(cues []Cue, plan []PlanItem) []Chunk {
	if len(cues) == 0 || len(plan) == 0 {
		return nil
	}

	chunks := make([]Chunk, 0, len(cues))
	current := Chunk{ID: 1, Start: cues[0].Start}

	for i, cue := range cues {
		if len(current.Items) == 0 {
			current.Start = cue.Start
			current.End = cue.End
			current.Items = append(current.Items, i)
			continue
		}

		prev := cues[i-1]
		gap := cue.Start - prev.End
		mustSplit := len(current.Items) >= p.cfg.MaxChunkSize || gap > p.cfg.GapTolerance
		if mustSplit {
			chunks = append(chunks, current)
			current = Chunk{ID: len(chunks) + 1, Start: cue.Start, End: cue.End, Items: []int{i}}
			continue
		}

		current.Items = append(current.Items, i)
		current.End = cue.End
	}

	chunks = append(chunks, current)
	return chunks
}
