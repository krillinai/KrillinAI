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

func TestListMinimaxVoices(t *testing.T) {
	got, err := List(Minimax)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if !hasVoice(got, "English_Graceful_Lady") {
		t.Fatalf("minimax voices = %#v, want English_Graceful_Lady", got)
	}
	if !hasVoice(got, "English_radiant_girl") {
		t.Fatalf("minimax voices = %#v, want English_radiant_girl", got)
	}
	for _, v := range got {
		if v.Provider != Minimax {
			t.Fatalf("voice %q provider = %q, want %q", v.Code, v.Provider, Minimax)
		}
	}
}

func TestProvidersIncludesMinimax(t *testing.T) {
	found := false
	for _, p := range Providers() {
		if p == Minimax {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("Providers() = %#v, want to include %q", Providers(), Minimax)
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
