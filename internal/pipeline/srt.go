package pipeline

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

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
