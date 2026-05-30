package config

import "testing"

func TestDefaultImageConfig(t *testing.T) {
	if Conf.Image.Provider != "openai-compatible" {
		t.Fatalf("Image.Provider = %q, want openai-compatible", Conf.Image.Provider)
	}
	if Conf.Image.Openai.Model == "" {
		t.Fatalf("Image.Openai.Model is empty")
	}
}
