package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigMigratesRetiredImageModel(t *testing.T) {
	original := Conf
	t.Cleanup(func() { Conf = original })
	t.Chdir(t.TempDir())
	if err := os.Mkdir("config", 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join("config", "config.toml"), []byte("[image.openai]\nmodel = 'gpt-image-1'\napi_key = 'image-secret'\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if !LoadConfig() {
		t.Fatal("LoadConfig() failed")
	}
	if Conf.Image.Openai.Model != "gpt-image-2" || Conf.Image.Openai.ApiKey != "image-secret" {
		t.Fatal("image model migration did not retain credentials and replace the retired model")
	}
}

func TestDefaultImageConfig(t *testing.T) {
	if Conf.Image.Provider != "openai-compatible" {
		t.Fatalf("Image.Provider = %q, want openai-compatible", Conf.Image.Provider)
	}
	if Conf.Image.Openai.Model != "gpt-image-2" {
		t.Fatalf("Image.Openai.Model = %q, want gpt-image-2", Conf.Image.Openai.Model)
	}
}

func TestDefaultDubbingConfig(t *testing.T) {
	if Conf.Dubbing.MinSubtitleDuration != 2.5 {
		t.Fatalf("MinSubtitleDuration = %v, want 2.5", Conf.Dubbing.MinSubtitleDuration)
	}
	if Conf.Dubbing.MaxChunkSize != 5 {
		t.Fatalf("MaxChunkSize = %d, want 5", Conf.Dubbing.MaxChunkSize)
	}
	if Conf.Dubbing.GapTolerance != 1.5 {
		t.Fatalf("GapTolerance = %v, want 1.5", Conf.Dubbing.GapTolerance)
	}
	if Conf.Dubbing.SpeedMin != 0.95 || Conf.Dubbing.SpeedAccept != 1.15 || Conf.Dubbing.SpeedMax != 1.30 {
		t.Fatalf("speed config = %+v", Conf.Dubbing)
	}
	if !Conf.Dubbing.EnableTextRewrite {
		t.Fatalf("EnableTextRewrite = false, want true")
	}
	if Conf.Dubbing.RewriteMaxAttempts != 2 {
		t.Fatalf("RewriteMaxAttempts = %d, want 2", Conf.Dubbing.RewriteMaxAttempts)
	}
	if Conf.Dubbing.Estimator != "statistical" {
		t.Fatalf("Estimator = %q, want statistical", Conf.Dubbing.Estimator)
	}
}
