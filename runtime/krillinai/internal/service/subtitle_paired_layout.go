package service

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode"
)

const pairedLayoutVersion = 6

// 这些汉语补语标记后必须跟宾语，不能因模型给出通过就保留内部切口。
// 句末标点或明确的口语中断不在此规则中，其他语法仍由句法及语义审查处理。
func subtitleBoundaryLeavesComplement(left string) bool {
	left = strings.TrimSpace(left)
	for _, marker := range []string{"当作", "视为", "看作", "称为"} {
		if strings.HasSuffix(left, marker) {
			return true
		}
	}
	return false
}

// 排版只消费已经对齐的原译片段，不能分别按字符比例切两种语言。
// 长度超额是连续成本；消除一个坏边界可以值得保留一条稍长的字幕。
func pairedLayoutCost(source, target string, limit int) float64 {
	excess := func(text string) float64 {
		over := math.Max(0, float64(subtitleTargetLength(text)-limit)/float64(max(1, limit)))
		return 12 * over * over
	}
	return 1 + math.Max(excess(source), excess(target))
}

func subtitleEndsUtterance(text string) bool {
	text = strings.TrimRight(strings.TrimSpace(text), "\"'”’»）)]")
	return strings.HasSuffix(text, "...") || strings.HasSuffix(text, "…") || strings.ContainsAny(lastSubtitleRune(text), ".!?。！？؟।॥")
}

func lastSubtitleRune(text string) string {
	runes := []rune(text)
	if len(runes) == 0 {
		return ""
	}
	return string(runes[len(runes)-1])
}

// 只识别结构风险，不把所有短字幕判错。独立回答（含句末标点）保留。
// 不依赖英文词表，适用于有空格与无空格书写系统；语法判断仍交给模型。
func subtitleFragmentBoundary(left, right string, limit int) bool {
	if limit < 24 || subtitleEndsUtterance(left) {
		return false
	}
	a, b := subtitleTargetLength(left), subtitleTargetLength(right)
	tiny := min(12, max(4, limit/4))
	return min(a, b) <= tiny && a+b > tiny
}

func pairedBoundaryCost(left, right pairedTranslationSegment, limit int, nlpBoundary ...bool) float64 {
	if subtitleBoundaryLeavesComplement(left.Source) || subtitleBoundaryLeavesComplement(left.Target) {
		return 6
	}
	if subtitleBoundarySplitsSubject(left.Source, right.Source, limit) || subtitleBoundarySplitsSubject(left.Target, right.Target, limit) {
		return 6
	}
	if subtitleFragmentBoundary(left.Source, right.Source, limit) || subtitleFragmentBoundary(left.Target, right.Target, limit) {
		// NLP切口和译文从句标点共同支持的短意群不因长度被回并。
		// “都摆满了 / 部分完成的书”等无完整译文意群的边界不能仅凭NLP放行。
		// 一两个宽字符、极短词尾和上方明确的主谓风险仍需修复。
		if len(nlpBoundary) > 0 && nlpBoundary[0] &&
			(subtitleEndsUtterance(left.Target) || strings.ContainsAny(lastSubtitleRune(strings.TrimSpace(left.Target)), ",;:，；：、،؛")) &&
			min(subtitleTargetLength(left.Source), subtitleTargetLength(right.Source)) > 4 &&
			min(subtitleTargetLength(left.Target), subtitleTargetLength(right.Target)) > 4 {
			return 0
		}
		return 4
	}
	return 0
}

func pairedNLPBoundaryPositions(fullSource string, hints []string) map[int]bool {
	result := make(map[int]bool)
	if len(hints) < 2 || !subtitleSegmentsPreserveText(fullSource, hints) {
		return result
	}
	position := 0
	for _, hint := range hints[:len(hints)-1] {
		position += len(compactSubtitleText(hint))
		result[position] = true
	}
	return result
}

// 取回原始边界空白，合并专名、URL、组合文字时不猜测空格。
func subtitleExactChunks(full string, segments []string) []string {
	remaining := strings.TrimSpace(full)
	var chunks []string
	for _, segment := range segments {
		after := remaining[len(strings.TrimSpace(segment)):]
		next := strings.TrimLeftFunc(after, unicode.IsSpace)
		chunks = append(chunks, remaining[:len(remaining)-len(next)])
		remaining = next
	}
	return chunks
}

