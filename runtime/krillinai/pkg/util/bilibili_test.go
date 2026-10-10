package util

import "testing"

func TestNormalizeBilibiliVideoURL(testRunner *testing.T) {
	for _, test := range []struct {
		name  string
		input string
		want  string
	}{
		{"selected part", "https://www.bilibili.com/video/BV18E421w7bf/?spm_id_from=share&p=3&vd_source=tracking", "https://www.bilibili.com/video/BV18E421w7bf?p=3"},
		{"safe single part fallback", "https://www.bilibili.com/video/BV18E421w7bf", "https://www.bilibili.com/video/BV18E421w7bf?p=1"},
		{"av video", "https://www.bilibili.com/video/av123/?p=2", "https://www.bilibili.com/video/av123?p=2"},
	} {
		testRunner.Run(test.name, func(subtest *testing.T) {
			got, err := NormalizeBilibiliVideoURL(test.input)
			if err != nil || got != test.want {
				subtest.Fatalf("got %q, %v; want %q", got, err, test.want)
			}
		})
	}
	for _, query := range []string{"p=0", "p=-1", "p=1.5", "p=", "p=2&p=3", "p=9007199254740992"} {
		if _, err := NormalizeBilibiliVideoURL("https://www.bilibili.com/video/BV18E421w7bf?" + query); err == nil {
			testRunner.Fatalf("expected invalid query %q to fail", query)
		}
	}
	if _, err := NormalizeBilibiliVideoURL("https://notbilibili.com/video/BV18E421w7bf?p=3"); err == nil {
		testRunner.Fatal("expected lookalike host to fail")
	}
}
