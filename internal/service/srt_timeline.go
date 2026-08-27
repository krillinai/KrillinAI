package service

import (
	"bufio"
	"fmt"
	"krillin-ai/pkg/util"
	"os"
	"regexp"
	"strconv"
	"strings"
)

const minimumSRTDurationMillis int64 = 300

var srtTimelinePattern = regexp.MustCompile(`^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})$`)

func normalizeSrtBlocks(blocks []*util.SrtBlock, allowOverlaps bool) error {
	var previousEnd int64 = -1
	for index, block := range blocks {
		if block == nil {
			return fmt.Errorf("cue %d is nil", index+1)
		}
		start, end, err := parseSRTTimeline(block.Timestamp)
		if err != nil {
			return fmt.Errorf("cue %d: %w", index+1, err)
		}
		if !allowOverlaps && previousEnd >= 0 && start < previousEnd {
			start = previousEnd
		}
		if end <= start {
			end = start + minimumSRTDurationMillis
		}
		block.Timestamp = formatSRTTimeline(start, end)
		if end > previousEnd {
			previousEnd = end
		}
	}
	return nil
}

func NormalizeSRTFile(path string, allowOverlaps bool) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = file.Close() }()

	var blocks [][]string
	var current []string
	scanner := bufio.NewScanner(file)
	flush := func() error {
		if len(current) == 0 {
			return nil
		}
		if len(current) < 3 {
			return fmt.Errorf("invalid SRT block %d", len(blocks)+1)
		}
		blocks = append(blocks, append([]string(nil), current...))
		current = nil
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			if err := flush(); err != nil {
				return err
			}
			continue
		}
		current = append(current, line)
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if err := flush(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if len(blocks) == 0 {
		return fmt.Errorf("invalid SRT: empty subtitle")
	}

	timeline := make([]*util.SrtBlock, len(blocks))
	for index, block := range blocks {
		timeline[index] = &util.SrtBlock{Timestamp: strings.TrimSpace(block[1])}
	}
	if err := normalizeSrtBlocks(timeline, allowOverlaps); err != nil {
		return err
	}
	var output strings.Builder
	for index, block := range blocks {
		block[1] = timeline[index].Timestamp
		output.WriteString(strings.Join(block, "\n"))
		output.WriteString("\n\n")
	}
	return os.WriteFile(path, []byte(output.String()), 0644)
}

func parseSRTTimeline(value string) (int64, int64, error) {
	match := srtTimelinePattern.FindStringSubmatch(value)
	if match == nil {
		return 0, 0, fmt.Errorf("invalid SRT timestamp %q", value)
	}
	values := make([]int64, 8)
	for index := range values {
		parsed, err := strconv.ParseInt(match[index+1], 10, 64)
		if err != nil {
			return 0, 0, fmt.Errorf("invalid SRT timestamp %q: %w", value, err)
		}
		values[index] = parsed
	}
	if values[1] >= 60 || values[2] >= 60 || values[5] >= 60 || values[6] >= 60 {
		return 0, 0, fmt.Errorf("invalid SRT timestamp range %q", value)
	}
	start := ((values[0]*60+values[1])*60+values[2])*1000 + values[3]
	end := ((values[4]*60+values[5])*60+values[6])*1000 + values[7]
	return start, end, nil
}

func formatSRTTimeline(start, end int64) string {
	return fmt.Sprintf("%s --> %s", formatSRTTime(start), formatSRTTime(end))
}

func formatSRTTime(value int64) string {
	hours := value / 3_600_000
	value %= 3_600_000
	minutes := value / 60_000
	value %= 60_000
	seconds := value / 1_000
	millis := value % 1_000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, seconds, millis)
}
