package pipeline

import "testing"

func TestPlanOutputsMapsToStages(t *testing.T) {
	got, err := PlanOutputs("subtitle,tts,horizontal-bilingual,horizontal-dubbed,vertical-bilingual,vertical-dubbed")
	if err != nil {
		t.Fatalf("PlanOutputs() error = %v", err)
	}
	want := []Stage{
		StageSubtitle,
		StageTTS,
		StageRenderHorizontal,
		StageRenderHorizontal,
		StageRenderVertical,
		StageRenderVertical,
	}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("stage[%d] = %s, want %s", i, got[i], want[i])
		}
	}
}

func TestPlanOutputsRejectsUnsupportedOutput(t *testing.T) {
	_, err := PlanOutputs("subtitle,unknown")
	if err == nil {
		t.Fatalf("PlanOutputs() error = nil, want error")
	}
}
