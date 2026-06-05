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

func TestPlannerDoesNotMergeLongAdjacentCuesOnlyBecauseGapIsSmall(t *testing.T) {
	cfg := DefaultConfig()
	cues := []Cue{
		{Index: 1, Start: 0, End: 3.0, Text: "这是第一句已经足够长的字幕"},
		{Index: 2, Start: 3.2, End: 6.2, Text: "这是第二句同样足够长的字幕"},
	}
	planner := NewPlanner(cfg, NewStatisticalEstimator(), nil)
	plan, chunks, err := planner.Plan(cues, types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatalf("Plan() error = %v", err)
	}
	if len(plan) != 2 || len(chunks) != 2 {
		t.Fatalf("long adjacent cues should not merge only because gap is small: plan=%+v chunks=%+v", plan, chunks)
	}
	if plan[0].ChunkID == plan[1].ChunkID {
		t.Fatalf("long adjacent cues share chunk: %+v", plan)
	}
}

func TestPlannerRespectsMaxChunkSizeWhenMergingShortCues(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MaxChunkSize = 2
	cues := []Cue{
		{Index: 1, Start: 0, End: 0.5, Text: "一"},
		{Index: 2, Start: 0.6, End: 1.1, Text: "二"},
		{Index: 3, Start: 1.2, End: 1.7, Text: "三"},
	}
	planner := NewPlanner(cfg, NewStatisticalEstimator(), nil)
	plan, chunks, err := planner.Plan(cues, types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatalf("Plan() error = %v", err)
	}
	if len(plan) != 3 || len(chunks) != 2 {
		t.Fatalf("MaxChunkSize should split short cue merges: plan=%+v chunks=%+v", plan, chunks)
	}
	if len(chunks[0].Items) != 2 || len(chunks[1].Items) != 1 {
		t.Fatalf("chunk sizes = %+v, want [2,1]", chunks)
	}
}
