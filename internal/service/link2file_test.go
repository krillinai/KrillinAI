package service

import "testing"

func TestNormalizeBilibiliVideoURLPreservesPlaylistPage(t *testing.T) {
	link := "https://www.bilibili.com/video/BV1D45izrEkV?spm_id_from=333.788.videopod.episodes&vd_source=example&p=2"

	got := normalizeBilibiliVideoURL(link, "BV1D45izrEkV")
	want := "https://www.bilibili.com/video/BV1D45izrEkV?p=2"
	if got != want {
		t.Fatalf("normalizeBilibiliVideoURL() = %q, want %q", got, want)
	}
}
