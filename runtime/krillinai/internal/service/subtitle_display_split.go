package service

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"math"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/clipperhouse/uax29/v2/graphemes"
	"github.com/clipperhouse/uax29/v2/words"
)

type subtitleDisplayBoundary struct {
	Offset  int     `json:"offset"`
	Penalty float64 `json:"penalty"`
}

// Optional local NLP ranks cuts. It cannot relax the display limit, change text,
// or make translation depend on a language model being installed.
func (t *Translator) displayBoundaryHints(ctx context.Context, texts []string, language types.StandardLanguageCode) ([][]subtitleDisplayBoundary, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if t.nlpRuntime == nil || len(texts) == 0 {
		return nil, nil
	}
	data, _ := json.Marshal(map[string]any{"language": types.NormalizeLanguage(string(language)), "display_texts": texts})
	output, err := t.nlpRuntime.exchange(ctx, data)
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	var result struct {
		Boundaries [][]subtitleDisplayBoundary `json:"boundaries"`
	}
	if err != nil || json.Unmarshal(output, &result) != nil || len(result.Boundaries) != len(texts) {
		return nil, nil
	}
	return result.Boundaries, nil
}

type subtitleDisplayText struct {
	text       string
	ends       []int
	widths     []int
	content    []int
	spaces     []bool
	penalties  []float64
	protected  []bool
	totalWidth int
}

func newSubtitleDisplayText(text string, language types.StandardLanguageCode, limit int, hints []subtitleDisplayBoundary, preferred ...[]string) subtitleDisplayText {
	d := subtitleDisplayText{text: text, ends: []int{0}, widths: []int{0}, content: []int{0}, spaces: []bool{false}}
	iter := graphemes.FromString(text)
	for iter.Next() {
		cluster := iter.Value()
		d.ends = append(d.ends, iter.End())
		d.widths = append(d.widths, d.widths[len(d.widths)-1]+subtitleTargetLength(cluster))
		count := 0
		if hasSubtitleContent(cluster) {
			count = 1
		}
		d.content = append(d.content, d.content[len(d.content)-1]+count)
		d.spaces = append(d.spaces, strings.TrimSpace(cluster) == "")
	}
	d.totalWidth = subtitleTargetLength(strings.TrimSpace(text))
	wordBounds := map[int]bool{0: true, len(text): true}
	spans := translationProtectedSpans(text, language)
	wordIter := words.FromString(text)
	for wordIter.Next() {
		wordBounds[wordIter.Start()], wordBounds[wordIter.End()] = true, true
		if subtitleTargetLength(wordIter.Value()) <= limit {
			spans = append(spans, translationTextSpan{wordIter.Start(), wordIter.End()})
		}
	}
	nlp := make(map[int]float64)
	nlpOffsets := []int{0, len(text)}
	for _, hint := range hints {
		if hint.Offset > 0 && hint.Offset < len(text) && hint.Penalty >= 0 {
			nlp[hint.Offset] = hint.Penalty
			nlpOffsets = append(nlpOffsets, hint.Offset)
		}
	}
	if len(nlp) > 0 {
		sort.Ints(nlpOffsets)
		for i := 1; i < len(nlpOffsets); i++ {
			// NLP token interiors (e.g. Japanese から / 日間) are not
			// interchangeable with a phrase cut between complete tokens.
			spans = append(spans, translationTextSpan{nlpOffsets[i-1], nlpOffsets[i]})
		}
	}
	preferredCuts := make(map[int]bool)
	for _, parts := range preferred {
		if !subtitleSegmentsPreserveText(text, parts) {
			continue
		}
		position := 0
		for _, part := range subtitleExactChunks(text, parts) {
			position += len(part)
			preferredCuts[position] = true
			preferredCuts[len(strings.TrimRightFunc(text[:position], unicode.IsSpace))] = true
		}
	}
	for _, cut := range d.ends {
		penalty := 100.0
		if len(nlp) > 0 {
			penalty = 500
		}
		if wordBounds[cut] {
			penalty = 40
		}
		// A token start after whitespace is also a good cut immediately before
		// that whitespace; both represent the same unchanged display boundary.
		right := cut + len(text[cut:]) - len(strings.TrimLeftFunc(text[cut:], unicode.IsSpace))
		if value, ok := nlp[right]; ok {
			penalty = value
		}
		left := strings.TrimSpace(text[:cut])
		last, _ := utf8.DecodeLastRuneInString(left)
		if strings.ContainsRune(".!?。！？,，;；:：、", last) {
			penalty = 0
		}
		if preferredCuts[cut] {
			penalty -= 15
		}
		first, _ := utf8.DecodeRuneInString(strings.TrimSpace(text[cut:]))
		if strings.ContainsRune(",，。.!?！？;；:：、)]}）】」』", first) {
			penalty += 200
		}
		protected := false
		for _, span := range spans {
			if cut > span.start && cut < span.end && subtitleTargetLength(text[span.start:span.end]) <= limit {
				protected = true
				break
			}
		}
		d.penalties = append(d.penalties, penalty)
		d.protected = append(d.protected, protected)
	}
	return d
}

