package service

import (
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeSrtBlocksRepairsInvalidDurationsAndOverlap(t *testing.T) {
	blocks := []*util.SrtBlock{
		{Timestamp: "00:00:01,000 --> 00:00:01,000"},
		{Timestamp: "00:00:00,500 --> 00:00:00,400"},
	}
	if err := normalizeSrtBlocks(blocks, false); err != nil {
		t.Fatal(err)
	}
	if blocks[0].Timestamp != "00:00:01,000 --> 00:00:01,300" {
		t.Fatalf("first timestamp = %q", blocks[0].Timestamp)
	}
	if blocks[1].Timestamp != "00:00:01,300 --> 00:00:01,600" {
		t.Fatalf("second timestamp = %q", blocks[1].Timestamp)
	}
}

func TestNormalizeSrtBlocksAllowsMixedSubtitleOverlap(t *testing.T) {
	blocks := []*util.SrtBlock{
		{Timestamp: "00:00:01,000 --> 00:00:02,000"},
		{Timestamp: "00:00:01,200 --> 00:00:01,500"},
	}
	if err := normalizeSrtBlocks(blocks, true); err != nil {
		t.Fatal(err)
	}
	if blocks[1].Timestamp != "00:00:01,200 --> 00:00:01,500" {
		t.Fatalf("overlapping timestamp was changed: %q", blocks[1].Timestamp)
	}
}

func TestNormalizeSRTFileRepairsMergedTimelineAndPreservesText(t *testing.T) {
	path := filepath.Join(t.TempDir(), "merged.srt")
	content := "1\n00:00:01,000 --> 00:00:02,000\nhello\n你好\n\n2\n00:00:01,500 --> 00:00:01,400\nworld\n世界\n\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := NormalizeSRTFile(path, false); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	result := string(data)
	if !strings.Contains(result, "00:00:02,000 --> 00:00:02,300") {
		t.Fatalf("timeline was not repaired: %q", result)
	}
	if !strings.Contains(result, "hello\n你好") || !strings.Contains(result, "world\n世界") {
		t.Fatalf("subtitle text changed: %q", result)
	}
}

type fixedTimestampMatcher struct{}

func (fixedTimestampMatcher) GetLanguageType() types.StandardLanguageCode {
	return types.StandardLanguageCode("test")
}

func (fixedTimestampMatcher) MatchSentenceTimestamp(string, []types.Word, float64) (float64, float64, error) {
	return 1, 2, nil
}

func TestTimestampGeneratorDoesNotMutateInputBlocks(t *testing.T) {
	generator := NewTimestampGenerator()
	generator.RegisterMatcher(types.StandardLanguageCode("test"), fixedTimestampMatcher{})
	input := []*util.SrtBlock{{OriginLanguageSentence: "hello"}}
	output, err := generator.GenerateTimestamps(input, []types.Word{{Text: "hello", Start: 1, End: 2}}, types.StandardLanguageCode("test"), 0)
	if err != nil {
		t.Fatal(err)
	}
	if input[0].Timestamp != "" {
		t.Fatalf("input timestamp mutated to %q", input[0].Timestamp)
	}
	if output[0] == input[0] || output[0].Timestamp != "00:00:01,000 --> 00:00:02,000" {
		t.Fatalf("unexpected output: %+v", output[0])
	}
}
