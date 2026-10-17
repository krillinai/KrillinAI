package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"math"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// Both tools write machine-readable progress to stdout. Stderr stays captured
// for error classification, and paths/URLs from logs never become UI messages.
type progressOutput struct {
	tail    []byte
	pending []byte
	onLine  func(string)
}

func (w *progressOutput) Write(p []byte) (int, error) {
	const limit = 64 * 1024
	w.tail = append(w.tail, p...)
	if len(w.tail) > limit {
		w.tail = w.tail[len(w.tail)-limit:]
	}
	w.pending = append(w.pending, p...)
	for {
		end := bytes.IndexByte(w.pending, '\n')
		if end < 0 {
			break
		}
		w.onLine(strings.TrimSpace(string(w.pending[:end])))
		w.pending = w.pending[end+1:]
	}
	if len(w.pending) > limit {
		w.pending = nil
	}
	return len(p), nil
}

func runProgressCommand(cmd *exec.Cmd, onLine func(string)) ([]byte, error) {
	output := &progressOutput{onLine: onLine}
	var stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = output, &stderr
	err := cmd.Run()
	if len(output.pending) > 0 {
		onLine(strings.TrimSpace(string(output.pending)))
	}
	return append(append(output.tail, '\n'), stderr.Bytes()...), err
}

type mediaDownloadProgress struct {
	Downloaded int64   `json:"downloaded_bytes"`
	Total      int64   `json:"total_bytes"`
	Estimate   int64   `json:"total_bytes_estimate"`
	Speed      float64 `json:"speed"`
	ETA        float64 `json:"eta"`
	Status     string  `json:"status"`
}

func runMediaDownload(ctx context.Context, args []string, observers ...func(mediaDownloadProgress)) ([]byte, error) {
	if len(observers) == 0 {
		return storage.YtdlpCommandContext(ctx, args...).CombinedOutput()
	}
	args = append(append([]string{}, args...), "--newline", "--progress", "--progress-delta", "1", "--progress-template", "download:OC_DOWNLOAD:%(progress)j")
	return runProgressCommand(storage.YtdlpCommandContext(ctx, args...), func(line string) {
		if !strings.HasPrefix(line, "OC_DOWNLOAD:") {
			return
		}
		var progress mediaDownloadProgress
		if json.Unmarshal([]byte(strings.TrimPrefix(line, "OC_DOWNLOAD:")), &progress) != nil || progress.Downloaded < 0 {
			return
		}
		for _, report := range observers {
			if report != nil {
				report(progress)
			}
		}
	})
}

func downloadProgressReporter(task *types.SubtitleTask, audio bool, start, end int) func(mediaDownloadProgress) {
	label := "视频"
	if audio {
		label = "音频"
	}
	task.ReportProgress(types.TaskProgress{Phase: "downloading_media", Percent: start, Message: "正在连接来源，准备下载" + label})
	return func(p mediaDownloadProgress) {
		total := p.Total
		if total <= 0 {
			total = p.Estimate
		}
		message := fmt.Sprintf("正在下载%s：%.1f MiB", label, float64(p.Downloaded)/(1024*1024))
		percent := start
		if total > 0 {
			percent += int(math.Min(1.0, float64(p.Downloaded)/float64(total)) * float64(end-start))
			message += fmt.Sprintf(" / %.1f MiB", float64(total)/(1024*1024))
		}
		if p.Speed > 0 {
			message += fmt.Sprintf("；%.1f MiB/s", p.Speed/(1024*1024))
		}
		if p.ETA > 0 {
			message += fmt.Sprintf("；预计剩余 %d 秒", int(math.Ceil(p.ETA)))
		}
		if p.Status == "finished" {
			message = label + "下载完成，正在处理媒体文件"
		}
		task.ReportProgress(types.TaskProgress{Phase: "downloading_media", Percent: percent, Message: message})
	}
}

func runFFmpegProgress(ctx context.Context, args []string, input, phase, label string, task *types.SubtitleTask, start, end int) ([]byte, error) {
	duration := 0.0
	if strings.TrimSpace(input) != "" {
		probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		data, err := exec.CommandContext(probeCtx, storage.FfprobePath, "-i", input, "-show_entries", "format=duration", "-v", "quiet", "-of", "csv=p=0").Output()
		cancel()
		if err == nil {
			duration, _ = strconv.ParseFloat(strings.TrimSpace(string(data)), 64)
		}
	}
	// A failed duration probe must never prevent the actual media operation.
	if math.IsNaN(duration) || math.IsInf(duration, 0) || duration < 0 {
		duration = 0
	}
	task.ReportProgress(types.TaskProgress{Phase: phase, Percent: start, Message: label})
	args = append([]string{"-progress", "pipe:1", "-nostats"}, args...)
	last := -1
	return runProgressCommand(exec.CommandContext(ctx, storage.FfmpegPath, args...), func(line string) {
		value, ok := strings.CutPrefix(line, "out_time_us=")
		if !ok {
			return
		}
		micros, err := strconv.ParseInt(value, 10, 64)
		if err != nil || micros < 0 {
			return
		}
		seconds := int(micros / 1_000_000)
		if seconds <= last {
			return
		}
		last = seconds
		progress := types.TaskProgress{Phase: phase, Percent: start, Message: fmt.Sprintf("%s；已处理 %d 秒", label, seconds)}
		if duration > 0 {
			progress.Percent += int(math.Min(float64(micros)/1_000_000/duration, 1) * float64(end-start))
			progress.Message += fmt.Sprintf(" / %d 秒", int(math.Ceil(duration)))
		}
		task.ReportProgress(progress)
	})
}