// Select all boundaries together, instead of greedily filling the first cue and
// leaving a tiny tail. Ordinary words/protected spans are kept whole whenever a
// feasible paired layout exists. The final fallback may split them at graphemes.
func (d subtitleDisplayText) split(count, limit int, relax bool) ([]string, bool) {
	n := len(d.ends)
	if count < 1 || count > d.content[n-1] {
		return nil, false
	}
	cost := make([][]float64, count+1)
	previous := make([][]int, count+1)
	for k := range cost {
		cost[k], previous[k] = make([]float64, n), make([]int, n)
		for j := range cost[k] {
			cost[k][j], previous[k][j] = math.Inf(1), -1
		}
	}
	cost[0][0] = 0
	average := float64(d.totalWidth) / float64(count)
	for k := 1; k <= count; k++ {
		for end := 1; end < n; end++ {
			if end < n-1 && d.protected[end] && !relax {
				continue
			}
			right := end
			for right > 0 && d.spaces[right] {
				right--
			}
			for start := end - 1; start >= 0; start-- {
				left := start
				for left < right && d.spaces[left+1] {
					left++
				}
				width := d.widths[right] - d.widths[left]
				if width > limit {
					break
				}
				if d.content[end] == d.content[start] || math.IsInf(cost[k-1][start], 1) {
					continue
				}
				value := cost[k-1][start] + .025*math.Pow(float64(width)-average, 2)
				if end < n-1 {
					value += d.penalties[end]
					if d.protected[end] {
						value += 1000
					}
				}
				if width < min(12, limit/3) {
					value += 100
				}
				if value < cost[k][end] {
					cost[k][end], previous[k][end] = value, start
				}
			}
		}
	}
	if previous[count][n-1] < 0 {
		return nil, false
	}
	parts := make([]string, count)
	for k, end := count, n-1; k > 0; k-- {
		start := previous[k][end]
		parts[k-1] = strings.TrimSpace(d.text[d.ends[start]:d.ends[end]])
		end = start
	}
	return parts, subtitleSegmentsPreserveText(d.text, parts)
}

func splitFrozenDisplayPair(source, target string, limit int, originLang, targetLang types.StandardLanguageCode, sourceHints, targetHints []subtitleDisplayBoundary, preferredSource, preferredTarget []string) ([]string, []string, error) {
	s := newSubtitleDisplayText(source, originLang, limit, sourceHints, preferredSource)
	t := newSubtitleDisplayText(target, targetLang, limit, targetHints, preferredTarget)
	minimum := max(1, (max(s.totalWidth, t.totalWidth)+limit-1)/limit)
	maximum := min(s.content[len(s.content)-1], t.content[len(t.content)-1])
	for _, relax := range []bool{false, true} {
		for count := minimum; count <= maximum; count++ {
			sources, sourceOK := s.split(count, limit, relax)
			if !sourceOK {
				continue
			}
			targets, targetOK := t.split(count, limit, relax)
			if targetOK {
				return sources, targets, nil
			}
		}
	}
	return nil, nil, fmt.Errorf("无法在保留完整原译和字素的条件下生成两侧均不超过%d的非空字幕，译文检查点已保留", limit)
}

