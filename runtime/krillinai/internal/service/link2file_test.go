package service

import (
	"context"
	"krillin-ai/config"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBilibiliDownloadsOnlySelectedPart(testRunner *testing.T) {
	if runtime.GOOS == "windows" {
		testRunner.Skip("shell downloader fixture requires POSIX")
	}
	originalYtdlp, originalPrefix, originalFfmpeg, originalProxy := storage.YtdlpPath, storage.YtdlpPrefixArgs, storage.FfmpegPath, config.Conf.App.Proxy
	testRunner.Cleanup(func() {
		storage.YtdlpPath, storage.YtdlpPrefixArgs, storage.FfmpegPath, config.Conf.App.Proxy = originalYtdlp, originalPrefix, originalFfmpeg, originalProxy
	})
	dir := testRunner.TempDir()
	argsPath := filepath.Join(dir, "arguments")
	downloader := filepath.Join(dir, "yt-dlp")
	testRunner.Setenv("BILIBILI_TEST_ARGS", argsPath)
	if err := os.WriteFile(downloader, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" >> \"$BILIBILI_TEST_ARGS\"\nprintf '\\n' >> \"$BILIBILI_TEST_ARGS\"\n"), 0700); err != nil {
		testRunner.Fatal(err)
	}
	storage.YtdlpPath, storage.YtdlpPrefixArgs, storage.FfmpegPath, config.Conf.App.Proxy = downloader, nil, "ffmpeg", ""
	for _, test := range []struct {
		compose   string
		skipAudio bool
		commands  int
	}{
		{"none", false, 1},
		{"horizontal", false, 2},
		{"horizontal", true, 1},
	} {
		if err := os.WriteFile(argsPath, nil, 0600); err != nil {
			testRunner.Fatal(err)
		}
		step := &types.SubtitleTaskStepParam{Link: "https://www.bilibili.com/video/BV18E421w7bf/?spm_id_from=share&p=3",
			TaskBasePath: dir, TaskPtr: &types.SubtitleTask{}, EmbedSubtitleVideoType: test.compose, SkipAudio: test.skipAudio}
		if err := (Service{}).linkToFile(context.Background(), step); err != nil {
			testRunner.Fatal(err)
		}
		arguments, err := os.ReadFile(argsPath)
		if err != nil {
			testRunner.Fatal(err)
		}
		wantCommands := test.commands
		if strings.Count(string(arguments), "--no-playlist\n") != wantCommands || strings.Count(string(arguments), "https://www.bilibili.com/video/BV18E421w7bf?p=3\n") != wantCommands {
			testRunner.Fatalf("expected %d single-part downloads with preserved P3, got %s", wantCommands, arguments)
		}
		if step.Link != "https://www.bilibili.com/video/BV18E421w7bf?p=3" {
			testRunner.Fatalf("unexpected normalized link: %s", step.Link)
		}
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

func TestAdditionalPlatformMediaDownloads(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell downloader fixture requires POSIX")
	}
	originalYtdlp, originalPrefix, originalFfmpeg, originalProxy := storage.YtdlpPath, storage.YtdlpPrefixArgs, storage.FfmpegPath, config.Conf.App.Proxy
	t.Cleanup(func() {
		storage.YtdlpPath, storage.YtdlpPrefixArgs, storage.FfmpegPath, config.Conf.App.Proxy = originalYtdlp, originalPrefix, originalFfmpeg, originalProxy
	})
	dir := t.TempDir()
	argsPath := filepath.Join(dir, "arguments")
	downloader := filepath.Join(dir, "yt-dlp")
	t.Setenv("VIDEO_SOURCE_TEST_ARGS", argsPath)
	if err := os.WriteFile(downloader, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" >> \"$VIDEO_SOURCE_TEST_ARGS\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	storage.YtdlpPath, storage.YtdlpPrefixArgs, storage.FfmpegPath, config.Conf.App.Proxy = downloader, nil, "/custom/ffmpeg", "http://127.0.0.1:7897"
	for _, link := range []string{
		"https://x.com/creator/status/123",
		"https://www.tiktok.com/@creator/video/123",
		"https://vm.tiktok.com/abc123/",
		"https://www.instagram.com/reel/abc123/",
		"https://www.douyin.com/video/123",
		"https://v.douyin.com/abc123/",
		"https://www.facebook.com/watch/?v=123",
		"https://fb.watch/abc123/",
		"https://www.xiaohongshu.com/explore/6a9149f3000000001f01d20a?xsec_token=sample%3D",
		"https://www.pinterest.com/pin/123/",
	} {
		t.Run(link, func(t *testing.T) {
			for _, mode := range []struct {
				compose   string
				skipAudio bool
				commands  int
			}{{"none", false, 1}, {"horizontal", false, 2}, {"horizontal", true, 1}} {
				if err := os.WriteFile(argsPath, nil, 0600); err != nil {
					t.Fatal(err)
				}
				step := &types.SubtitleTaskStepParam{Link: link, TaskBasePath: dir, TaskPtr: &types.SubtitleTask{},
					EmbedSubtitleVideoType: mode.compose, SkipAudio: mode.skipAudio}
				if err := (Service{}).linkToFile(context.Background(), step); err != nil {
					t.Fatal(err)
				}
				arguments, err := os.ReadFile(argsPath)
				if err != nil {
					t.Fatal(err)
				}
				args := string(arguments)
				if strings.Count(args, "--no-playlist\n") != mode.commands || strings.Count(args, link+"\n") != mode.commands {
					t.Fatalf("expected %d single-video downloads with source parameters, got %s", mode.commands, args)
				}
				if !strings.Contains(args, "--proxy\nhttp://127.0.0.1:7897\n") || !strings.Contains(args, "--ffmpeg-location\n/custom/ffmpeg\n") {
					t.Fatalf("missing proxy or ffmpeg arguments: %s", args)
				}
				if !mode.skipAudio && (!strings.Contains(args, "bestaudio/best\n") || step.AudioFilePath == "") {
					t.Fatalf("missing audio extraction: %s", args)
				}
				if mode.compose != "none" && !strings.Contains(args, "--recode-video\nmp4\n") {
					t.Fatalf("missing video conversion: %s", args)
				}
			}
		})
	}
}

func TestAdditionalPlatformRejectsUnsupportedSources(t *testing.T) {
	for _, link := range []string{"https://www.instagram.com/creator/", "https://www.pinterest.com/creator/",
		"https://notpinterest.com/pin/123/", "https://instagram.com.example.com/reel/abc/", "http://www.instagram.com/reel/abc/"} {
		if isAdditionalVideoSource(link) {
			t.Fatalf("accepted unsupported source: %s", link)
		}
	}
}
