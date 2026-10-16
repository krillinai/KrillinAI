package service

import (
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/clipperhouse/uax29/v2/graphemes"
	"github.com/clipperhouse/uax29/v2/words"
	"golang.org/x/text/width"
)

var subtitleAbbreviations = map[string]bool{
	"dr.": true, "mr.": true, "mrs.": true, "ms.": true, "prof.": true,
	"vs.": true, "etc.": true, "inc.": true, "ltd.": true, "corp.": true,
	"co.": true, "jr.": true, "sr.": true, "st.": true, "ave.": true,
	"blvd.": true, "rd.": true, "apt.": true, "no.": true, "vol.": true,
	"ch.": true, "sec.": true, "fig.": true, "pg.": true, "pp.": true,
	"i.e.": true, "e.g.": true, "cf.": true, "et.": true, "al.": true,
}

// 字素簇用于显示和切分；时间定位仍使用去空白后的 rune 坐标。
func subtitleTargetLength(text string) int {
	length := 0
	iter := graphemes.FromString(text)
	for iter.Next() {
		clusterWidth := 0
		for _, r := range iter.Value() {
			if unicode.IsMark(r) || unicode.Is(unicode.Cf, r) || r == 0xfe0f {
				continue
			}
			units := 1
			switch width.LookupRune(r).Kind() {
			case width.EastAsianWide, width.EastAsianFullwidth:
				units = 2
			}
			clusterWidth = max(clusterWidth, units)
		}
		length += clusterWidth
	}
	return length
}

func hasSubtitleLineBreak(text string) bool {
	return strings.ContainsAny(text, "\r\n\v\f\u0085\u2028\u2029") ||
		strings.Contains(text, `\N`) || strings.Contains(text, `\n`)
}

// 优先在 Unicode 词边界切分，无自然边界的长词才回退到完整字素簇。
func splitSubtitleText(text string, fits func(string) bool) ([]string, error) {
	wordEnds := make(map[int]bool)
	wordIter := words.FromString(text)
	for wordIter.Next() {
		wordEnds[wordIter.End()] = true
	}
	ends := []int{0}
	iter := graphemes.FromString(text)
	for iter.Next() {
		ends = append(ends, iter.End())
	}
	var parts []string
	for index := 0; index+1 < len(ends); {
		start, cut, preferred := ends[index], index, index
		for j := index + 1; j < len(ends); j++ {
			if !fits(strings.TrimSpace(text[start:ends[j]])) {
				break
			}
			cut = j
			if wordEnds[ends[j]] {
				preferred = j
			}
		}
		if cut == index {
			return nil, fmt.Errorf("单个字素簇超过字幕或输入上限: %q", text[start:ends[index+1]])
		}
		if cut+1 < len(ends) && preferred > index && ends[preferred]-start >= (ends[cut]-start)/2 {
			cut = preferred
		}
		if tail := strings.TrimSpace(text[ends[cut]:]); tail != "" && !hasSubtitleContent(tail) {
			adjusted := 0
			for _, preferWords := range []bool{true, false} {
				for j := cut - 1; j > index; j-- {
					if preferWords && !wordEnds[ends[j]] {
						continue
					}
					if hasSubtitleContent(text[start:ends[j]]) && hasSubtitleContent(text[ends[j]:]) && fits(strings.TrimSpace(text[ends[j]:])) {
						adjusted = j
						break
					}
				}
				if adjusted > 0 {
					break
				}
			}
			if adjusted == 0 {
				return nil, fmt.Errorf("当前上限无法将末尾标点与实际文字保留在同一字幕片段")
			}
			cut = adjusted
		}
		if part := strings.TrimSpace(text[start:ends[cut]]); part != "" {
			parts = append(parts, part)
		}
		index = cut
	}
	return parts, nil
}

func splitSubtitleSourceHint(text string, limit int) ([]string, error) {
	parts, err := splitSubtitleText(text, func(s string) bool { return subtitleTargetLength(s) <= limit })
	if err != nil || len(parts) < 2 {
		return parts, err
	}
	// 调整末尾两段，避免贪心切分把助词或短尾句单独留给翻译。
	tail := strings.TrimSpace(text)
	for _, part := range parts[:len(parts)-2] {
		tail = strings.TrimSpace(tail[len(part):])
	}
	bestCut, bestScore := 0, int(^uint(0)>>1)
	iter := words.FromString(tail)
	for iter.Next() {
		cut := iter.End()
		left, right := strings.TrimSpace(tail[:cut]), strings.TrimSpace(tail[cut:])
		leftSize, rightSize := subtitleTargetLength(left), subtitleTargetLength(right)
		if leftSize > limit {
			break
		}
		if rightSize > limit || !hasSubtitleContent(left) || !hasSubtitleContent(right) {
			continue
		}
		score := max(leftSize, rightSize) - min(leftSize, rightSize)
		last, _ := utf8.DecodeLastRuneInString(left)
		if unicode.IsPunct(last) && min(leftSize, rightSize)*4 >= leftSize+rightSize {
			score -= limit / 2
		}
		if score < bestScore && subtitleSegmentsHaveSafeBoundaries([]string{left, right}) {
			bestCut, bestScore = cut, score
		}
	}
	if bestCut > 0 {
		parts[len(parts)-2] = strings.TrimSpace(tail[:bestCut])
		parts[len(parts)-1] = strings.TrimSpace(tail[bestCut:])
	}
	return parts, nil
}

func subtitleTextPreview(text string, maxBytes int) string {
	if len(text) <= maxBytes {
		return text
	}
	end := 0
	iter := graphemes.FromString(text)
	for iter.Next() {
		if iter.End() > maxBytes {
			break
		}
		end = iter.End()
	}
	return text[:end] + " [内容过长，已截短反馈]"
}

func subtitleSegmentsHaveSafeBoundaries(segments []string) bool {
	text := compactSubtitleText(strings.Join(segments, ""))
	boundaries := map[int]bool{0: true}
	iter := graphemes.FromString(text)
	for iter.Next() {
		boundaries[iter.End()] = true
	}
	position := 0
	for _, segment := range segments {
		if !utf8.ValidString(segment) {
			return false
		}
		position += len(compactSubtitleText(segment))
		if !boundaries[position] {
			return false
		}
	}
	return true
}
