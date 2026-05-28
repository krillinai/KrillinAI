package pipeline

import (
	"encoding/json"
	"testing"
)

func TestResponseJSONShape(t *testing.T) {
	resp := Response{
		OK:      true,
		Stage:   StageSubtitle,
		Workdir: "tasks/demo",
		TaskID:  "demo",
		Outputs: Outputs{
			OriginSRT:    "tasks/demo/origin_language_srt.srt",
			TargetSRT:    "tasks/demo/target_language_srt.srt",
			BilingualSRT: "tasks/demo/bilingual_srt.srt",
		},
		Warnings:   []string{"人工字幕未找到，使用自动字幕"},
		DurationMS: 123,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got["ok"] != true {
		t.Fatalf("ok = %v, want true", got["ok"])
	}
	if got["stage"] != "subtitle" {
		t.Fatalf("stage = %v, want subtitle", got["stage"])
	}
	outputs := got["outputs"].(map[string]any)
	if outputs["bilingual_srt"] != "tasks/demo/bilingual_srt.srt" {
		t.Fatalf("bilingual_srt = %v", outputs["bilingual_srt"])
	}
}

func TestExitCodeForErrorKind(t *testing.T) {
	cases := []struct {
		err  *Error
		want int
	}{
		{&Error{Kind: ErrorKindUsage}, 1},
		{&Error{Kind: ErrorKindRetryable}, 2},
		{&Error{Kind: ErrorKindDependency}, 3},
	}
	for _, tc := range cases {
		if got := ExitCodeForError(tc.err); got != tc.want {
			t.Fatalf("ExitCodeForError(%q) = %d, want %d", tc.err.Kind, got, tc.want)
		}
	}
}
