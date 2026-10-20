package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"krillin-ai/internal/types"
	"os/exec"
	"strings"
	"time"
)

//go:embed translation_nlp_runtime.py
var translationNLPRuntimeWorker string

// 每个翻译任务独立拥有进程，任务结束/取消时回收；不向并发任务泄漏状态。
type translationNLPRuntime struct {
	ctx    context.Context
	cancel context.CancelFunc
	gate   chan struct{}
	worker string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	output *json.Decoder
}

func newTranslationNLPRuntime(ctx context.Context) *translationNLPRuntime {
	work, cancel := context.WithCancel(ctx)
	definitions := strings.Split(translationNLPWorker, "\nif __name__ == \"__main__\":")[0] + "\n" + strings.Split(translationSourceCutWorker, "\nif __name__ == \"__main__\":")[0]
	return &translationNLPRuntime{ctx: work, cancel: cancel, gate: make(chan struct{}, 1), worker: definitions + "\n" + translationNLPRuntimeWorker}
}

func (r *translationNLPRuntime) stop() {
	if r.cmd != nil {
		_ = r.stdin.Close()
		_ = r.cmd.Process.Kill()
		_ = r.cmd.Wait()
		r.cmd, r.stdin, r.output = nil, nil, nil
	}
}

func (r *translationNLPRuntime) close() {
	r.cancel()
	r.gate <- struct{}{}
	defer func() { <-r.gate }()
	r.stop()
}

func (r *translationNLPRuntime) exchange(ctx context.Context, data []byte) ([]byte, error) {
	work, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	select {
	case r.gate <- struct{}{}:
	case <-work.Done():
		return nil, work.Err()
	case <-r.ctx.Done():
		return nil, r.ctx.Err()
	}
	defer func() { <-r.gate }()
	if err := r.ctx.Err(); err != nil {
		return nil, err
	}
	if err := work.Err(); err != nil {
		return nil, err
	}
	if r.cmd == nil {
		command := exec.CommandContext(r.ctx, translationNLPPython(), "-u", "-I", "-c", r.worker)
		input, err := command.StdinPipe()
		if err != nil {
			return nil, err
		}
		output, err := command.StdoutPipe()
		if err != nil {
			_ = input.Close()
			return nil, err
		}
		if err := command.Start(); err != nil {
			_ = input.Close()
			_ = output.Close()
			return nil, err
		}
		r.cmd, r.stdin, r.output = command, input, json.NewDecoder(output)
	}
	process := r.cmd.Process
	killed := make(chan struct{})
	stopCancel := context.AfterFunc(work, func() { _ = process.Kill(); close(killed) })
	var response json.RawMessage
	_, err := r.stdin.Write(append(data, '\n'))
	if err == nil {
		err = r.output.Decode(&response)
	}
	if !stopCancel() {
		<-killed
	}
	if work.Err() != nil {
		err = work.Err()
	}
	if err != nil {
		r.stop()
		return nil, err
	}
	return response, nil
}

func (r *translationNLPRuntime) segment(ctx context.Context, texts []string, language types.StandardLanguageCode) (translationNLPResult, error) {
	data, _ := json.Marshal(map[string]any{"language": types.NormalizeLanguage(string(language)), "texts": texts})
	output, err := r.exchange(ctx, data)
	var result translationNLPResult
	if err == nil {
		err = json.Unmarshal(output, &result)
	}
	return result, err
}

func (r *translationNLPRuntime) boundaries(ctx context.Context, requests []translationNLPBoundaryRequest, language types.StandardLanguageCode) ([]string, error) {
	data, _ := json.Marshal(map[string]any{"language": language, "boundary_requests": requests})
	output, err := r.exchange(ctx, data)
	if err != nil {
		return nil, err
	}
	var result struct {
		Unavailable string   `json:"unavailable"`
		Issues      []string `json:"issues"`
	}
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, err
	}
	if result.Unavailable != "" {
		return make([]string, len(requests)), nil
	}
	if len(result.Issues) != len(requests) {
		return nil, fmt.Errorf("源文切口句法响应缺失")
	}
	return result.Issues, nil
}
