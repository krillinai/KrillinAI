package dubbing

import (
	"strings"
	"testing"
)

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

func TestFitTimelineClampsAppliedSpeedToMaxButReportsRequiredSpeed(t *testing.T) {
	cfg := DefaultConfig()
	cfg.SpeedMax = 1.25
	cfg.SpeedAccept = 1.1
	plan := []PlanItem{
		{Index: 1, ActualDuration: 4, ChunkID: 1},
	}
	chunks := []Chunk{{ID: 1, Items: []int{0}, Start: 0, End: 2}}
	got, report, err := FitTimeline(plan, chunks, cfg)
	if err != nil {
		t.Fatalf("FitTimeline() error = %v", err)
	}
	if report.MaxSpeedFactor != 2 {
		t.Fatalf("MaxSpeedFactor = %v, want raw required speed 2", report.MaxSpeedFactor)
	}
	if got[0].SpeedFactor != cfg.SpeedMax {
		t.Fatalf("SpeedFactor = %v, want clamped max %v", got[0].SpeedFactor, cfg.SpeedMax)
	}
	if got[0].NewEnd <= chunks[0].End {
		t.Fatalf("NewEnd = %v, want overflow beyond chunk end %v", got[0].NewEnd, chunks[0].End)
	}
	if !warningsContain(report.Warnings, "exceeds max") || !warningsContain(report.Warnings, "overflows") {
		t.Fatalf("warnings = %+v, want max and overflow warnings", report.Warnings)
	}
}

func TestFitTimelineRejectsNonPositiveActualDuration(t *testing.T) {
	cfg := DefaultConfig()
	plan := []PlanItem{
		{Index: 7, ActualDuration: 1, ChunkID: 3},
		{Index: 8, ActualDuration: 0, ChunkID: 3},
	}
	chunks := []Chunk{{ID: 3, Items: []int{0, 1}, Start: 0, End: 1}}
	_, _, err := FitTimeline(plan, chunks, cfg)
	if err == nil {
		t.Fatal("FitTimeline() error = nil, want non-positive actual duration error")
	}
	msg := err.Error()
	if !strings.Contains(msg, "chunk 3") || !strings.Contains(msg, "item 1") || !strings.Contains(msg, "plan index 1") {
		t.Fatalf("error = %q, want chunk id and item/plan index", msg)
	}
}

func TestFitTimelineNormalizesZeroSpeedConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.SpeedMin = 0
	cfg.SpeedAccept = 0
	cfg.SpeedMax = 0
	plan := []PlanItem{
		{Index: 1, ActualDuration: 1.2, ChunkID: 1},
	}
	chunks := []Chunk{{ID: 1, Items: []int{0}, Start: 0, End: 1}}
	got, report, err := FitTimeline(plan, chunks, cfg)
	if err != nil {
		t.Fatalf("FitTimeline() error = %v", err)
	}
	defaults := DefaultConfig()
	if got[0].SpeedFactor != 1.2 {
		t.Fatalf("SpeedFactor = %v, want required speed 1.2", got[0].SpeedFactor)
	}
	if warningsContain(report.Warnings, "acceptable 0") || warningsContain(report.Warnings, "max 0") {
		t.Fatalf("warnings = %+v, want normalized default speed limits %+v", report.Warnings, defaults)
	}
}

func TestFitTimelineRejectsInvalidSpeedOrder(t *testing.T) {
	cfg := DefaultConfig()
	cfg.SpeedMin = 1.4
	cfg.SpeedMax = 1.3
	plan := []PlanItem{
		{Index: 1, ActualDuration: 1, ChunkID: 1},
	}
	chunks := []Chunk{{ID: 1, Items: []int{0}, Start: 0, End: 1}}
	_, _, err := FitTimeline(plan, chunks, cfg)
	if err == nil {
		t.Fatal("FitTimeline() error = nil, want invalid speed config error")
	}
	if !strings.Contains(err.Error(), "speed config") {
		t.Fatalf("error = %q, want speed config error", err.Error())
	}
}

func warningsContain(warnings []string, substr string) bool {
	for _, warning := range warnings {
		if strings.Contains(warning, substr) {
			return true
		}
	}
	return false
}
