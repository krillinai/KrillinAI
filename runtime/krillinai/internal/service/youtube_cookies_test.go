package service

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestAppendCookiesArgsSkipsMissingCookieFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cookies.txt")
	args := appendCookiesArgs([]string{"--skip-download"}, path)

	want := []string{"--skip-download"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("appendCookiesArgs() = %v, want %v", args, want)
	}
}

func TestAppendCookiesArgsSkipsEmptyCookieFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cookies.txt")
	if err := os.WriteFile(path, nil, 0644); err != nil {
		t.Fatalf("write empty cookie file: %v", err)
	}

	args := appendCookiesArgs([]string{"--skip-download"}, path)

	want := []string{"--skip-download"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("appendCookiesArgs() = %v, want %v", args, want)
	}
}

func TestAppendCookiesArgsSkipsNonNetscapeCookieFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cookies.txt")
	if err := os.WriteFile(path, []byte("SID=abc123; Path=/; Domain=.youtube.com\n"), 0644); err != nil {
		t.Fatalf("write non-netscape cookie file: %v", err)
	}

	args := appendCookiesArgs([]string{"--skip-download"}, path)

	want := []string{"--skip-download"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("appendCookiesArgs() = %v, want %v", args, want)
	}
}

func TestAppendCookiesArgsUsesNetscapeCookieFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cookies.txt")
	content := "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tFALSE\t0\tVISITOR_INFO1_LIVE\tabc123\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write netscape cookie file: %v", err)
	}

	args := appendCookiesArgs([]string{"--skip-download"}, path)

	want := []string{"--skip-download", "--cookies", path}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("appendCookiesArgs() = %v, want %v", args, want)
	}
}
