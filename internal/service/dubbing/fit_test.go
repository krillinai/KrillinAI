package dubbing

import "testing"

func TestFitTimelineProducesMonotonicTimesAndChunkSpeed(t *testing.T) {
	cfg := DefaultConfig()
	plan := []PlanItem{
		{Index: 1, OriginalStart: 0, OriginalEnd: 1, SpokenText: "一", ActualDuration: 0.8, ChunkID: 1},
		{Index: 2, OriginalStart: 1.1, OriginalEnd: 2, SpokenText: "二", ActualDuration: 0.8, ChunkID: 1},
	}
	chunks := []Chunk{{ID: 1, Items: []int{0, 1}, Start: 0, End: 2.5}}
	got, report, err := FitTimeline(plan, chunks, cfg)
	if err != nil {
		t.Fatalf("FitTimeline() error = %v", err)
	}
	if got[0].NewStart != 0 || got[1].NewStart < got[0].NewEnd {
		t.Fatalf("timeline overlaps: %+v", got)
	}
	if report.MaxSpeedFactor <= 0 {
		t.Fatalf("MaxSpeedFactor not set: %+v", report)
	}
}
