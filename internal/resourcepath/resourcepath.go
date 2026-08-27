package resourcepath

import (
	"fmt"
	"os"
	"path/filepath"
)

const RootEnv = "KRILLINAI_RESOURCE_ROOT"
const OfflineEnv = "KRILLINAI_OFFLINE_DEPENDENCIES"

func Offline() bool {
	return os.Getenv(OfflineEnv) == "1"
}

func Root() (string, bool, error) {
	value := os.Getenv(RootEnv)
	if value == "" {
		return "", false, nil
	}
	root, err := filepath.Abs(filepath.Clean(value))
	if err != nil {
		return "", false, err
	}
	return root, true, nil
}

func Resolve(parts ...string) (string, error) {
	root, configured, err := Root()
	if err != nil {
		return "", err
	}
	if !configured {
		return filepath.Join(parts...), nil
	}
	path := filepath.Join(append([]string{root}, parts...)...)
	resolved, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(root, resolved)
	if err != nil || relative == ".." || filepath.IsAbs(relative) {
		return "", fmt.Errorf("resource path escapes root")
	}
	return resolved, nil
}

func RequireFile(parts ...string) (string, error) {
	path, err := Resolve(parts...)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", fmt.Errorf("dependency_not_packaged: %s", filepath.Join(parts...))
	}
	return path, nil
}

func RequireDir(parts ...string) (string, error) {
	path, err := Resolve(parts...)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("dependency_not_packaged: %s", filepath.Join(parts...))
	}
	return path, nil
}
