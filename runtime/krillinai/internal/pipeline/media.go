package pipeline

import (
	"context"
	"errors"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
)

func ensureSourceVideo(ctx context.Context, svc StageService, manifest *Manifest, sourceURL, mediaWorkdir string, report func(string, int, string)) (string, error) {
	if info, err := os.Stat(manifest.Outputs.OriginVideo); err == nil && info.Mode().IsRegular() && info.Size() > 0 {
		return manifest.Outputs.OriginVideo, nil
	}
	if mediaWorkdir == "" {
		mediaWorkdir = manifest.Workdir
	}
	if err := os.MkdirAll(mediaWorkdir, 0700); err != nil {
		return "", err
	}
	cached := filepath.Join(mediaWorkdir, types.SubtitleTaskVideoFileName)
	marker := filepath.Join(mediaWorkdir, ".source-ready")
	if input, err := os.ReadFile(marker); err == nil && string(input) == sourceURL {
		if info, err := os.Stat(cached); err == nil && info.Mode().IsRegular() && info.Size() > 0 {
			manifest.Outputs.OriginVideo = cached
			return cached, manifest.Save()
		}
	}
	step := &types.SubtitleTaskStepParam{
		TaskId:                 manifest.TaskID,
		TaskPtr:                &types.SubtitleTask{TaskId: manifest.TaskID, Status: types.SubtitleTaskStatusProcessing},
		TaskBasePath:           mediaWorkdir,
		Link:                   sourceURL,
		SkipAudio:              true,
		EmbedSubtitleVideoType: "all",
	}
	if report != nil {
		report("preparing_original_media", 5, "字幕已保留，正在为视频合成下载原始视频")
		step.TaskPtr.SetProgressReporter(func(percent uint8) {
			report("preparing_original_media", int(percent), "字幕已保留，正在为视频合成下载原始视频")
		})
	}
	if err := svc.PrepareMedia(ctx, step); err != nil {
		return "", err
	}
	info, err := os.Stat(step.InputVideoPath)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return "", errors.New("source video was not produced")
	}
	manifest.Outputs.OriginVideo = step.InputVideoPath
	if err := os.WriteFile(marker, []byte(sourceURL), 0600); err != nil {
		return "", err
	}
	return step.InputVideoPath, manifest.Save()
}
