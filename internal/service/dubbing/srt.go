package dubbing

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

func ParseSRTFile(path string) ([]Cue, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, nil
	}

	blocks := strings.Split(text, "\n\n")
	cues := make([]Cue, 0, len(blocks))
	for _, block := range blocks {
		lines := nonEmptyLines(block)
		if len(lines) < 2 {
			continue
		}

		index, err := strconv.Atoi(strings.TrimSpace(lines[0]))
		if err != nil {
			return nil, fmt.Errorf("invalid srt index %q: %w", lines[0], err)
		}

		parts := strings.Split(lines[1], " --> ")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid srt timestamp line %q", lines[1])
		}

		start, err := ParseTimestamp(parts[0])
		if err != nil {
			return nil, fmt.Errorf("cue %d start: %w", index, err)
		}

		end, err := ParseTimestamp(parts[1])
		if err != nil {
			return nil, fmt.Errorf("cue %d end: %w", index, err)
		}

		cues = append(cues, Cue{
			Index: index,
			Start: start,
			End:   end,
			Text:  strings.Join(lines[2:], " "),
		})
	}

	return cues, nil
}

func nonEmptyLines(block string) []string {
	raw := strings.Split(block, "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func ParseTimestamp(value string) (float64, error) {
	value = strings.TrimSpace(value)
	fields := strings.Split(value, ":")
	if len(fields) != 3 {
		return 0, fmt.Errorf("invalid timestamp %q", value)
	}

	hours, err := strconv.Atoi(fields[0])
	if err != nil {
		return 0, fmt.Errorf("invalid hour in %q: %w", value, err)
	}

	minutes, err := strconv.Atoi(fields[1])
	if err != nil {
		return 0, fmt.Errorf("invalid minute in %q: %w", value, err)
	}

	secParts := strings.Split(fields[2], ",")
	if len(secParts) != 2 {
		return 0, fmt.Errorf("invalid seconds in %q", value)
	}

	seconds, err := strconv.Atoi(secParts[0])
	if err != nil {
		return 0, fmt.Errorf("invalid second in %q: %w", value, err)
	}

	millis, err := strconv.Atoi(secParts[1])
	if err != nil {
		return 0, fmt.Errorf("invalid millis in %q: %w", value, err)
	}

	return float64(hours*3600+minutes*60+seconds) + float64(millis)/1000, nil
}

func FormatTimestamp(seconds float64) string {
	if seconds < 0 {
		seconds = 0
	}

	totalMillis := int(seconds*1000 + 0.5)
	hours := totalMillis / 3600000
	totalMillis %= 3600000
	minutes := totalMillis / 60000
	totalMillis %= 60000
	secs := totalMillis / 1000
	millis := totalMillis % 1000

	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, secs, millis)
}

func WriteSRTFile(path string, cues []Cue) error {
	var b strings.Builder
	for i, cue := range cues {
		index := cue.Index
		if index <= 0 {
			index = i + 1
		}

		b.WriteString(strconv.Itoa(index))
		b.WriteString("\n")
		b.WriteString(FormatTimestamp(cue.Start))
		b.WriteString(" --> ")
		b.WriteString(FormatTimestamp(cue.End))
		b.WriteString("\n")
		b.WriteString(strings.TrimSpace(cue.Text))
		b.WriteString("\n\n")
	}

	return os.WriteFile(path, []byte(b.String()), 0644)
}
