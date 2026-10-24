package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestFinalLengthBatchRetriesOnlyRejectedPair(t *testing.T) {
	source := "That is the framework you need round you in order to sustain a reading habit."
	input := pairedTranslationInput{SourceLanguage: "English", TargetLanguage: "简体中文", MaxTargetChars: 65}
	parents := make(map[string]pairedSentence)
	for _, id := range []string{"1", "2"} {
		input.Sentences = append(input.Sentences, pairedTranslationSource{ID: id, Text: source})
		parents[id] = pairedSentence{ID: id, FullSource: source, FullTarget: "这就是你为了维持阅读习惯所需要的环境。", Source: []string{source}, Target: []string{"这就是你为了维持阅读习惯所需要的环境。"}, DraftTarget: "初译", SemanticReviewed: true, LayoutReviewed: true}
	}
	splits, reviews := 0, 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		if strings.HasPrefix(prompt, "任务：translation_length_batch_review\n") {
			reviews++
			if reviews == 1 {
				return `{"reviews":[{"sentence_id":"1_0","equivalent":true,"acceptable":true,"reason":"全部含义及自然意群均保留"},{"sentence_id":"2_0","equivalent":true,"acceptable":false,"reason":"需要重新组织切口"}]}`, nil
			}
			if strings.Contains(prompt, `"sentence_id":"1_0"`) {
				t.Fatal("复核再次发送了已通过项目")
			}
			return `{"reviews":[{"sentence_id":"2_0","equivalent":true,"acceptable":true,"reason":"修正后含义与意群均正确"}]}`, nil
		}
		if !strings.HasPrefix(prompt, "任务：translation_length_split_batch\n") {
			return "", fmt.Errorf("不应进入逐条回退：%s", prompt[:30])
		}
		splits++
		var payload struct {
			Requests []subtitleLengthSplitInput `json:"requests"`
		}
		if err := semanticTestPayload(prompt, &payload); err != nil {
			return "", err
		}
		if splits == 3 && (len(payload.Requests) != 1 || payload.Requests[0].Sentences[0].ID != "2_0" || !strings.Contains(payload.Requests[0].PreviousIssue, "重新组织")) {
			t.Fatal("没有仅重试失败项目")
		}
		var response pairedTranslationOutput
		for _, request := range payload.Requests {
			value := pairedTranslationOutputSentence{ID: request.Sentences[0].ID}
			if splits == 1 {
				value.Segments = []pairedTranslationSegment{{Source: source, Target: request.OriginalTarget}}
			} else {
				value.Segments = []pairedTranslationSegment{{Source: "That is the framework you need round you", Target: "你身边需要这样的环境，"}, {Source: "in order to sustain a reading habit.", Target: "以维持阅读习惯。"}}
			}
			response.Sentences = append(response.Sentences, value)
		}
		data, err := json.Marshal(response)
		return string(data), err
	})}
	completed := make(map[string]bool)
	err := translator.splitLongPairedSubtitles(context.Background(), input, parents, "en", "zh_cn", func(s pairedSentence, complete bool) error {
		if complete {
			completed[s.ID] = true
		}
		return nil
	})
	if err != nil || splits != 3 || reviews != 2 || !completed["1"] || !completed["2"] {
		t.Fatalf("splits=%d reviews=%d completed=%v err=%v", splits, reviews, completed, err)
	}
	for _, s := range parents {
		if pairedFinalLengthIssue(s) != nil || s.DraftTarget != "初译" || !s.SemanticReviewed || !s.LayoutReviewed || s.FullTarget != "你身边需要这样的环境，以维持阅读习惯。" {
			t.Fatalf("不完整或丢失初译/审校元数据: %+v", s)
		}
	}
}

func TestFinalLengthBatchKeepsEarlierGroupsOfSameParent(t *testing.T) {
	original := pairedSentence{ID: "1", FullSource: "One, two, three, four, five.", FullTarget: "一，二，三，四，五。", Source: []string{"One,", "two,", "three,", "four,", "five."}, Target: []string{"一，", "二，", "三，", "四，", "五。"}}
	var work []*longPairedWork
	for i := range original.Source {
		candidate := pairedSentence{Source: []string{original.Source[i]}, Target: []string{original.Target[i]}, FullTarget: original.Target[i]}
		work = append(work, &longPairedWork{parent: original, index: i, candidate: &candidate})
	}
	parents := map[string]pairedSentence{"1": original}
	if err := saveLongPairedCandidates(pairedTranslationInput{MaxTargetChars: 65}, work, parents, func(pairedSentence, bool) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if strings.Join(parents["1"].Source, " ") != original.FullSource || parents["1"].FullTarget != original.FullTarget {
		t.Fatalf("跨组保存丢失了先前配对: %+v", parents["1"])
	}
}
