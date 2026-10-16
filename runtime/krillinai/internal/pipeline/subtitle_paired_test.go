package pipeline

import (
	"context"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
	"testing"
)

func TestImportedSubtitleExportsUseReturnedPairedSegments(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "input.srt")
	if err := os.WriteFile(path, []byte("1\n00:00:00,000 --> 00:00:02,000\nWe can launch after review.\n\n"), 0600); err != nil {
		t.Fatal(err)
	}
	fake := &fakeStageService{translatedBlocks: []*util.SrtBlock{
		{Index: 1, Timestamp: "00:00:00,000 --> 00:00:01,000", OriginLanguageSentence: "We can launch", TargetLanguageSentence: "审核后，"},
		{Index: 2, Timestamp: "00:00:01,000 --> 00:00:02,000", OriginLanguageSentence: "after review.", TargetLanguageSentence: "我们就能发布。"},
	}}
	response, err := GenerateSubtitles(context.Background(), fake, SubtitleRequest{Input: "https://www.youtube.com/watch?v=import", Workdir: root, TaskID: "paired", OriginLang: "en", TargetLang: "zh_cn", PrepareVideo: true, InputSRT: path})
	if err != nil {
		t.Fatal(err)
	}
	for _, output := range []string{response.Outputs.OriginSRT, response.Outputs.TargetSRT, response.Outputs.BilingualSRT, response.Outputs.ShortOriginMixedSRT} {
		blocks, err := readSRTBlocks(output)
		if err != nil || len(blocks) != 2 {
			t.Fatalf("未使用重新分段后的结果 %s: %v, %v", output, blocks, err)
		}
		for i, block := range blocks {
			if block.Timestamp != fake.translatedBlocks[i].Timestamp {
				t.Fatalf("时间轴不一致: %s", output)
			}
		}
	}
}
