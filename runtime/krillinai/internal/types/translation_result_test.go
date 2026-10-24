package types

import "testing"

func TestTranslationReportsKeepOtherAudioSegments(t *testing.T) {
	task := &SubtitleTask{}
	first := []SubtitleTranslationFailure{{SentenceID: "1", Reason: "第一段失败"}}
	task.SetTranslationFailures("audio-a", first)
	first[0].Reason = "不能影响保存的结果"
	task.SetTranslationFailures("audio-b", []SubtitleTranslationFailure{{SentenceID: "1", Reason: "第二段失败"}})
	got := task.TranslationFailures()
	if len(got) != 2 || got[0].Reason != "第一段失败" {
		t.Fatalf("失败句被覆盖：%+v", got)
	}
	task.SetTranslationFailures("audio-a", nil)
	got = task.TranslationFailures()
	if len(got) != 1 || got[0].Reason != "第二段失败" {
		t.Fatalf("修复一段清除了另一段的问题：%+v", got)
	}
}
