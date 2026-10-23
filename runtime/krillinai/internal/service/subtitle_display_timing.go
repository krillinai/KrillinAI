package service

import (
	"fmt"
	"krillin-ai/pkg/util"
	"math"
	"strings"
)

// Keep word-time cuts whenever they are usable. Reading pressure may move a
// display cut inside this parent, but never merge text, borrow the next parent's
// time, or claim that the adjusted cut is an exact word/semantic alignment.
func frozenDisplayTimelines(sources, targets []string, spans []subtitleTimingSpan, offset int) ([]string, error) {
	if len(sources) == 0 || len(sources) != len(targets) {
		return nil, fmt.Errorf("字幕显示分组缺少原译配对")
	}
	n := len(sources)
	starts, ends, loads := make([]int64, n), make([]int64, n), make([]float64, n)
	position, totalLoad := offset, 0.0
	for i, source := range sources {
		starts[i] = subtitlePositionTime(spans, position, false)
		position += subtitleRuneLength(source)
		ends[i] = subtitlePositionTime(spans, position, true)
		loads[i] = math.Max(1, float64(subtitleTargetLength(compactSubtitleText(targets[i]))))
		totalLoad += loads[i]
	}
	start, end := starts[0], ends[n-1]
	if start < 0 || end-start < int64(n) {
		return nil, fmt.Errorf("完整句时间不足以容纳%d条非空字幕，已保留译文检查点", n)
	}
	// Relative burden, rather than treating Latin names as fullwidth CJK. The
	// ceiling also adapts to parents whose original speech is already very fast.
	ceiling := math.Max(25, totalLoad*1000/float64(end-start))
	minimum, totalMinimum, risky := make([]int64, n), int64(0), false
	for i := range sources {
		floor := int64(200)
		if subtitleRuneLength(targets[i]) > 6 {
			floor = 650
		}
		minimum[i] = int64(math.Ceil(loads[i] * 1000 / ceiling))
		if minimum[i] < floor {
			minimum[i] = floor
		}
		totalMinimum += minimum[i]
		risky = risky || ends[i]-starts[i] < minimum[i] || i > 0 && starts[i] < ends[i-1]
	}
	if risky {
		// Impossible reading targets do not justify deleting words or exceeding
		// length. Scale only the display durations, keeping positive milliseconds.
		if totalMinimum > end-start {
			available := float64(end - start - int64(n))
			for i := range minimum {
				minimum[i] = 1 + int64(available*loads[i]/totalLoad)
			}
		}
		remaining := int64(0)
		for _, duration := range minimum {
			remaining += duration
		}
		cursor := start
		for i := 0; i < n-1; i++ {
			remaining -= minimum[i]
			// Preserve the source anchor within the feasible reading window.
			cut := ends[i]
			if cut > end-remaining {
				cut = end - remaining
			}
			if cut < cursor+minimum[i] {
				cut = cursor + minimum[i]
			}
			starts[i], ends[i] = cursor, cut
			cursor = cut
		}
		starts[n-1], ends[n-1] = cursor, end
	}
	result := make([]string, n)
	for i := range result {
		result[i] = formatSRTTimeline(starts[i], ends[i])
	}
	return result, nil
}

// Validate final blocks, not only an intermediate model response. Each language
// has its own per-cue limit; inserting line breaks does not evade that limit.
func validateFrozenDisplayBlocks(blocks []*util.SrtBlock, limit int) error {
	previousEnd := int64(-1)
	for i, block := range blocks {
		if block == nil {
			return fmt.Errorf("字幕%d为空", i+1)
		}
		for _, text := range []string{block.OriginLanguageSentence, block.TargetLanguageSentence} {
			if !hasSubtitleContent(text) || hasSubtitleLineBreak(text) || subtitleTargetLength(strings.TrimSpace(text)) > limit {
				return fmt.Errorf("字幕%d未通过每种语言每条不超过%d的完整性检查", i+1, limit)
			}
		}
		start, end, err := parseSRTTimeline(block.Timestamp)
		if err != nil || start < 0 || start < previousEnd || end <= start {
			return fmt.Errorf("字幕%d时间无效或重叠", i+1)
		}
		previousEnd = end
	}
	return nil
}
