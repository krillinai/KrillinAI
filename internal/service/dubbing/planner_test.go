package dubbing

import (
	"krillin-ai/internal/types"
	"testing"
)

func TestPlannerMergesShortAdjacentCues(t *testing.T) {
	cfg := DefaultConfig()
	cues := []Cue{
		{Index: 1, Start: 0, End: 0.8, Text: "你好"},
		{Index: 2, Start: 1.0, End: 2.2, Text: "我们开始吧"},
		{Index: 3, Start: 5.0, End: 6.0, Text: "下一段"},
	}
	planner := NewPlanner(cfg, NewStatisticalEstimator(), nil)
	plan, chunks, err := planner.Plan(cues, types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatalf("Plan() error = %v", err)
	}
	if len(plan) != 3 || len(chunks) != 2 {
		t.Fatalf("plan=%+v chunks=%+v", plan, chunks)
	}
	if plan[0].ChunkID != plan[1].ChunkID {
		t.Fatalf("first short cue should merge with second: %+v", plan)
	}
	if plan[2].ChunkID == plan[1].ChunkID {
		t.Fatalf("large gap should start a new chunk: %+v", plan)
	}
}
