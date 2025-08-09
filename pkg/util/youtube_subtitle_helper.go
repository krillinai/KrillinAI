package util

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)


type Word struct {
	Text  string
	Start float64
	End   float64
	Num   int
}


func TimeToMilliseconds(timeStr string) int64 {
	timeStr = strings.Replace(timeStr, ",", ".", -1)
	timeParts := strings.Split(timeStr, ".")
	if len(timeParts) != 2 {
		return 0
	}
	hmsParts := strings.Split(timeParts[0], ":")
	if len(hmsParts) != 3 {
		return 0
	}

	h, _ := strconv.Atoi(hmsParts[0])
	m, _ := strconv.Atoi(hmsParts[1])
	s, _ := strconv.Atoi(hmsParts[2])
	ms, _ := strconv.Atoi(timeParts[1])

	return int64(h)*3600000 + int64(m)*60000 + int64(s)*1000 + int64(ms)
}

func MillisecondsToTime(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	h := ms / 3600000
	ms %= 3600000
	m := ms / 60000
	ms %= 60000
	s := ms / 1000
	ms %= 1000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", h, m, s, ms)
}

func IsTextMatch(textA, textB string) bool {
	if textA == "" || textB == "" {
		return false
	}
	//
	if strings.Contains(textA, textB) || strings.Contains(textB, textA) {
		return true
	}

	wordsA := strings.Fields(strings.ToLower(textA))
	wordsB := strings.Fields(strings.ToLower(textB))

	if len(wordsA) > 2 && len(wordsB) > 2 {
		match := true
		for i := 0; i < 3; i++ {
			if wordsA[i] != wordsB[i] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func ConvertVttToSrtGo(inputPath, outputPath string) error {
	contentBytes, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read VTT file: %w", err)
	}
	content := string(contentBytes)
	lines := strings.Split(content, "\n")

	// --- 1. Parse all VTT blocks ---
	var vttBlocks []*vttBlock
	timestampRegex := regexp.MustCompile(`^(\d{2}:\d{2}:\d{2})\.(\d{3})\s-->\s(\d{2}:\d{2}:\d{2})\.(\d{3})`)
	tagRegex := regexp.MustCompile(`<[^>]*>`)
	timingTagRegex := regexp.MustCompile(`<\d{2}:\d{2}:\d{2}\.\d{3}>`)

	for i := 0; i < len(lines); {
		line := strings.TrimSpace(lines[i])
		if line == "" || strings.HasPrefix(line, "WEBVTT") || strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
			i++
			continue
		}

		if matches := timestampRegex.FindStringSubmatch(line); len(matches) == 5 {
			startTime := fmt.Sprintf("%s,%s", matches[1], matches[2])
			endTime := fmt.Sprintf("%s,%s", matches[3], matches[4])

			i++
			var subtitleLines []string
			for i < len(lines) && strings.TrimSpace(lines[i]) != "" {
				subtitleLines = append(subtitleLines, strings.TrimSpace(lines[i]))
				i++
			}

			if len(subtitleLines) > 0 {
				block := &vttBlock{
					startTime: startTime,
					endTime:   endTime,
					lines:     subtitleLines,
					index:     len(vttBlocks),
				}
				var cleanLines []string
				for _, l := range block.lines {
					cleanLine := strings.TrimSpace(tagRegex.ReplaceAllString(l, ""))
					if cleanLine != "" {
						cleanLines = append(cleanLines, cleanLine)
					}
				}
				block.cleanLines = cleanLines
				block.cleanText = strings.Join(cleanLines, " ")
				block.hasTimingTags = timingTagRegex.MatchString(strings.Join(block.lines, " "))
				vttBlocks = append(vttBlocks, block)
			}
		} else {
			i++
		}
	}

	// --- 2. Identify candidate blocks ---
	var candidateBlocks []*vttBlock
	for _, block := range vttBlocks {
		if !block.hasTimingTags && len(block.cleanLines) == 1 {
			candidateBlocks = append(candidateBlocks, block)
		}
	}

	// --- 3. Build precise timeline ---
	subtitlesMap := make(map[string]*srtSubtitle)
	for _, sBlock := range candidateBlocks {
		text := sBlock.cleanText
		startTime := sBlock.startTime
		endTime := sBlock.endTime

		// Search backwards for start time
		for i := sBlock.index - 1; i >= 0; i-- {
			pBlock := vttBlocks[i]
			if IsTextMatch(text, pBlock.cleanText) {
				startTime = pBlock.startTime
				break
			}
		}

		// Search forwards for end time
		for i := sBlock.index + 1; i < len(vttBlocks); i++ {
			tBlock := vttBlocks[i]
			if !tBlock.hasTimingTags && len(tBlock.cleanLines) >= 1 {
				if tBlock.cleanLines[0] == text {
					endTime = tBlock.startTime
					break
				}
			}
		}

		duration := TimeToMilliseconds(endTime) - TimeToMilliseconds(startTime)
		if existing, ok := subtitlesMap[text]; !ok || duration > existing.duration {
			subtitlesMap[text] = &srtSubtitle{
				startTime: startTime,
				endTime:   endTime,
				text:      text,
				duration:  duration,
			}
		}
	}

	// --- 4. Clean and sort ---
	var finalSubtitles []*srtSubtitle
	for _, sub := range subtitlesMap {
		finalSubtitles = append(finalSubtitles, sub)
	}
	sort.Slice(finalSubtitles, func(i, j int) bool {
		return TimeToMilliseconds(finalSubtitles[i].startTime) < TimeToMilliseconds(finalSubtitles[j].startTime)
	})

	// Fix overlaps
	if len(finalSubtitles) > 1 {
		for i := 0; i < len(finalSubtitles)-1; i++ {
			currentEndMs := TimeToMilliseconds(finalSubtitles[i].endTime)
			nextStartMs := TimeToMilliseconds(finalSubtitles[i+1].startTime)

			if currentEndMs > nextStartMs {
				adjustedEndMs := nextStartMs - 50
				if adjustedEndMs > TimeToMilliseconds(finalSubtitles[i].startTime) {
					finalSubtitles[i].endTime = MillisecondsToTime(adjustedEndMs)
				}
			}
		}
	}

	// --- 5. Write SRT file ---
	var srtContent strings.Builder
	for i, subtitle := range finalSubtitles {
		srtContent.WriteString(fmt.Sprintf("%d\n", i+1))
		srtContent.WriteString(fmt.Sprintf("%s --> %s\n", subtitle.startTime, subtitle.endTime))
		srtContent.WriteString(subtitle.text + "\n\n")
	}

	return os.WriteFile(outputPath, []byte(srtContent.String()), 0644)
}

func ParseVttTime(timeStr string) (float64, error) {
	// VTT format: HH:MM:SS.ms or MM:SS.ms
	parts := strings.Split(timeStr, ":")
	var h, m, sec, ms int
	var err error

	if len(parts) == 3 { // HH:MM:SS.ms
		h, err = strconv.Atoi(parts[0])
		if err != nil {
			return 0, err
		}
		m, err = strconv.Atoi(parts[1])
		if err != nil {
			return 0, err
		}
		secParts := strings.Split(parts[2], ".")
		sec, err = strconv.Atoi(secParts[0])
		if err != nil {
			return 0, err
		}
		ms, err = strconv.Atoi(secParts[1])
		if err != nil {
			return 0, err
		}
	} else if len(parts) == 2 { // MM:SS.ms
		m, err = strconv.Atoi(parts[0])
		if err != nil {
			return 0, err
		}
		secParts := strings.Split(parts[1], ".")
		sec, err = strconv.Atoi(secParts[0])
		if err != nil {
			return 0, err
		}
		ms, err = strconv.Atoi(secParts[1])
		if err != nil {
			return 0, err
		}
	} else {
		return 0, fmt.Errorf("invalid time format: %s", timeStr)
	}

	return float64(h)*3600 + float64(m)*60 + float64(sec) + float64(ms)/1000, nil
}

func ParseVttToWords(vttPath string) ([]Word, error) {
	file, err := os.Open(vttPath)
	if err != nil {
		return nil, fmt.Errorf("ParseVttToWords open file error: %w", err)
	}
	defer file.Close()

	var words []Word
	scanner := bufio.NewScanner(file)
	var blockStartTime, blockEndTime float64
	wordNum := 0

	timestampLineRegex := regexp.MustCompile(`^((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s-->\s((?:\d{2}:)?\d{2}:\d{2}\.\d{3})`)
	wordTimeRegex := regexp.MustCompile(`<((?:\d{2}:)?\d{2}:\d{2}\.\d{3})>`)
	styleTagRegex := regexp.MustCompile(`</?c>`)
	hasWordTimestampRegex := regexp.MustCompile(`<(?:\d{2}:)?\d{2}:\d{2}\.\d{3}>`)

	for scanner.Scan() {
		line := scanner.Text()

		if matches := timestampLineRegex.FindStringSubmatch(line); len(matches) > 2 {
			start, err := ParseVttTime(matches[1])
			if err != nil {
				// Suppress logging in util package
				continue
			}
			end, err := ParseVttTime(matches[2])
			if err != nil {
				// Suppress logging in util package
				continue
			}
			blockStartTime = start
			blockEndTime = end
			continue
		}

		if strings.TrimSpace(line) == "" || strings.HasPrefix(line, "WEBVTT") || strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") {
			continue
		}

		if !hasWordTimestampRegex.MatchString(line) {
			continue
		}

		content := styleTagRegex.ReplaceAllString(line, "")
		lastTime := blockStartTime

		timeMatches := wordTimeRegex.FindAllStringSubmatch(content, -1)
		textParts := wordTimeRegex.Split(content, -1)

		for i, textPart := range textParts {
			cleanedText := strings.TrimSpace(textPart)
			if cleanedText == "" {
				continue
			}

			var endTime float64
			if i < len(timeMatches) {
				var err error
				endTime, err = ParseVttTime(timeMatches[i][1])
				if err != nil {
					// Suppress logging in util package
					endTime = lastTime // Fallback
				}
			} else {
				endTime = blockEndTime
			}

			words = append(words, Word{
				Text:  cleanedText,
				Start: lastTime,
				End:   endTime,
				Num:   wordNum,
			})
			wordNum++
			lastTime = endTime
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("ParseVttToWords scan error: %w", err)
	}

	return words, nil
}

type vttBlock struct {
	index         int
	startTime     string
	endTime       string
	lines         []string
	cleanLines    []string
	cleanText     string
	hasTimingTags bool
}

type srtSubtitle struct {
	startTime string
	endTime   string
	text      string
	duration  int64
}

func ParseSrtFile(srtFilePath string) ([]*SrtBlock, error) {
	file, err := os.Open(srtFilePath)
	if err != nil {
		return nil, fmt.Errorf("parseSrtFile open file error: %w", err)
	}
	defer file.Close()

	var srtBlocks []*SrtBlock
	scanner := bufio.NewScanner(file)
	var currentBlock []string

	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)

		if line == "" {
			// 空行表示一个字幕块结束
			if len(currentBlock) >= 3 {
				block, err := parseSrtBlock(currentBlock)
				if err != nil {
					// Suppress logging in util package
				} else {
					srtBlocks = append(srtBlocks, block)
				}
			}
			currentBlock = nil
		} else {
			currentBlock = append(currentBlock, line)
		}
	}

	// 处理文件末尾的最后一个块
	if len(currentBlock) >= 3 {
		block, err := parseSrtBlock(currentBlock)
		if err != nil {
			// Suppress logging in util package
		} else {
			srtBlocks = append(srtBlocks, block)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("parseSrtFile scan error: %w", err)
	}

	return srtBlocks, nil
}

