package types

import (
	"fmt"
	"sort"
	"sync"
)

// 失败句保留原文交付；句级检查点用于仅重试这些句子。
type SubtitleTranslationFailure struct {
	SentenceID string `json:"sentence_id"`
	SourceText string `json:"source_text"`
	Reason     string `json:"reason"`
}

const TranslationWarningPrefix = "部分字幕未翻译："

type subtitleTranslationReports struct {
	mu      sync.Mutex
	byScope map[string][]SubtitleTranslationFailure
}

// 一个音频任务可能有多个独立内容检查点，更新某一段不能清掉其他段的问题。
func (t *SubtitleTask) SetTranslationFailures(scope string, failures []SubtitleTranslationFailure) {
	if t == nil {
		return
	}
	t.translationReports.mu.Lock()
	defer t.translationReports.mu.Unlock()
	if t.translationReports.byScope == nil {
		t.translationReports.byScope = make(map[string][]SubtitleTranslationFailure)
	}
	t.translationReports.byScope[scope] = append([]SubtitleTranslationFailure(nil), failures...)
}

func (t *SubtitleTask) TranslationFailures() []SubtitleTranslationFailure {
	if t == nil {
		return nil
	}
	t.translationReports.mu.Lock()
	defer t.translationReports.mu.Unlock()
	var scopes []string
	for scope := range t.translationReports.byScope {
		scopes = append(scopes, scope)
	}
	sort.Strings(scopes)
	var result []SubtitleTranslationFailure
	for _, scope := range scopes {
		result = append(result, t.translationReports.byScope[scope]...)
	}
	return result
}

func TranslationWarnings(failures []SubtitleTranslationFailure) []string {
	if len(failures) == 0 {
		return nil
	}
	return []string{fmt.Sprintf("%s%d条已保留原文，可续跑重试这些字幕", TranslationWarningPrefix, len(failures))}
}
