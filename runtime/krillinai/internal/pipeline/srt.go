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

// Mixed vertical SRT writes each full target cue before its overlapping source cues.
func mixedSubtitleSourceCueIndexes(mixedPath, targetPath string) (map[int]bool, error) {
	blocks, err := readSRTBlocks(mixedPath)
	if err != nil {
		return nil, err
	}
	targets, err := readSRTBlocks(targetPath)
	if err != nil {
		return nil, err
	}
	timings := make(map[string]bool, len(targets))
	key := func(timestamp string) string {
		return strings.Join(pipelineSRTTimestampPattern.FindStringSubmatch(timestamp)[1:], ":")
	}
	for _, target := range targets {
		if !pipelineSRTTimestampPattern.MatchString(target.Timestamp) {
			return nil, fmt.Errorf("invalid target subtitle timestamp")
		}
		timings[key(target.Timestamp)] = true
	}
	matched := make(map[string]bool, len(targets))
	sourceIndexes := make(map[int]bool)
	for _, block := range blocks {
		if !pipelineSRTTimestampPattern.MatchString(block.Timestamp) {
			return nil, fmt.Errorf("invalid mixed subtitle timestamp")
		}
		index, err := strconv.Atoi(block.Index)
		if err != nil {
			return nil, err
		}
		// Imported bilingual cues already carry both roles in a single block.
		if len(block.Lines) > 1 {
			continue
		}
		timing := key(block.Timestamp)
		if timings[timing] && !matched[timing] {
			matched[timing] = true
		} else {
			sourceIndexes[index] = true
		}
	}
	return sourceIndexes, nil
}

// Pair legacy overlapping cues so preview and burn-in use the same bilingual layout.
func normalizeMixedRenderSRT(input, target, output string, mode LineMode, targetOnly bool) error {
	roles, err := mixedSubtitleSourceCueIndexes(input, target)
	if err != nil {
		return err
	}
	blocks, err := readSRTBlocks(input)
	if err != nil {
		return err
	}
	var b strings.Builder
	count := 0
	formatTime := func(ms int64) string {
		return fmt.Sprintf("%02d:%02d:%02d,%03d", ms/3600000, ms/60000%60, ms/1000%60, ms%1000)
	}
	write := func(start, end int64, lines []string) {
		if end <= start {
			return
		}
		count++
		fmt.Fprintf(&b, "%d\n%s --> %s\n%s\n\n", count, formatTime(start), formatTime(end), strings.Join(lines, "\n"))
	}
	for i := 0; i < len(blocks); {
		block := blocks[i]
		index, _ := strconv.Atoi(block.Index)
		if roles[index] {
			return fmt.Errorf("mixed subtitle cue %s has no matching translation timeline", block.Index)
		}
		start, end, err := parsePipelineSRTTimeline(block.Timestamp)
		if err != nil {
			return err
		}
		i++
		if len(block.Lines) > 1 {
			lines := block.Lines
			if targetOnly {
				text, err := targetLine(lines, mode)
				if err != nil {
					return err
				}
				lines = []string{text}
			}
			write(start, end, lines)
			continue
		}
		cursor := start
		for i < len(blocks) {
			source := blocks[i]
			sourceIndex, _ := strconv.Atoi(source.Index)
			if !roles[sourceIndex] {
				break
			}
			sourceStart, sourceEnd, err := parsePipelineSRTTimeline(source.Timestamp)
			if err != nil {
				return err
			}
			if sourceEnd <= start || sourceStart >= end {
				return fmt.Errorf("source cue %s does not overlap its translation", source.Index)
			}
			if !targetOnly {
				if sourceStart < cursor {
					sourceStart = cursor
				}
				if sourceEnd > end {
					sourceEnd = end
				}
				write(cursor, sourceStart, block.Lines)
				lines := []string{block.Lines[0], strings.Join(source.Lines, " ")}
				if mode == LineModeBilingualTargetBottom {
					lines[0], lines[1] = lines[1], lines[0]
				}
				write(sourceStart, sourceEnd, lines)
				if sourceEnd > cursor {
					cursor = sourceEnd
				}
			}
			i++
		}
		write(cursor, end, block.Lines)
	}
	if count == 0 {
		return fmt.Errorf("empty render subtitle")
	}
	return os.WriteFile(output, []byte(b.String()), 0644)
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
