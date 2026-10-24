package service

import (
	"context"
	"errors"
	openaiapi "github.com/sashabaranov/go-openai"
	"krillin-ai/config"
	"krillin-ai/internal/types"
	"krillin-ai/log"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInvalidTranslationServiceStopsOptionalReferencePreparation(t *testing.T) {
	for _, failure := range []*openaiapi.APIError{
		{HTTPStatusCode: 401, Message: "invalid key"},
		{HTTPStatusCode: 429, Message: "quota depleted", Code: "insufficient_quota"},
	} {
		calls := 0
		translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) { calls++; return "", failure })}
		_, err := translator.prepareTranslationSemanticPlan(context.Background(), []string{strings.Repeat("Long source content ", 500)}, "en", "zh_cn")
		if !errors.Is(err, failure) || calls != 1 {
			t.Fatalf("calls=%d err=%v", calls, err)
		}
	}
}

func TestDegradedReferencePlanIsFrozenForLegacyResume(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.Llm.Model = "snapshot-test"
	calls := 0
	translator := &Translator{checkpointDir: t.TempDir(), chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) { calls++; return `{}`, nil })}
	for range 2 {
		plan, err := translator.prepareTranslationSemanticPlan(context.Background(), []string{"Some source text."}, "en", "zh_cn")
		if err != nil || !plan.Degraded || calls != 1 {
			t.Fatalf("plan=%+v calls=%d err=%v", plan, calls, err)
		}
	}
}

func TestContentServiceFailureKeepsAcceptedTranslation(t *testing.T) {
	calls := 0
	failure := &openaiapi.APIError{HTTPStatusCode: 401, Message: "invalid key"}
	translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		calls++
		if calls == 1 {
			return `{"sentences":[{"sentence_id":"1","text":"第一句。"}]}`, nil
		}
		return "", failure
	})}
	input := pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: "First."}, {ID: "2", Text: "Second."}}}
	saved := make(map[string]pairedSentence)
	_, err := translator.translateContentBatch(context.Background(), input, "en", "zh_cn", func(s pairedSentence, _ bool) error { saved[s.ID] = s; return nil })
	if !errors.Is(err, failure) || calls != 2 || saved["1"].FullTarget != "第一句。" {
		t.Fatalf("accepted content lost or authentication error retried: saved=%+v calls=%d err=%v", saved, calls, err)
	}
}

func TestLegacyLayoutWarningClearsAfterSuccessfulRepair(t *testing.T) {
	task := &types.SubtitleTask{}
	translator := &Translator{translationTask: task, translationReportScope: "legacy-layout"}
	result := []pairedSentence{{ID: "1", FullSource: "Source.", FullTarget: "译文。", LayoutFallback: true}}
	for _, pending := range []bool{true, false} {
		result[0].LayoutFallback = pending
		if _, err := translator.finishTranslationResult(context.Background(), result, &translationCheckpoint{}); err != nil {
			t.Fatal(err)
		}
		if (len(task.TranslationLayoutWarnings()) > 0) != pending {
			t.Fatalf("incorrect layout warning after repair: %v", task.TranslationLayoutWarnings())
		}
	}
}

func TestAudioTranscriptionRecoveryIdentityTracksSourceAndASR(t *testing.T) {
	previous := config.Conf
	t.Cleanup(func() { config.Conf = previous })
	config.Conf.Transcribe.Provider = "openai"
	config.Conf.Transcribe.Openai.BaseUrl = "https://asr.example/v1"
	directory := t.TempDir()
	audio := filepath.Join(directory, "source.wav")
	if err := os.WriteFile(audio, []byte("first audio"), 0600); err != nil {
		t.Fatal(err)
	}
	key := audioTranscriptionCheckpointPath(audio, directory, "en")
	config.Conf.Transcribe.Openai.ApiKey = "rotated"
	if audioTranscriptionCheckpointPath(audio, directory, "en") != key {
		t.Fatal("credentials invalidated saved recognition")
	}
	if audioTranscriptionCheckpointPath(audio, directory, "fr") == key {
		t.Fatal("different source language reused recognition")
	}
	config.Conf.Transcribe.Openai.OfficialModel = "other-model"
	if audioTranscriptionCheckpointPath(audio, directory, "en") == key {
		t.Fatal("different ASR model reused recognition")
	}
	config.Conf.Transcribe.Openai.OfficialModel = ""
	if err := os.WriteFile(audio, []byte("different audio"), 0600); err != nil {
		t.Fatal(err)
	}
	if audioTranscriptionCheckpointPath(audio, directory, "en") == key {
		t.Fatal("different audio reused recognition")
	}
}

