package updater

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestAssetNameForCurrentPlatform(t *testing.T) {
	got, err := assetName("2.0.3", "darwin", "arm64")
	if err != nil {
		t.Fatalf("assetName() error = %v", err)
	}
	if got != "KrillinAI-cli_2.0.3_macOS_arm64" {
		t.Fatalf("asset name = %q", got)
	}

	got, err = assetName("v2.0.3", "linux", "amd64")
	if err != nil {
		t.Fatalf("assetName() error = %v", err)
	}
	if got != "KrillinAI-cli_2.0.3_Linux_x86_64" {
		t.Fatalf("asset name = %q", got)
	}

	got, err = assetName("v2.0.3", "windows", "amd64")
	if err != nil {
		t.Fatalf("assetName() error = %v", err)
	}
	if got != "KrillinAI-cli_2.0.3_Windows.exe" {
		t.Fatalf("asset name = %q", got)
	}
}

func TestResolveAssetFindsMatchingReleaseAsset(t *testing.T) {
	release := Release{
		TagName: "v2.0.3",
		Assets: []Asset{
			{Name: "KrillinAI_2.0.3_macOS_arm64", BrowserDownloadURL: "server"},
			{Name: "KrillinAI-cli_2.0.3_macOS_arm64", BrowserDownloadURL: "cli"},
		},
	}

	asset, err := resolveAsset(release, "darwin", "arm64")
	if err != nil {
		t.Fatalf("resolveAsset() error = %v", err)
	}
	if asset.BrowserDownloadURL != "cli" {
		t.Fatalf("download url = %q, want cli", asset.BrowserDownloadURL)
	}
}

func TestRunSkipsSameVersionWithoutForce(t *testing.T) {
	runner := &fakeRunner{
		release: Release{TagName: "v2.0.3"},
	}
	result, err := Run(context.Background(), Request{
		Repo:           "krillinai/KrillinAI",
		CurrentVersion: "v2.0.3",
	}, runner)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Updated {
		t.Fatal("Updated = true, want false")
	}
	if len(runner.downloads) != 0 {
		t.Fatalf("downloads = %#v, want none", runner.downloads)
	}
}

func TestRunDownloadsAndReplacesCurrentExecutable(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "krillinai-cli")
	if err := os.WriteFile(target, []byte("old"), 0755); err != nil {
		t.Fatal(err)
	}
	runner := &fakeRunner{
		executable: target,
		release: Release{
			TagName: "v2.0.3",
			Assets: []Asset{{
				Name:               "KrillinAI-cli_2.0.3_macOS_arm64",
				BrowserDownloadURL: "https://example.test/KrillinAI-cli_2.0.3_macOS_arm64",
			}},
		},
	}

	result, err := Run(context.Background(), Request{
		Repo:           "krillinai/KrillinAI",
		CurrentVersion: "v2.0.2",
		Target:         target,
		GOOS:           "darwin",
		GOARCH:         "arm64",
	}, runner)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !result.Updated {
		t.Fatal("Updated = false, want true")
	}
	if result.Version != "v2.0.3" {
		t.Fatalf("Version = %q", result.Version)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "new binary" {
		t.Fatalf("target content = %q", data)
	}
	wantDownloads := []string{"https://example.test/KrillinAI-cli_2.0.3_macOS_arm64"}
	if !reflect.DeepEqual(runner.downloads, wantDownloads) {
		t.Fatalf("downloads = %#v, want %#v", runner.downloads, wantDownloads)
	}
}

func TestRunDownloadsWindowsUpdateBesideExecutable(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "krillinai-cli.exe")
	if err := os.WriteFile(target, []byte("old"), 0755); err != nil {
		t.Fatal(err)
	}
	runner := &fakeRunner{
		executable: target,
		release: Release{
			TagName: "v2.0.3",
			Assets: []Asset{{
				Name:               "KrillinAI-cli_2.0.3_Windows.exe",
				BrowserDownloadURL: "https://example.test/KrillinAI-cli_2.0.3_Windows.exe",
			}},
		},
	}

	result, err := Run(context.Background(), Request{
		Repo:           "krillinai/KrillinAI",
		CurrentVersion: "v2.0.2",
		Target:         target,
		GOOS:           "windows",
		GOARCH:         "amd64",
	}, runner)
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Updated {
		t.Fatal("Updated = true, want false because Windows requires manual replacement")
	}
	if result.Target != target+".download" {
		t.Fatalf("Target = %q, want downloaded sidecar", result.Target)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "old" {
		t.Fatalf("original target content = %q, want old", data)
	}
	data, err = os.ReadFile(target + ".download")
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "new binary" {
		t.Fatalf("downloaded content = %q", data)
	}
}

type fakeRunner struct {
	executable string
	release    Release
	downloads  []string
}

func (f *fakeRunner) CurrentExecutable() (string, error) {
	if f.executable == "" {
		return "", errors.New("missing executable")
	}
	return f.executable, nil
}

func (f *fakeRunner) FetchRelease(context.Context, string, string) (Release, error) {
	return f.release, nil
}

func (f *fakeRunner) DownloadFile(_ context.Context, url, path string) error {
	f.downloads = append(f.downloads, url)
	return os.WriteFile(path, []byte("new binary"), 0644)
}

func (f *fakeRunner) ReplaceExecutable(source, target string) error {
	return os.Rename(source, target)
}
