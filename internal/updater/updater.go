package updater

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const DefaultRepo = "krillinai/KrillinAI"

type Request struct {
	Repo           string
	Version        string
	CurrentVersion string
	Target         string
	Force          bool
	GOOS           string
	GOARCH         string
}

type Result struct {
	Updated bool
	Version string
	Asset   string
	Target  string
	Message string
}

type Release struct {
	TagName string  `json:"tag_name"`
	Assets  []Asset `json:"assets"`
}

type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type Runner interface {
	CurrentExecutable() (string, error)
	FetchRelease(context.Context, string, string) (Release, error)
	DownloadFile(context.Context, string, string) error
	ReplaceExecutable(string, string) error
}

func Run(ctx context.Context, req Request, runner Runner) (Result, error) {
	if req.Repo == "" {
		req.Repo = DefaultRepo
	}
	if req.GOOS == "" {
		req.GOOS = runtime.GOOS
	}
	if req.GOARCH == "" {
		req.GOARCH = runtime.GOARCH
	}
	release, err := runner.FetchRelease(ctx, req.Repo, req.Version)
	if err != nil {
		return Result{}, err
	}
	if !req.Force && sameVersion(req.CurrentVersion, release.TagName) {
		return Result{
			Updated: false,
			Version: release.TagName,
			Message: "已经是最新版本",
		}, nil
	}
	target := req.Target
	if target == "" {
		var err error
		target, err = runner.CurrentExecutable()
		if err != nil {
			return Result{}, err
		}
	}
	asset, err := resolveAsset(release, req.GOOS, req.GOARCH)
	if err != nil {
		return Result{}, err
	}
	tempPath := target + ".download"
	if err := runner.DownloadFile(ctx, asset.BrowserDownloadURL, tempPath); err != nil {
		_ = os.Remove(tempPath)
		return Result{}, err
	}
	if req.GOOS != "windows" {
		if err := os.Chmod(tempPath, 0755); err != nil {
			_ = os.Remove(tempPath)
			return Result{}, err
		}
	} else {
		return Result{
			Updated: false,
			Version: release.TagName,
			Asset:   asset.Name,
			Target:  tempPath,
			Message: fmt.Sprintf("Windows 不支持替换正在运行的可执行文件，新版本已下载到 %s，请退出程序后手动替换 %s", tempPath, target),
		}, nil
	}
	if err := runner.ReplaceExecutable(tempPath, target); err != nil {
		_ = os.Remove(tempPath)
		return Result{}, err
	}
	return Result{
		Updated: true,
		Version: release.TagName,
		Asset:   asset.Name,
		Target:  target,
		Message: "更新完成",
	}, nil
}

func resolveAsset(release Release, goos, goarch string) (Asset, error) {
	name, err := assetName(release.TagName, goos, goarch)
	if err != nil {
		return Asset{}, err
	}
	for _, asset := range release.Assets {
		if asset.Name == name {
			return asset, nil
		}
	}
	return Asset{}, fmt.Errorf("release %s does not contain asset %s", release.TagName, name)
}

func assetName(version, goos, goarch string) (string, error) {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	if version == "" {
		return "", errors.New("version is required")
	}
	switch goos {
	case "darwin":
		return fmt.Sprintf("KrillinAI-cli_%s_macOS_%s", version, goarch), nil
	case "linux":
		return fmt.Sprintf("KrillinAI-cli_%s_Linux_%s", version, releaseArch(goarch)), nil
	case "windows":
		arch := ""
		switch goarch {
		case "amd64", "":
			arch = ""
		case "386":
			arch = "_i386"
		default:
			arch = "_" + goarch
		}
		return fmt.Sprintf("KrillinAI-cli_%s_Windows%s.exe", version, arch), nil
	default:
		return "", fmt.Errorf("unsupported platform: %s/%s", goos, goarch)
	}
}

func releaseArch(goarch string) string {
	switch goarch {
	case "amd64", "":
		return "x86_64"
	case "386":
		return "i386"
	default:
		return goarch
	}
}

func sameVersion(current, latest string) bool {
	current = strings.TrimPrefix(strings.TrimSpace(current), "v")
	latest = strings.TrimPrefix(strings.TrimSpace(latest), "v")
	return current != "" && current == latest
}

type HTTPRunner struct {
	Client *http.Client
}

func (r HTTPRunner) CurrentExecutable() (string, error) {
	return os.Executable()
}

func (r HTTPRunner) FetchRelease(ctx context.Context, repo, version string) (Release, error) {
	if repo == "" {
		repo = DefaultRepo
	}
	ref := "latest"
	if strings.TrimSpace(version) != "" {
		ref = "tags/" + strings.TrimSpace(version)
	}
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/%s", repo, ref)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	client := r.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return Release{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return Release{}, fmt.Errorf("fetch release failed: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return Release{}, err
	}
	if release.TagName == "" {
		return Release{}, errors.New("release response missing tag_name")
	}
	return release, nil
}

func (r HTTPRunner) DownloadFile(ctx context.Context, url, path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := r.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("download update failed: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	out, err := os.Create(path)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, resp.Body)
	return err
}

func (r HTTPRunner) ReplaceExecutable(source, target string) error {
	return os.Rename(source, target)
}
