package pipeline

import (
	"bufio"
	"fmt"
	"krillin-ai/internal/service"
	"os"
	"regexp"
	"strconv"
	"strings"
)

var pipelineSRTTimestampPattern = regexp.MustCompile(`^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$`)

type srtBlock struct {
	Index     string
	Timestamp string
	Lines     []string
}

func ExtractTargetSRT(input, output string, mode LineMode) error {
	blocks, err := readSRTBlocks(input)
	if err != nil {
		return err
	}
	var b strings.Builder
	for _, block := range blocks {
		text, err := targetLine(block.Lines, mode)
		if err != nil {
			return err
		}
		b.WriteString(block.Index)
		b.WriteString("\n")
		b.WriteString(block.Timestamp)
		b.WriteString("\n")
		b.WriteString(text)
		b.WriteString("\n\n")
	}
	return os.WriteFile(output, []byte(b.String()), 0644)
}

func readSRTBlocks(path string) ([]srtBlock, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var blocks []srtBlock
	var current []string
	scanner := bufio.NewScanner(f)
	flush := func() error {
		if len(current) == 0 {
			return nil
		}
		if len(current) < 3 {
			return fmt.Errorf("invalid srt block: %q", strings.Join(current, "\n"))
		}
		blocks = append(blocks, srtBlock{
			Index:     current[0],
			Timestamp: current[1],
			Lines:     append([]string(nil), current[2:]...),
		})
		current = nil
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			if err := flush(); err != nil {
				return nil, err
			}
			continue
		}
		current = append(current, line)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return blocks, nil
}

func targetLine(lines []string, mode LineMode) (string, error) {
	switch mode {
	case LineModeTargetOnly:
		return strings.Join(lines, " "), nil
	case LineModeBilingualTargetTop:
		if len(lines) < 2 {
			return "", fmt.Errorf("bilingual target top requires at least two subtitle lines")
		}
		return lines[0], nil
	case LineModeBilingualTargetBottom:
		if len(lines) < 2 {
			return "", fmt.Errorf("bilingual target bottom requires at least two subtitle lines")
		}
		return lines[len(lines)-1], nil
	default:
		return "", fmt.Errorf("unsupported line mode: %s", mode)
	}
}

func validateExistingSubtitleOutputs(outputs Outputs) error {
	candidates := []struct {
		path          string
		allowOverlaps bool
	}{
		{path: outputs.OriginSRT},
		{path: outputs.TargetSRT},
		{path: outputs.BilingualSRT},
		{path: outputs.ShortOriginSRT},
		{path: outputs.ShortOriginMixedSRT, allowOverlaps: true},
	}
	for _, candidate := range candidates {
		if candidate.path == "" {
			continue
		}
		if _, err := os.Stat(candidate.path); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return err
		}
		if err := service.NormalizeSRTFile(candidate.path, candidate.allowOverlaps); err != nil {
			return fmt.Errorf("%s: normalize timeline: %w", candidate.path, err)
		}
		if err := validateSRTTimelineFile(candidate.path, candidate.allowOverlaps); err != nil {
			return fmt.Errorf("%s: %w", candidate.path, err)
		}
	}
	return nil
}

func validateSRTTimelineFile(path string, allowOverlaps bool) error {
	blocks, err := readSRTBlocks(path)
	if err != nil {
		return err
	}
	if len(blocks) == 0 {
		return fmt.Errorf("invalid_srt: empty subtitle")
	}
	var previousEnd int64 = -1
	for index, block := range blocks {
		start, end, err := parsePipelineSRTTimeline(block.Timestamp)
		if err != nil {
			return fmt.Errorf("invalid_srt: cue %d: %w", index+1, err)
		}
		if end <= start || (!allowOverlaps && previousEnd >= 0 && start < previousEnd) {
			return fmt.Errorf("invalid_srt: timeline %d", index+1)
		}
		if end > previousEnd {
			previousEnd = end
		}
	}
	return nil
}

func parsePipelineSRTTimeline(value string) (int64, int64, error) {
	match := pipelineSRTTimestampPattern.FindStringSubmatch(value)
	if match == nil {
		return 0, 0, fmt.Errorf("invalid timestamp %q", value)
	}
	values := make([]int64, 8)
	for index := range values {
		parsed, err := strconv.ParseInt(match[index+1], 10, 64)
		if err != nil {
			return 0, 0, err
		}
		values[index] = parsed
	}
	if values[1] >= 60 || values[2] >= 60 || values[5] >= 60 || values[6] >= 60 {
		return 0, 0, fmt.Errorf("timestamp component out of range")
	}
	start := ((values[0]*60+values[1])*60+values[2])*1000 + values[3]
	end := ((values[4]*60+values[5])*60+values[6])*1000 + values[7]
	return start, end, nil
}