// 动态规划比较保留与合并的总成本，避免贪心合并把短尾留给下一段。
// 不跨独立短回答合并，也不创造未经语义对齐的新边界。
func optimizePairedLayout(item pairedTranslationOutputSentence, fullSource string, limit int, nlpHints ...[]string) (pairedTranslationOutputSentence, bool) {
	var sources, targets []string
	for _, pair := range item.Segments {
		if !hasSubtitleContent(pair.Source) || !hasSubtitleContent(pair.Target) || hasSubtitleLineBreak(pair.Source) || hasSubtitleLineBreak(pair.Target) {
			return item, false
		}
		sources = append(sources, pair.Source)
		targets = append(targets, pair.Target)
	}
	if len(sources) < 2 || !subtitleSegmentsPreserveText(fullSource, sources) || !subtitleSegmentsPreserveText(item.FullTarget, targets) ||
		!subtitleSegmentsHaveSafeBoundaries(sources) || !subtitleSegmentsHaveSafeBoundaries(targets) {
		return item, false
	}
	sc, tc := subtitleExactChunks(fullSource, sources), subtitleExactChunks(item.FullTarget, targets)
	n := len(sc)
	var hints []string
	if len(nlpHints) > 0 {
		hints = nlpHints[0]
	}
	nlpBoundaries := pairedNLPBoundaryPositions(fullSource, hints)
	positions := make([]int, n+1)
	for i, source := range sources {
		positions[i+1] = positions[i] + len(compactSubtitleText(source))
	}
	groups := make([][]pairedTranslationSegment, n)
	valid := make([][]bool, n)
	for start := range n {
		groups[start], valid[start] = make([]pairedTranslationSegment, n+1), make([]bool, n+1)
		var source, target strings.Builder
		for end := start + 1; end <= n; end++ {
			if end > start+1 {
				if subtitleEndsUtterance(sources[end-2]) || subtitleEndsUtterance(targets[end-2]) {
					break
				}
				// 仅修复有结构风险的切口，不因减少条数而吞掉普通意群边界。
				left := pairedTranslationSegment{strings.TrimSpace(source.String()), strings.TrimSpace(target.String())}
				right := pairedTranslationSegment{sources[end-1], targets[end-1]}
				if pairedBoundaryCost(left, right, limit, nlpBoundaries[positions[end-1]]) == 0 {
					break
				}
			}
			source.WriteString(sc[end-1])
			target.WriteString(tc[end-1])
			groups[start][end] = pairedTranslationSegment{strings.TrimSpace(source.String()), strings.TrimSpace(target.String())}
			valid[start][end] = true
		}
	}
	// 状态保留最后一组的起点，边界成本同时考虑左右合并后的实际文本。
	cost, previous := make([][]float64, n+1), make([][]int, n+1)
	for end := 1; end <= n; end++ {
		cost[end], previous[end] = make([]float64, end), make([]int, end)
		for start := 0; start < end; start++ {
			cost[end][start] = math.Inf(1)
			if !valid[start][end] {
				continue
			}
			pair := groups[start][end]
			base := pairedLayoutCost(pair.Source, pair.Target, limit)
			if start == 0 {
				cost[end][start] = base
				continue
			}
			for before := 0; before < start; before++ {
				value := cost[start][before] + base + pairedBoundaryCost(groups[before][start], pair, limit, nlpBoundaries[positions[start]])
				if value < cost[end][start] {
					cost[end][start], previous[end][start] = value, before
				}
			}
		}
	}
	best := 0
	for start := 1; start < n; start++ {
		if cost[n][start] < cost[n][best] {
			best = start
		}
	}
	var result []pairedTranslationSegment
	for end, start := n, best; end > 0; {
		result = append(result, groups[start][end])
		end, start = start, previous[end][start]
	}
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	changed := len(result) != len(item.Segments)
	item.Segments = result
	return item, changed
}