func TestVTTRepeatedWordsUseCueEvidence(t *testing.T) {
	log.InitLogger()
	for _, tc := range []struct{ name, cues, want string }{
		{"later occurrence", "00:00:01.000 --> 00:00:03.000\nnotion<00:00:02.000><c> helps</c>\n\n00:00:10.000 --> 00:00:11.000\nnotion\n", "notion helps notion"},
		{"rolling single word", "00:00:01.000 --> 00:00:02.000\nan earlier line\nnotion\n\n00:00:02.000 --> 00:00:02.010\nnotion\n\n00:00:02.010 --> 00:00:04.000\nnotion\nboard<00:00:03.000><c> helps</c>\n", "notion board helps"},
		{"spoken adjacent repeat", "00:00:01.000 --> 00:00:02.000\nyes\n\n00:00:02.000 --> 00:00:03.000\nyes\n", "yes yes"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "source.vtt")
			if err := os.WriteFile(path, []byte("WEBVTT\n\n"+tc.cues), 0600); err != nil {
				t.Fatal(err)
			}
			words, err := (&YouTubeSubtitleService{}).ExtractWordsFromVtt(path)
			if err != nil {
				t.Fatal(err)
			}
			var texts []string
			for _, word := range words {
				texts = append(texts, word.Text)
			}
			if got := strings.Join(texts, " "); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestContentAliasAndConflictRetryOnlyAffectedItem(t *testing.T) {
	calls := 0
	translator := &Translator{chatCompleter: semanticTestCompleter(func(_ context.Context, prompt string) (string, error) {
		calls++
		if calls == 1 {
			return `{"sentences":[{"sentence_id":"1","text":"第一句。"},{"sentence_id":"2","target_text":"第二句。","text":"冲突。"}]}`, nil
		}
		if strings.Contains(prompt, `"sentence_id":"1"`) {
			t.Fatal("accepted alias retried")
		}
		return `{"sentences":[{"sentence_id":"2","target_text":"第二句。"}]}`, nil
	})}
	input := pairedTranslationInput{Sentences: []pairedTranslationSource{{ID: "1", Text: "First."}, {ID: "2", Text: "Second."}}}
	saved := map[string]string{}
	remaining, err := translator.translateContentBatch(context.Background(), input, "en", "zh_cn", func(s pairedSentence, _ bool) error { saved[s.ID] = s.FullTarget; return nil })
	if err != nil || len(remaining.Sentences) != 0 || calls != 2 || saved["1"] != "第一句。" || saved["2"] != "第二句。" {
		t.Fatalf("remaining=%+v saved=%v calls=%d err=%v", remaining, saved, calls, err)
	}
}

func TestPlainTranslationAcceptsTextAlias(t *testing.T) {
	translator := &Translator{chatCompleter: semanticTestCompleter(func(context.Context, string) (string, error) {
		return "```json\n{\"sentence_id\":\"1\",\"text\":\"第一句。\"}\n```", nil
	})}
	got, ok, err := translator.translatePlainSentence(context.Background(), pairedTranslationInput{}, pairedTranslationSource{ID: "1", Text: "First."}, "en", "zh_cn")
	if err != nil || !ok || got.FullTarget != "第一句。" {
		t.Fatalf("got=%+v ok=%v err=%v", got, ok, err)
	}
}
