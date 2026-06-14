package voices

import (
	"krillin-ai/internal/pipeline"
	"strings"
	"testing"
)

func TestListAliyunVoicesIncludesCosyVoiceCodes(t *testing.T) {
	got, err := List(ProviderAliyun)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !hasVoice(got, "longxiaochun_v2") {
		t.Fatalf("aliyun voices = %#v, want longxiaochun_v2", got)
	}
	if !hasVoice(got, "longxiaocheng_v2") {
		t.Fatalf("aliyun voices = %#v, want longxiaocheng_v2", got)
	}
}

func TestListRejectsUnsupportedProvider(t *testing.T) {
	_, err := List("unknown")
	if err == nil {
		t.Fatal("List() error = nil, want unsupported provider error")
	}
	if !strings.Contains(err.Error(), "unsupported tts provider") {
		t.Fatalf("error = %q, want unsupported provider", err.Error())
	}
}

func hasVoice(voices []pipeline.Voice, code string) bool {
	for _, voice := range voices {
		if voice.Code == code {
			return true
		}
	}
	return false
}
