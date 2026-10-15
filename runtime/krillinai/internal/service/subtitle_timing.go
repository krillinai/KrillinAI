package service

import (
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"strings"
	"unicode/utf8"
)

func pairedAudioTiming(blocks []*util.SrtBlock, words []types.Word, language types.StandardLanguageCode, offset float64) ([]*util.SrtBlock, []subtitleTimingSpan, error) {
	var vttWords []VttWord
	var expected strings.Builder
	for _, block := range blocks {
		expected.WriteString(block.OriginLanguageSentence)
	}
	for _, word := range words {
		vttWords = append(vttWords, VttWord{Text: word.Text, Start: strings.ReplaceAll(util.FormatTime(float32(word.Start+offset)), ",", "."), End: strings.ReplaceAll(util.FormatTime(float32(word.End+offset)), ",", ".")})
	}
	spans, err := subtitleWordTimingSpans(vttWords, expected.String())
	if err != nil {
		// 部分转录器的全文与词列表标点不同，沿用既有匹配器生成 cue 时间。
		generated, err := NewTimestampGenerator().GenerateTimestamps(blocks, words, language, offset)
		if err != nil {
			return nil, nil, err
		}
		if err := normalizeSrtBlocks(generated, false); err != nil {
			return nil, nil, err
		}
		spans, _, err = subtitleBlockTimingSpans(generated)
		return generated, spans, err
	}
	position := 0
	generated := make([]*util.SrtBlock, 0, len(blocks))
	for _, block := range blocks {
		copy := *block
		start := subtitlePositionTime(spans, position, false)
		position += utf8.RuneCountInString(compactSubtitleText(block.OriginLanguageSentence))
		end := subtitlePositionTime(spans, position, true)
		if end <= start {
			return nil, nil, fmt.Errorf("字幕%d分段后时间不足", block.Index)
		}
		copy.Timestamp = formatSRTTimeline(start, end)
		generated = append(generated, &copy)
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
	for _, block := range blocks {
		parts, err := splitSubtitleText(block.OriginLanguageSentence, func(text string) bool {
			return (maxChars <= 0 || subtitleTargetLength(text) <= maxChars) && (maxWords <= 0 || len(strings.Fields(text)) <= maxWords)
		})
		if err != nil {
			return nil, err
		}
		for _, part := range parts {
			start := subtitlePositionTime(spans, position, false)
			position += utf8.RuneCountInString(compactSubtitleText(part))
			end := subtitlePositionTime(spans, position, true)
			if end <= start {
				return nil, fmt.Errorf("短字幕%d分段后时间不足", block.Index)
			}
			result[block.Index] = append(result[block.Index], util.SrtBlock{Timestamp: formatSRTTimeline(start, end), OriginLanguageSentence: part})
		}
	}
	return result, nil
}
