package service

import (
	"context"
	"encoding/json"
	"errors"
	"krillin-ai/pkg/util"
	"strings"
	"testing"
)

// 任务860第15句：原文334单位，合理意群拆分后最长一条81单位。
func lengthOverflowFixture() pairedSentence {
	source := []string{
		"And so, with Frank Rosenblatt back in the 1950s, this whole idea of a perceptron,",
		"when you understand the history behind it, sort of what he was trying to solve,",
		"a lot of the modern terms of, you know, artificial neural networks",
		"and regression models and weighted functions and so on and so forth,",
		"all that stuff becomes really clear.",
	}
	target := []string{
		"所以，回到20世纪50年代弗兰克·罗森布拉特提出感知机的历史，",
		"了解它的背景，以及他当时想解决的问题后，",
		"很多现代术语，比如人工神经网络，",
		"以及回归模型、加权函数等等，",
		"就都变得清楚了。",
	}
	return pairedSentence{ID: "15", FullSource: strings.Join(source, " "), FullTarget: strings.Join(target, ""),
		Source: source, Target: target, SemanticReviewed: true}
}

func TestFrozenLengthRepairRetriesOnlyRemainingOverflow(t *testing.T) {
	candidate := lengthOverflowFixture()
	original := candidate
	original.Source, original.Target = []string{candidate.FullSource}, []string{candidate.FullTarget}
	calls := 0
	tr := &Translator{chatCompleter: translationCompleterFunc(func(prompt string) (string, error) {
		calls++
		input, err := decodeFrozenSplitTestInput(prompt)
		if err != nil {
			return "", err
		}
		if calls == 1 {
			return encodeFrozenSplitTestResponse(candidate), nil
		}
		if input.Source == candidate.FullSource {
			t.Fatal("repeated entire parent after partial success")
		}
		if input.PreviousIssue == "" {
			t.Fatal("missing measured overflow feedback")
		}
		switch input.Source {
		case candidate.Source[0]:
			return encodeFrozenSplitTestResponse(pairedSentence{Source: []string{"And so, with Frank Rosenblatt back in the 1950s,", "this whole idea of a perceptron,"}, Target: []string{"所以，回到20世纪50年代弗兰克·罗森布拉特", "提出感知机的历史，"}}), nil
		case candidate.Source[1]:
			return encodeFrozenSplitTestResponse(pairedSentence{Source: []string{"when you understand the history behind it,", "sort of what he was trying to solve,"}, Target: []string{"了解它的背景，", "以及他当时想解决的问题后，"}}), nil
		default:
			t.Fatalf("requested compliant pair: %s", input.Source)
			return "", nil
		}
	})}
	got, err := tr.repairLongPairedSubtitle(context.Background(), lengthSplitTestInput(original, 75), original, pairedTranslationSource{ID: "15", Text: original.FullSource, TargetText: original.FullTarget}, "en", "zh_cn")
	if err != nil || calls != 3 || pairedFinalLengthIssue(got) != nil || len(got.Source) != 7 || got.FullTarget != original.FullTarget {
		t.Fatalf("calls=%d got=%+v err=%v", calls, got, err)
	}
}

func TestExportRetainsOverflowSegmentsAndDistributesTimes(t *testing.T) {
	candidate := lengthOverflowFixture()
	texts := []string{candidate.FullSource, "I read books."}
	splits := 0
	translator := &Translator{preparedTranslation: &preparedTranslationContext{Texts: texts}}
	translator.chatCompleter = semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_content\n") {
			data, err := json.Marshal(map[string]any{"sentences": []map[string]string{
				{"sentence_id": "1", "target_text": candidate.FullTarget}, {"sentence_id": "2", "target_text": "我读书。"},
			}})
			return string(data), err
		}
		if strings.HasPrefix(prompt, "Task: translation_length_split\n") {
			splits++
			item := candidate
			item.ID = "1"
			return encodeFrozenSplitTestResponse(item), nil
		}
		if response, ok := neutralSemanticTestResponse(prompt); ok {
			return response, nil
		}
		return "", errors.New("其他排版请求不可用")
	})
	input := []*util.SrtBlock{
		{Index: 1, Timestamp: "00:01:58,840 --> 00:02:13,520", OriginLanguageSentence: texts[0]},
		{Index: 2, Timestamp: "00:02:13,520 --> 00:02:15,520", OriginLanguageSentence: texts[1]},
	}
	output, err := translator.BatchTranslateSrtBlocks(context.Background(), input, "en", "zh_cn", nil)
	if err != nil || len(output) != 6 || splits != 5 {
		t.Fatalf("导出没有保留5条较短字幕: blocks=%+v splits=%d err=%v", output, splits, err)
	}
	var sources, targets []string
	service := &YouTubeSubtitleService{}
	previousEnd := 118.84
	for _, block := range output[:5] {
		start, end, err := service.parseSrtTimestamp(block.Timestamp)
		if err != nil || start < previousEnd || end <= start || end > 133.52 {
			t.Fatalf("分段时间不连续或超出父句: %s err=%v", block.Timestamp, err)
		}
		previousEnd = end
		sources = append(sources, block.OriginLanguageSentence)
		targets = append(targets, block.TargetLanguageSentence)
	}
	if previousEnd != 133.52 || !subtitleSegmentsPreserveText(candidate.FullSource, sources) || !subtitleSegmentsPreserveText(candidate.FullTarget, targets) || output[5].TargetLanguageSentence != "我读书。" {
		t.Fatal("导出丢失原译、结束时间或后续字幕")
	}
}