func parseSrtBlock(blockLines []string) (*SrtBlock, error) {
	if len(blockLines) < 3 {
		return nil, fmt.Errorf("parseSrtBlock: invalid block format, need at least 3 lines")
	}

	// 第一行是序号
	index, err := strconv.Atoi(blockLines[0])
	if err != nil {
		return nil, fmt.Errorf("parseSrtBlock: invalid index: %w", err)
	}

	// 第二行是时间戳
	timestamp := blockLines[1]
	if !strings.Contains(timestamp, "-->") {
		return nil, fmt.Errorf("parseSrtBlock: invalid timestamp format")
	}

	// 处理文本内容
	var originText, targetText string

	if len(blockLines) == 3 {
		// 单语字幕，只有一行文本
		originText = strings.TrimSpace(blockLines[2])
		targetText = "" // 需要翻译
	} else if len(blockLines) >= 4 {
		// 双语字幕，有两行文本
		originText = strings.TrimSpace(blockLines[2])
		targetText = strings.TrimSpace(blockLines[3])
	}

	if originText == "" {
		return nil, fmt.Errorf("parseSrtBlock: no origin text content found")
	}

	return &SrtBlock{
		Index:                  index,
		Timestamp:              timestamp,
		OriginLanguageSentence: originText,
		TargetLanguageSentence: targetText,
	}, nil
}
