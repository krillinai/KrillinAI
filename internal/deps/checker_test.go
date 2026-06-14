package deps

import (
	"errors"
	"krillin-ai/log"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestMain(m *testing.M) {
	log.Logger = zap.NewNop()
	os.Exit(m.Run())
}

func TestResolveYtDlpUpdatesExistingBundledBinaryToStableRelease(t *testing.T) {
	env := testYtDlpEnv(t, "darwin")
	env.stat = func(path string) (os.FileInfo, error) {
		if path == "./bin/yt-dlp" {
			return nil, nil
		}
		return nil, os.ErrNotExist
	}
	var commands [][]string
	env.runCommand = func(name string, args ...string) ([]byte, error) {
		commands = append(commands, append([]string{name}, args...))
		return []byte("Updated yt-dlp"), nil
	}
	var downloads []string
	env.downloadFile = func(url, path, proxy string) error {
		downloads = append(downloads, url)
		return nil
	}

	path, err := resolveYtDlpDependency(env)
	if err != nil {
		t.Fatalf("resolveYtDlpDependency() error = %v", err)
	}
	if path != "./bin/yt-dlp" {
		t.Fatalf("path = %q, want bundled yt-dlp", path)
	}
	wantCommands := [][]string{{"./bin/yt-dlp", "--update-to", "stable"}}
	if !reflect.DeepEqual(commands, wantCommands) {
		t.Fatalf("commands = %#v, want %#v", commands, wantCommands)
	}
	if len(downloads) != 0 {
		t.Fatalf("downloadFile called for existing updatable binary: %#v", downloads)
	}
}

func TestResolveYtDlpSkipsUpdateWhenCheckedRecently(t *testing.T) {
	env := testYtDlpEnv(t, "darwin")
	dir := t.TempDir()
	statePath := filepath.Join(dir, ".yt-dlp-last-check")
	env.lastCheckPath = statePath
	env.now = func() time.Time {
		return time.Date(2026, 6, 14, 9, 0, 0, 0, time.UTC)
	}
	if err := os.WriteFile(statePath, []byte("2026-06-14T08:00:00Z"), 0644); err != nil {
		t.Fatal(err)
	}
	env.stat = func(path string) (os.FileInfo, error) {
		if path == "./bin/yt-dlp" {
			return nil, nil
		}
		return os.Stat(path)
	}
	var commands [][]string
	env.runCommand = func(name string, args ...string) ([]byte, error) {
		commands = append(commands, append([]string{name}, args...))
		return []byte("Updated yt-dlp"), nil
	}

	path, err := resolveYtDlpDependency(env)
	if err != nil {
		t.Fatalf("resolveYtDlpDependency() error = %v", err)
	}
	if path != "./bin/yt-dlp" {
		t.Fatalf("path = %q, want bundled yt-dlp", path)
	}
	if len(commands) != 0 {
		t.Fatalf("commands = %#v, want no update check when checked recently", commands)
	}
}

func TestResolveYtDlpChecksUpdateAfterCacheExpires(t *testing.T) {
	env := testYtDlpEnv(t, "darwin")
	dir := t.TempDir()
	statePath := filepath.Join(dir, ".yt-dlp-last-check")
	env.lastCheckPath = statePath
	env.now = func() time.Time {
		return time.Date(2026, 6, 14, 9, 0, 0, 0, time.UTC)
	}
	if err := os.WriteFile(statePath, []byte("2026-06-13T08:59:59Z"), 0644); err != nil {
		t.Fatal(err)
	}
	env.stat = func(path string) (os.FileInfo, error) {
		if path == "./bin/yt-dlp" {
			return nil, nil
		}
		return os.Stat(path)
	}
	var commands [][]string
	env.runCommand = func(name string, args ...string) ([]byte, error) {
		commands = append(commands, append([]string{name}, args...))
		return []byte("yt-dlp is up to date"), nil
	}

	path, err := resolveYtDlpDependency(env)
	if err != nil {
		t.Fatalf("resolveYtDlpDependency() error = %v", err)
	}
	if path != "./bin/yt-dlp" {
		t.Fatalf("path = %q, want bundled yt-dlp", path)
	}
	wantCommands := [][]string{{"./bin/yt-dlp", "--update-to", "stable"}}
	if !reflect.DeepEqual(commands, wantCommands) {
		t.Fatalf("commands = %#v, want %#v", commands, wantCommands)
	}
	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(data); got != "2026-06-14T09:00:00Z" {
		t.Fatalf("last check timestamp = %q", got)
	}
}

func TestResolveYtDlpDownloadsLatestStableReleaseWhenMissing(t *testing.T) {
	env := testYtDlpEnv(t, "darwin")
	env.lookPath = func(name string) (string, error) {
		return "", errors.New("not found")
	}
	env.stat = func(path string) (os.FileInfo, error) {
		return nil, os.ErrNotExist
	}
	var mkdirs []string
	env.mkdirAll = func(path string, perm os.FileMode) error {
		mkdirs = append(mkdirs, path)
		return nil
	}
	var downloads [][2]string
	env.downloadFile = func(url, path, proxy string) error {
		downloads = append(downloads, [2]string{url, path})
		return nil
	}
	var chmods []string
	env.chmod = func(path string, mode os.FileMode) error {
		chmods = append(chmods, path)
		return nil
	}

	path, err := resolveYtDlpDependency(env)
	if err != nil {
		t.Fatalf("resolveYtDlpDependency() error = %v", err)
	}
	if path != "./bin/yt-dlp" {
		t.Fatalf("path = %q, want bundled yt-dlp", path)
	}
	if !reflect.DeepEqual(mkdirs, []string{"./bin"}) {
		t.Fatalf("mkdirs = %#v", mkdirs)
	}
	wantDownloads := [][2]string{{
		"https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
		"./bin/yt-dlp",
	}}
	if !reflect.DeepEqual(downloads, wantDownloads) {
		t.Fatalf("downloads = %#v, want %#v", downloads, wantDownloads)
	}
	if !reflect.DeepEqual(chmods, []string{"./bin/yt-dlp"}) {
		t.Fatalf("chmods = %#v", chmods)
	}
}

func TestResolveYtDlpFallsBackToBundledStableReleaseWhenSystemUpdateFails(t *testing.T) {
	env := testYtDlpEnv(t, "darwin")
	env.lookPath = func(name string) (string, error) {
		return "/usr/local/bin/yt-dlp", nil
	}
	env.runCommand = func(name string, args ...string) ([]byte, error) {
		return []byte("installed by package manager"), errors.New("cannot update")
	}
	var mkdirs []string
	env.mkdirAll = func(path string, perm os.FileMode) error {
		mkdirs = append(mkdirs, path)
		return nil
	}
	var downloads [][2]string
	env.downloadFile = func(url, path, proxy string) error {
		downloads = append(downloads, [2]string{url, path})
		return nil
	}

	path, err := resolveYtDlpDependency(env)
	if err != nil {
		t.Fatalf("resolveYtDlpDependency() error = %v", err)
	}
	if path != "./bin/yt-dlp" {
		t.Fatalf("path = %q, want bundled yt-dlp after system update failure", path)
	}
	if !reflect.DeepEqual(mkdirs, []string{"./bin"}) {
		t.Fatalf("mkdirs = %#v", mkdirs)
	}
	wantDownloads := [][2]string{{
		"https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
		"./bin/yt-dlp",
	}}
	if !reflect.DeepEqual(downloads, wantDownloads) {
		t.Fatalf("downloads = %#v, want %#v", downloads, wantDownloads)
	}
}

func testYtDlpEnv(t *testing.T, goos string) ytdlpDependencyEnv {
	t.Helper()
	return ytdlpDependencyEnv{
		goos:  goos,
		proxy: "",
		now: func() time.Time {
			return time.Date(2026, 6, 14, 9, 0, 0, 0, time.UTC)
		},
		lastCheckPath: filepath.Join(t.TempDir(), ".yt-dlp-last-check"),
		lookPath: func(name string) (string, error) {
			return "", errors.New("not found")
		},
		stat: func(path string) (os.FileInfo, error) {
			return nil, os.ErrNotExist
		},
		mkdirAll: func(path string, perm os.FileMode) error {
			return nil
		},
		downloadFile: func(url, path, proxy string) error {
			return nil
		},
		chmod: func(path string, mode os.FileMode) error {
			return nil
		},
		runCommand: func(name string, args ...string) ([]byte, error) {
			return nil, nil
		},
	}
}