func splitFrozenDisplaySentence(sentence pairedSentence, limit int, originLang, targetLang types.StandardLanguageCode, sourceHints, targetHints []subtitleDisplayBoundary) (pairedSentence, error) {
	// Keep already valid outer groups. Only a long group's cuts need relaxing.
	sources, targets := sentence.Source, sentence.Target
	if len(sources) == 0 || len(sources) != len(targets) || !subtitleSegmentsPreserveText(sentence.FullSource, sources) || !subtitleSegmentsPreserveText(sentence.FullTarget, targets) {
		sources, targets = []string{sentence.FullSource}, []string{sentence.FullTarget}
	}
	var nextSource, nextTarget []string
	sourceChunks, targetChunks := subtitleExactChunks(sentence.FullSource, sources), subtitleExactChunks(sentence.FullTarget, targets)
	sourceOffset, targetOffset := 0, 0
	localHints := func(hints []subtitleDisplayBoundary, chunk string, offset int) []subtitleDisplayBoundary {
		left := len(chunk) - len(strings.TrimLeftFunc(chunk, unicode.IsSpace))
		var local []subtitleDisplayBoundary
		for _, hint := range hints {
			if at := hint.Offset - offset - left; at > 0 && at < len(strings.TrimSpace(chunk)) {
				local = append(local, subtitleDisplayBoundary{at, hint.Penalty})
			}
		}
		return local
	}
	for i, source := range sources {
		target := targets[i]
		if subtitleTargetLength(source) <= limit && subtitleTargetLength(target) <= limit {
			nextSource, nextTarget = append(nextSource, source), append(nextTarget, target)
		} else {
			s, t, err := splitFrozenDisplayPair(source, target, limit, originLang, targetLang,
				localHints(sourceHints, sourceChunks[i], sourceOffset), localHints(targetHints, targetChunks[i], targetOffset), nil, nil)
			if err != nil {
				// A tiny source fragment may not support enough nonempty target
				// cues. Relax the parent as a whole, retaining old cuts as hints.
				nextSource, nextTarget, err = splitFrozenDisplayPair(sentence.FullSource, sentence.FullTarget, limit, originLang, targetLang, sourceHints, targetHints, sources, targets)
				if err != nil {
					return sentence, err
				}
				break
			}
			nextSource, nextTarget = append(nextSource, s...), append(nextTarget, t...)
		}
		sourceOffset += len(sourceChunks[i])
		targetOffset += len(targetChunks[i])
	}
	// A nearly-full source cue may force its short target into too many pieces.
	// Do not preserve that local source cut at the expense of breaking a target
	// token (e.g. コースへ / のアクセス). Compare a parent-wide alternative once.
	text := newSubtitleDisplayText(sentence.FullTarget, targetLang, limit, targetHints)
	badCutCost := func(parts []string) float64 {
		cost, position := 0.0, 0
		for _, chunk := range subtitleExactChunks(sentence.FullTarget, parts)[:len(parts)-1] {
			position += len(chunk)
			for index, at := range text.ends {
				if at == position {
					if text.protected[index] {
						cost += 1000
					}
					cost += math.Max(0, text.penalties[index]-160)
					break
				}
			}
		}
		return cost
	}
	if cost := badCutCost(nextTarget); cost > 0 {
		s, t, err := splitFrozenDisplayPair(sentence.FullSource, sentence.FullTarget, limit, originLang, targetLang, sourceHints, targetHints, sources, targets)
		if err == nil && badCutCost(t) < cost {
			nextSource, nextTarget = s, t
		}
	}
	sentence.Source, sentence.Target = nextSource, nextTarget
	sentence.LayoutApproximate, sentence.LayoutFallback, sentence.LayoutReviewed = true, false, false
	sentence.LayoutVersion, sentence.LayoutTarget = frozenPairedLayoutVersion, limit
	if !subtitleSegmentsPreserveText(sentence.FullSource, sentence.Source) || !subtitleSegmentsPreserveText(sentence.LayoutBaseTarget, sentence.Target) || !subtitleSegmentsHaveSafeBoundaries(sentence.Source) || !subtitleSegmentsHaveSafeBoundaries(sentence.Target) {
		return sentence, fmt.Errorf("程序排版未完整保留原译")
	}
	return sentence, pairedFinalLengthIssueAtLimit(sentence, limit)
}
