package opencreatorapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

var identifierPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)

type PathGuard struct {
	root string
}

type artifactIndex struct {
	Artifacts []artifactIndexEntry `json:"artifacts"`
}

type artifactIndexEntry struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"`
	RelativePath string `json:"relativePath"`
}

func NewPathGuard(root string) (*PathGuard, error) {
	if root == "" {
		return nil, errors.New("jobs root is required")
	}
	abs, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0700); err != nil {
		return nil, err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return nil, err
	}
	return &PathGuard{root: real}, nil
}

func (g *PathGuard) Root() string {
	return g.root
}

func (g *PathGuard) JobDir(jobID string) (string, error) {
	if err := validateIdentifier(jobID); err != nil {
		return "", err
	}
	return g.resolveDirect(g.root, jobID)
}

func (g *PathGuard) TaskDir(jobID, taskID string) (string, error) {
	jobDir, err := g.JobDir(jobID)
	if err != nil {
		return "", err
	}
	if err := validateIdentifier(taskID); err != nil {
		return "", err
	}
	return g.resolveDirect(filepath.Join(jobDir, "krillin-tasks"), taskID)
}

func (g *PathGuard) StageWorkdir(jobID, stageRunID string) (string, error) {
	jobDir, err := g.JobDir(jobID)
	if err != nil {
		return "", err
	}
	if err := validateIdentifier(stageRunID); err != nil {
		return "", err
	}
	return g.resolveDirect(filepath.Join(jobDir, "stages"), stageRunID, "krillin")
}

func (g *PathGuard) ResolveArtifact(jobID, artifactID string) (string, string, error) {
	if err := validateIdentifier(artifactID); err != nil {
		return "", "", err
	}
	jobDir, err := g.JobDir(jobID)
	if err != nil {
		return "", "", err
	}
	data, err := os.ReadFile(filepath.Join(jobDir, "artifact-index.json"))
	if err != nil {
		return "", "", fmt.Errorf("artifact index unavailable: %w", err)
	}
	var index artifactIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return "", "", fmt.Errorf("artifact index invalid: %w", err)
	}
	for _, entry := range index.Artifacts {
		if entry.ID != artifactID {
			continue
		}
		if entry.RelativePath == "" || filepath.IsAbs(entry.RelativePath) {
			return "", "", errors.New("artifact path must be job-relative")
		}
		candidate := filepath.Join(jobDir, filepath.FromSlash(entry.RelativePath))
		real, err := filepath.EvalSymlinks(candidate)
		if err != nil {
			return "", "", err
		}
		if err := ensureInside(jobDir, real); err != nil {
			return "", "", err
		}
		info, err := os.Stat(real)
		if err != nil || !info.Mode().IsRegular() {
			return "", "", errors.New("artifact is not a regular file")
		}
		return real, entry.Kind, nil
	}
	return "", "", errors.New("artifact is not registered for this job")
}

func (g *PathGuard) RelativeToRoot(path string) (string, error) {
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	if err := ensureInside(g.root, real); err != nil {
		return "", err
	}
	relative, err := filepath.Rel(g.root, real)
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(relative), nil
}

func (g *PathGuard) resolveDirect(parent string, parts ...string) (string, error) {
	for _, part := range parts {
		if err := validateIdentifier(part); err != nil {
			return "", err
		}
	}
	if err := os.MkdirAll(parent, 0700); err != nil {
		return "", err
	}
	realParent, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", err
	}
	if err := ensureInside(g.root, realParent); err != nil {
		return "", err
	}
	path := filepath.Join(append([]string{realParent}, parts...)...)
	if err := os.MkdirAll(path, 0700); err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	if err := ensureInside(g.root, real); err != nil {
		return "", err
	}
	return real, nil
}

func validateIdentifier(value string) error {
	if !identifierPattern.MatchString(value) {
		return errors.New("invalid identifier")
	}
	return nil
}

func ensureInside(root, path string) error {
	relative, err := filepath.Rel(root, path)
	if err != nil || relative == ".." || filepath.IsAbs(relative) {
		return errors.New("path escapes authorized root")
	}
	if len(relative) >= 3 && relative[:3] == ".."+string(filepath.Separator) {
		return errors.New("path escapes authorized root")
	}
	return nil
}
