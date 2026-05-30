package service

import (
	"testing"
)

func TestParseSrtTimestamp(t *testing.T) {
	s := &YouTubeSubtitleService{}

	tests := []struct {
		timestamp string
		wantStart float64
		wantEnd   float64
		wantErr   bool
	}{
		{
			timestamp: "00:00:00,080 --> 00:00:01,829",
			wantStart: 0.080,
			wantEnd:   1.829,
			wantErr:   false,
		},
		{
			timestamp: "00:00:01,839 --> 00:00:03,909",
			wantStart: 1.839,
			wantEnd:   3.909,
			wantErr:   false,
		},
		{
			timestamp: "00:00:03,919 --> 00:00:05,829",
			wantStart: 3.919,
			wantEnd:   5.829,
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.timestamp, func(t *testing.T) {
			gotStart, gotEnd, err := s.parseSrtTimestamp(tt.timestamp)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseSrtTimestamp() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if gotStart != tt.wantStart {
				t.Errorf("parseSrtTimestamp() gotStart = %v, want %v", gotStart, tt.wantStart)
			}
			if gotEnd != tt.wantEnd {
				t.Errorf("parseSrtTimestamp() gotEnd = %v, want %v", gotEnd, tt.wantEnd)
			}
		})
	}
}

func TestParseVttTime(t *testing.T) {
	s := &YouTubeSubtitleService{}

	tests := []struct {
		timeStr string
		want    float64
		wantErr bool
	}{
		{
			timeStr: "00:00:00.080",
			want:    0.080,
			wantErr: false,
		},
		{
			timeStr: "00:00:00.320",
			want:    0.320,
			wantErr: false,
		},
		{
			timeStr: "00:00:02.159",
			want:    2.159,
			wantErr: false,
		},
		{
			timeStr: "00:00:04.240",
			want:    4.240,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.timeStr, func(t *testing.T) {
			got, err := s.parseVttTime(tt.timeStr)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseVttTime() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("parseVttTime() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGroupWordsByCharLengthMergesShortTrailingWord(t *testing.T) {
	s := &YouTubeSubtitleService{}
	words := []VttWord{
		{Text: "Every", Start: "00:00:28.600", End: "00:00:28.780"},
		{Text: "hour", Start: "00:00:28.780", End: "00:00:28.960"},
		{Text: "you", Start: "00:00:28.960", End: "00:00:29.120"},
		{Text: "spend", Start: "00:00:29.120", End: "00:00:29.360"},
		{Text: "scrolling,", Start: "00:00:29.360", End: "00:00:30.190"},
	}

	groups := s.groupWordsByCharLength(words, 20)
	if len(groups) != 1 {
		t.Fatalf("group count = %d, want 1; groups = %#v", len(groups), groups)
	}
	if got := groups[0][len(groups[0])-1].Text; got != "scrolling," {
		t.Fatalf("last word = %q, want scrolling,", got)
	}
}

func TestTimeRangeMatching(t *testing.T) {
	// 测试时间范围匹配逻辑
	tests := []struct {
		name        string
		srtStart    float64
		vttStart    float64
		shouldMatch bool
		description string
	}{
		{
			name:        "Exact match",
			srtStart:    0.080,
			vttStart:    0.080,
			shouldMatch: true,
			description: "SRT 和 VTT 时间完全匹配",
		},
		{
			name:        "Within tolerance",
			srtStart:    1.839,
			vttStart:    1.839,
			shouldMatch: true,
			description: "时间差在容差范围内",
		},
		{
			name:        "Too early",
			srtStart:    3.919,
			vttStart:    0.080,
			shouldMatch: false,
			description: "VTT 时间太早，不应匹配",
		},
		{
			name:        "Too late",
			srtStart:    0.080,
			vttStart:    3.919,
			shouldMatch: false,
			description: "VTT 时间太晚，不应匹配",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			timeDiff := tt.vttStart - tt.srtStart
			matched := timeDiff >= -0.5 && timeDiff <= 1.0

			if matched != tt.shouldMatch {
				t.Errorf("%s: got matched=%v, want %v (timeDiff=%.3f)",
					tt.description, matched, tt.shouldMatch, timeDiff)
			}
		})
	}
}
