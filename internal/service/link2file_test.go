package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeBilibiliVideoURLPreservesPlaylistPage(t *testing.T) {
	link := "https://www.bilibili.com/video/BV1D45izrEkV?spm_id_from=333.788.videopod.episodes&vd_source=example&p=2"

	got := normalizeBilibiliVideoURL(link, "BV1D45izrEkV")
	want := "https://www.bilibili.com/video/BV1D45izrEkV?p=2"
	if got != want {
		t.Fatalf("normalizeBilibiliVideoURL() = %q, want %q", got, want)
	}
}

func TestResolveLocalMediaInput(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "source.webm")
	if err := os.WriteFile(path, []byte("video"), 0600); err != nil {
		t.Fatal(err)
	}

	for _, input := range []string{path, "local:" + path} {
		got, ok := resolveLocalMediaInput(input)
		if !ok || got != path {
			t.Fatalf("resolveLocalMediaInput(%q) = %q, %v; want %q, true", input, got, ok, path)
		}
	}

	if got, ok := resolveLocalMediaInput(filepath.Join(dir, "missing.mp4")); ok || got != "" {
		t.Fatalf("missing input = %q, %v; want empty, false", got, ok)
	}
}
