package deps

import (
	"encoding/json"
	"errors"
	"krillin-ai/config"
	"krillin-ai/internal/resourcepath"
	"krillin-ai/internal/storage"
	"krillin-ai/log"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestPackagedYtDlpInterpreterCommand(t *testing.T) {
	root := t.TempDir()
	t.Setenv(resourcepath.RootEnv, root)
	previousPath, previousArgs := storage.YtdlpPath, storage.YtdlpPrefixArgs
	t.Cleanup(func() { storage.YtdlpPath, storage.YtdlpPrefixArgs = previousPath, previousArgs })
	if err := os.MkdirAll(filepath.Join(root, "bin"), 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		if err := os.WriteFile(filepath.Join(root, "bin", name), []byte("fixture"), 0755); err != nil {
			t.Fatal(err)
		}
	}
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	prefix := []string{executable, "-I", "-B", filepath.Join(root, "path with spaces & symbols", "yt-dlp")}
	encoded, _ := json.Marshal(prefix)
	t.Setenv("OPENCREATOR_YT_DLP_COMMAND", string(encoded))
	if err := configurePackagedCoreDependencies(); err != nil {
		t.Fatal(err)
	}
	want := append(append([]string{}, prefix...), "--version")
	if got := storage.YtdlpCommand("--version").Args; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
	if got := storage.YtdlpCommand("--dump-json").Args; got[len(got)-1] != "--dump-json" {
		t.Fatal(got)
	}
	t.Setenv("OPENCREATOR_YT_DLP_COMMAND", `["relative-python", "script"]`)
	if err := configurePackagedCoreDependencies(); err == nil {
		t.Fatal("relative interpreter accepted")
	}
	t.Run("real Python runtime", func(t *testing.T) {
		command := os.Getenv("KRILLIN_TEST_YTDLP_COMMAND")
		if command == "" {
			t.Skip("optional real Python yt-dlp integration")
		}
		t.Setenv("OPENCREATOR_YT_DLP_COMMAND", command)
		if err := configurePackagedCoreDependencies(); err != nil {
			t.Fatal(err)
		}
		if output, err := storage.YtdlpCommand("--version").CombinedOutput(); err != nil {
			t.Fatalf("Python yt-dlp failed: %v: %s", err, output)
		}
		url := "https://raw.githubusercontent.com/ggml-org/whisper.cpp/v1.8.3/samples/jfk.wav"
		destination := filepath.Join(root, "downloaded audio.wav")
		if output, err := storage.YtdlpCommand("--no-progress", "--output", destination, url).CombinedOutput(); err != nil {
			t.Fatalf("Python yt-dlp download failed: %v: %s", err, output)
		}
		data, err := os.ReadFile(destination)
		if err != nil || len(data) < 4 || string(data[:4]) != "RIFF" {
			t.Fatal("downloaded audio is invalid")
		}
	})
}

func TestMain(m *testing.M) {
	log.Logger = zap.NewNop()
	os.Exit(m.Run())
}

func TestConfigurePackagedTranscriptionDependencyUsesWhisperKitArchiveDirectory(t *testing.T) {
	root := t.TempDir()
	t.Setenv(resourcepath.RootEnv, root)

	executableName := "whisperkit-cli"
	if runtime.GOOS == "windows" {
		executableName += ".exe"
	}
	executablePath := filepath.Join(root, "bin", executableName)
	modelPath := filepath.Join(
		root,
		"models",
		"whisperkit",
		"openai_whisper-large-v2",
	)
	if err := os.MkdirAll(filepath.Dir(executablePath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(executablePath, []byte("test"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(modelPath, 0755); err != nil {
		t.Fatal(err)
	}

	previousTranscribe := config.Conf.Transcribe
	previousWhisperKitPath := storage.WhisperKitPath
	t.Cleanup(func() {
		config.Conf.Transcribe = previousTranscribe
		storage.WhisperKitPath = previousWhisperKitPath
	})
	config.Conf.Transcribe.Provider = "whisperkit"
	config.Conf.Transcribe.Whisperkit.Model = "large-v2"

	if err := configurePackagedTranscriptionDependency(); err != nil {
		t.Fatalf("configurePackagedTranscriptionDependency() error = %v", err)
	}
	if storage.WhisperKitPath != executablePath {
		t.Fatalf(
			"WhisperKitPath = %q, want %q",
			storage.WhisperKitPath,
			executablePath,
		)
	}
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