// 只有明显可改善的超长段才请求模型重排；不以 target+10% 拒绝内容。
func subtitleLayoutNeedsSplit(text string, limit int) bool {
	parts, err := splitSubtitleSourceHint(text, max(1, limit))
	if err != nil || len(parts) < 2 {
		return false
	}
	current := pairedLayoutCost(text, "", limit)
	alternative := float64(len(parts))
	for i := 0; i+1 < len(parts); i++ {
		if subtitleFragmentBoundary(parts[i], parts[i+1], limit) {
			alternative += 4
		}
	}
	return current > alternative+1
}

func pairedLayoutIssue(sentence pairedSentence, limit int) error {
	nlpBoundaries := pairedNLPBoundaryPositions(sentence.FullSource, sentence.NLPSourceHint)
	position := 0
	for i := range sentence.Source {
		position += len(compactSubtitleText(sentence.Source[i]))
		if subtitleLayoutNeedsSplit(sentence.Source[i], limit) || subtitleLayoutNeedsSplit(sentence.Target[i], limit) {
			return fmt.Errorf("句子%s第%d段明显过长：原文%d、译文%d显示单位。原文=%q；译文=%q。请在该段内部的自然从句或完整短语之间进一步切分并同步配对；NLP建议不是不可再分的单位。%d是软目标，允许保留稍长的完整短语，禁止产生孤立短尾", sentence.ID, i+1, subtitleTargetLength(sentence.Source[i]), subtitleTargetLength(sentence.Target[i]), sentence.Source[i], sentence.Target[i], limit)
		}
		if i+1 < len(sentence.Source) && pairedBoundaryCost(pairedTranslationSegment{Source: sentence.Source[i], Target: sentence.Target[i]}, pairedTranslationSegment{Source: sentence.Source[i+1], Target: sentence.Target[i+1]}, limit, nlpBoundaries[position]) >= 4 {
			return fmt.Errorf("句子%s第%d与%d段存在短残片或紧密语法边界，请局部移动边界并同步调整原译配对；保留完整译文，不要为了字数均衡拆开意群", sentence.ID, i+1, i+2)
		}
	}
	return nil
}

func encodePairedSentenceForLayout(sentence pairedSentence) (string, error) {
	item := pairedTranslationOutputSentence{ID: sentence.ID, FullTarget: sentence.FullTarget}
	for i := range sentence.Source {
		item.Segments = append(item.Segments, pairedTranslationSegment{Source: sentence.Source[i], Target: sentence.Target[i]})
	}
	data, err := json.Marshal(pairedTranslationOutput{Sentences: []pairedTranslationOutputSentence{item}})
	return string(data), err
}

// 只恢复分段边缘的标点。段内内容必须逐字匹配，不能修复文字遗漏、乱序或增译。
// 完整译文是唯一依据，不能采用各片段重新拼出的另一份译文。
func restorePairedTargetBoundaryPunctuation(item pairedTranslationOutputSentence) (pairedTranslationOutputSentence, bool) {
	if len(item.Segments) < 2 {
		return item, false
	}
	var original, cores []string
	for _, pair := range item.Segments {
		if !hasSubtitleContent(pair.Target) || hasSubtitleLineBreak(pair.Target) {
			return item, false
		}
		original = append(original, pair.Target)
		cores = append(cores, strings.TrimFunc(pair.Target, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsPunct(r) }))
	}
	if subtitleSegmentsPreserveText(item.FullTarget, original) {
		return item, false
	}
	remaining := strings.TrimSpace(item.FullTarget)
	var targets []string
	for _, core := range cores {
		// 开头引号等仍属于当前段；段尾标点归到上一段。
		prefix := len(remaining) - len(strings.TrimLeftFunc(remaining, func(r rune) bool { return unicode.IsPunct(r) }))
		if core == "" || !strings.HasPrefix(remaining[prefix:], core) {
			return item, false
		}
		end := prefix + len(core)
		end += len(remaining[end:]) - len(strings.TrimLeftFunc(remaining[end:], unicode.IsPunct))
		targets = append(targets, remaining[:end])
		remaining = strings.TrimLeftFunc(remaining[end:], unicode.IsSpace)
	}
	if remaining != "" || !subtitleSegmentsPreserveText(item.FullTarget, targets) || !subtitleSegmentsHaveSafeBoundaries(targets) {
		return item, false
	}
	item.Segments = append([]pairedTranslationSegment(nil), item.Segments...)
	for i := range targets {
		item.Segments[i].Target = targets[i]
	}
	return item, true
}
