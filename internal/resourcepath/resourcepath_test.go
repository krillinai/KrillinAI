package resourcepath

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveUsesConfiguredRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv(RootEnv, root)
	path, err := Resolve("bin", "ffmpeg")
	if err != nil {
		t.Fatal(err)
	}
	if path != filepath.Join(root, "bin", "ffmpeg") {
		t.Fatalf("path = %q", path)
	}
}

func TestRequireFileReturnsDependencyNotPackaged(t *testing.T) {
	t.Setenv(RootEnv, t.TempDir())
	if _, err := RequireFile("bin", "missing"); err == nil {
		t.Fatal("expected missing packaged dependency error")
	}
	_ = os.Getenv(OfflineEnv)
}
