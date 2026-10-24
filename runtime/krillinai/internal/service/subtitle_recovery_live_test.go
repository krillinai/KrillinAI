package service

import (
	"encoding/json"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// 审计真实 CLI 产物；不调用模型，也不改写字幕。
func TestSubtitleRecoverySRTAuditLive(t *testing.T) {
	input, output := os.Getenv("KRILLINAI_RECOVERY_AUDIT_INPUT"), os.Getenv("KRILLINAI_RECOVERY_AUDIT_OUTPUT")
	if input == "" || output == "" {
		t.Skip("指定真实 SRT 输入和 CLI 产物目录后审计")
	}
	read := func(path string) []*util.SrtBlock {
		t.Helper()
		blocks, err := util.ParseSrtFile(path)
		if err != nil || len(blocks) == 0 {
			t.Fatalf("字幕读取失败: %s: %v", path, err)
		}
		return blocks
	}
	original := read(input)
	source := read(filepath.Join(output, "origin_language_srt.srt"))
	target := read(filepath.Join(output, "target_language_srt.srt"))
	bilingual := read(filepath.Join(output, "bilingual_srt.srt"))
	if len(source) != len(target) || len(source) != len(bilingual) {
		t.Fatal("原文、译文、双语产物条数不一致")
	}
	texts := func(blocks []*util.SrtBlock) []string {
		result := make([]string, len(blocks))
		for i, block := range blocks {
			result[i] = strings.Join(strings.Fields(block.OriginLanguageSentence), " ")
		}
		return result
	}
	if !subtitleSegmentsPreserveText(strings.Join(texts(original), " "), texts(source)) {
		t.Fatal("导出原文遗漏、重复、改写或内部空格变化")
	}
	start, _, err := parseSRTTimeline(original[0].Timestamp)
	if err != nil {
		t.Fatal(err)
	}
	_, end, err := parseSRTTimeline(original[len(original)-1].Timestamp)
	if err != nil {
		t.Fatal(err)
	}
	maxSource, maxTarget, tolerantSource, tolerantTarget, longSource, longTarget := 0, 0, 0, 0, 0, 0
	var previousEnd int64
	var longCues []map[string]any
	for i := range source {
		s, targetCue, pair := source[i], target[i], bilingual[i]
		cueStart, cueEnd, err := parseSRTTimeline(s.Timestamp)
		if err != nil || cueEnd <= cueStart || cueStart < start || cueEnd > end || i > 0 && cueStart < previousEnd {
			t.Fatalf("第%d条时间轴无效: %s", i+1, s.Timestamp)
		}
		if i == 0 && cueStart != start || i == len(source)-1 && cueEnd != end {
			t.Fatal("视频首尾时间范围未完整覆盖")
		}
		previousEnd = cueEnd
		if s.Index != i+1 || targetCue.Index != i+1 || pair.Index != i+1 || s.Timestamp != targetCue.Timestamp || s.Timestamp != pair.Timestamp || pair.OriginLanguageSentence != targetCue.OriginLanguageSentence || pair.TargetLanguageSentence != s.OriginLanguageSentence {
			t.Fatalf("第%d条编号、时间或双语配对不一致", i+1)
		}
		for _, text := range []string{s.OriginLanguageSentence, targetCue.OriginLanguageSentence} {
			if !hasSubtitleContent(text) || hasSubtitleLineBreak(text) {
				t.Fatalf("第%d条字幕为空或存在非法换行", i+1)
			}
		}
		sourceLength, targetLength := subtitleTargetLength(s.OriginLanguageSentence), subtitleTargetLength(targetCue.OriginLanguageSentence)
		maxSource, maxTarget = max(maxSource, sourceLength), max(maxTarget, targetLength)
		if sourceLength > 50 && sourceLength <= 55 {
			tolerantSource++
		}
		if targetLength > 50 && targetLength <= 55 {
			tolerantTarget++
		}
		if sourceLength > 55 {
			longSource++
		}
		if targetLength > 55 {
			longTarget++
		}
		if sourceLength > 50 || targetLength > 50 {
			longCues = append(longCues, map[string]any{"index": i + 1, "source_display_units": sourceLength, "target_display_units": targetLength, "source": s.OriginLanguageSentence, "target": targetCue.OriginLanguageSentence})
		}
	}
	files, err := filepath.Glob(filepath.Join(output, "translation-checkpoints", "*", "*.json"))
	if err != nil || len(files) == 0 {
		t.Fatalf("缺少句级检查点: %v", err)
	}
	sort.Slice(files, func(i, j int) bool {
		left, _ := strconv.Atoi(strings.TrimSuffix(filepath.Base(files[i]), ".json"))
		right, _ := strconv.Atoi(strings.TrimSuffix(filepath.Base(files[j]), ".json"))
		return left < right
	})
	var fullSource, fullTarget []string
	fallbacks := 0
	for i, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var sentence pairedSentence
		if err := json.Unmarshal(data, &sentence); err != nil {
			t.Fatal(err)
		}
		if sentence.ID != strconv.Itoa(i+1) || !hasSubtitleContent(sentence.FullTarget) || len(sentence.Source) == 0 || len(sentence.Source) != len(sentence.Target) || !subtitleSegmentsPreserveText(sentence.FullSource, sentence.Source) || !subtitleSegmentsPreserveText(sentence.FullTarget, sentence.Target) || !subtitleSegmentsHaveSafeBoundaries(sentence.Source) || !subtitleSegmentsHaveSafeBoundaries(sentence.Target) {
			t.Fatalf("检查点原译覆盖、ID或字符边界无效: %s", path)
		}
		fullSource = append(fullSource, sentence.FullSource)
		fullTarget = append(fullTarget, sentence.FullTarget)
		if sentence.LayoutFallback {
			fallbacks++
		}
	}
	if !subtitleSegmentsPreserveText(strings.Join(texts(original), " "), fullSource) || !subtitleSegmentsPreserveText(strings.Join(fullTarget, " "), texts(target)) {
		t.Fatal("原始字幕、完整句检查点与最终导出内容不一致")
	}
	report := map[string]any{
		"检查通过": true, "原始字幕条数": len(original), "完整句检查点数": len(files), "导出字幕条数": len(source),
		"原文完整覆盖": true, "检查点完整译文全部导出": true, "双语配对一致": true, "时间轴有效且无重叠": true,
		"单行显示目标": 50, "含容差显示目标": 55, "原文最大显示单位": maxSource, "译文最大显示单位": maxTarget,
		"原文51至55条数": tolerantSource, "译文51至55条数": tolerantTarget, "原文超过55条数": longSource, "译文超过55条数": longTarget,
		"排版兜底句数": fallbacks, "超出50的字幕": longCues, "字幕总时长秒": float64(end-start) / 1000,
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(filepath.Dir(output), "subtitle_audit.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	t.Log(string(data))
}
