package main

import (
	"krillin-ai/internal/cli"
	"krillin-ai/internal/pipeline"
	"testing"
)

func TestRequiresTranscriptionAtStart(t *testing.T) {
	tests := []struct {
		name string
		cmd  cli.Command
		want bool
	}{
		{
			name: "youtube platform captions can start without ASR",
			cmd: cli.Command{Name: "subtitle", Subtitle: pipeline.SubtitleRequest{
				Input: "https://www.youtube.com/watch?v=demo", CaptionSource: pipeline.CaptionSourceAny,
			}},
			want: false,
		},
		{
			name: "forced speech recognition requires ASR",
			cmd: cli.Command{Name: "subtitle", Subtitle: pipeline.SubtitleRequest{
				Input: "https://www.youtube.com/watch?v=demo", CaptionSource: pipeline.CaptionSourceWhisper,
			}},
			want: true,
		},
		{
			name: "local media requires ASR",
			cmd: cli.Command{Name: "subtitle", Subtitle: pipeline.SubtitleRequest{
				Input: "video.mp4", CaptionSource: pipeline.CaptionSourceAny,
			}},
			want: true,
		},
		{
			name: "render does not require ASR",
			cmd:  cli.Command{Name: "render-horizontal"},
			want: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := requiresTranscriptionAtStart(test.cmd); got != test.want {
				t.Fatalf("requiresTranscriptionAtStart() = %v, want %v", got, test.want)
			}
		})
	}
}
