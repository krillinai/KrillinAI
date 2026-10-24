package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"math"
	"strings"
	"unicode/utf8"
)

func pairedAudioTiming(blocks []*util.SrtBlock, words []types.Word, language types.StandardLanguageCode, offset float64, displayGroups ...[]int) ([]*util.SrtBlock, []subtitleTimingSpan, error) {
	var groups []int
	if len(displayGroups) > 0 {
		groups = displayGroups[0]
		if len(groups) != len(blocks) {
			return nil, nil, fmt.Errorf("音频字幕显示分组数量不一致")
		}
	}
	var vttWords []VttWord
	var expected strings.Builder
	for _, block := range blocks {
		expected.WriteString(block.OriginLanguageSentence)
	}
	for _, word := range words {
		vttWords = append(vttWords, VttWord{Text: word.Text, Start: formatSRTTime(int64(math.Round((word.Start + offset) * 1000))), End: formatSRTTime(int64(math.Round((word.End + offset) * 1000)))})
	}
	spans, err := subtitleWordTimingSpans(vttWords, expected.String())
	if err != nil {
		// 部分转录器的全文与词列表标点不同，沿用既有匹配器生成 cue 时间。
		coarse := blocks
		if len(groups) > 0 {
			coarse = nil
			for i := 0; i < len(blocks); {
				count := max(1, groups[i])
				if i+count > len(blocks) {
					return nil, nil, fmt.Errorf("音频字幕显示分组越界")
				}
				var sources []string
				for _, block := range blocks[i : i+count] {
					sources = append(sources, block.OriginLanguageSentence)
				}
				coarse = append(coarse, &util.SrtBlock{Index: len(coarse) + 1, OriginLanguageSentence: joinPairedTargetSegments(sources, language)})
				i += count
			}
		}
		generated, err := NewTimestampGenerator().GenerateTimestamps(coarse, words, language, offset)
		if err != nil {
			return nil, nil, err
		}
		if err := normalizeSrtBlocks(generated, false); err != nil {
			return nil, nil, err
		}
		spans, _, err = subtitleBlockTimingSpans(generated)
		if err != nil || len(groups) == 0 {
			return generated, spans, err
		}
	}
	position := 0
	generated := make([]*util.SrtBlock, 0, len(blocks))
	for i := 0; i < len(blocks); {
		if len(groups) > 0 && groups[i] > 1 {
			count := groups[i]
			if i+count > len(blocks) {
				return nil, nil, fmt.Errorf("音频字幕显示分组越界")
			}
			var sources, targets []string
			for _, block := range blocks[i : i+count] {
				sources, targets = append(sources, block.OriginLanguageSentence), append(targets, block.TargetLanguageSentence)
			}
			timelines, err := frozenDisplayTimelines(sources, targets, spans, position)
			if err != nil {
				return nil, nil, err
			}
			for j, timestamp := range timelines {
				copy := *blocks[i+j]
				copy.Timestamp = timestamp
				generated = append(generated, &copy)
				position += subtitleRuneLength(sources[j])
			}
			i += count
			continue
		}
		block := blocks[i]
		copy := *block
		start := subtitlePositionTime(spans, position, false)
		position += utf8.RuneCountInString(compactSubtitleText(block.OriginLanguageSentence))
		end := subtitlePositionTime(spans, position, true)
		if end <= start {
			return nil, nil, fmt.Errorf("字幕%d分段后时间不足", block.Index)
		}
		copy.Timestamp = formatSRTTimeline(start, end)
		generated = append(generated, &copy)
		i++
	}
	return generated, spans, nil
}

func subtitleBlockTimingSpans(blocks []*util.SrtBlock) ([]subtitleTimingSpan, string, error) {
	var spans []subtitleTimingSpan
	var texts []string
	position := 0
	for _, block := range blocks {
		start, end, err := parseSRTTimeline(block.Timestamp)
		if err != nil || end <= start {
			return nil, "", fmt.Errorf("字幕%d时间无效", block.Index)
		}
		length := utf8.RuneCountInString(compactSubtitleText(block.OriginLanguageSentence))
		if length == 0 {
			return nil, "", fmt.Errorf("字幕%d缺少原文", block.Index)
		}
		spans = append(spans, subtitleTimingSpan{position, position + length, start, end})
		position += length
		texts = append(texts, block.OriginLanguageSentence)
	}
	return spans, strings.Join(texts, ""), nil
}

func splitShortSubtitleBlocks(blocks []*util.SrtBlock, spans []subtitleTimingSpan, maxChars, maxWords int) (map[int][]util.SrtBlock, error) {
	result := make(map[int][]util.SrtBlock)
	position := 0
	hardLimit := subtitleTargetLimit()
	if maxChars <= 0 || maxChars > hardLimit {
		maxChars = hardLimit
	}
	fitsLine := func(text string) bool {
		return subtitleTargetLength(text) <= hardLimit && (maxWords <= 0 || len(strings.Fields(text)) <= maxWords)
	}
	for _, block := range blocks {
		parts, err := splitSubtitleText(block.OriginLanguageSentence, func(text string) bool {
			return subtitleTargetLength(text) <= maxChars && fitsLine(text)
		})
		if err != nil {
			// 极小排版目标不能破坏字素簇或阻止产出完整字幕。
			parts = []string{block.OriginLanguageSentence}
		}
		// 保留短尾词回并，但不突破单行硬上限或音频短字幕词数限制。
		if len(parts) > 1 {
			last := parts[len(parts)-1]
			if len(strings.Fields(last)) == 1 && subtitleTargetLength(last) <= 12 {
				tail := strings.TrimSpace(block.OriginLanguageSentence)
				for _, part := range parts[:len(parts)-2] {
					tail = strings.TrimSpace(tail[len(part):])
				}
				if fitsLine(tail) {
					parts[len(parts)-2] = tail
					parts = parts[:len(parts)-1]
				}
			}
		}
		blockStart := position
		invalidTiming := false
		for _, part := range parts {
			start := subtitlePositionTime(spans, position, false)
			position += utf8.RuneCountInString(compactSubtitleText(part))
			end := subtitlePositionTime(spans, position, true)
			if end <= start {
				invalidTiming = true
			}
			result[block.Index] = append(result[block.Index], util.SrtBlock{Timestamp: formatSRTTimeline(start, end), OriginLanguageSentence: part})
		}
		if invalidTiming {
			start, end := subtitlePositionTime(spans, blockStart, false), subtitlePositionTime(spans, position, true)
			if end <= start {
				return nil, fmt.Errorf("短字幕%d没有可用的时间区间", block.Index)
			}
			result[block.Index] = []util.SrtBlock{{Timestamp: formatSRTTimeline(start, end), OriginLanguageSentence: block.OriginLanguageSentence}}
		}
	}
	return result, nil
}
