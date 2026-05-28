# KrillinAI CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 KrillinAI 增加阶段化 CLI，使 Agent 能稳定调用字幕生成、TTS、横屏渲染、竖屏渲染、封面生成和完整 pipeline。

**Architecture:** 新增 `internal/pipeline` 作为同步 Pipeline Core，负责 manifest、阶段请求、产物路径、回退策略和 JSON 结果；新增 `internal/cli` 和 `cmd/cli` 作为命令行入口；在 `internal/service` 中增加薄导出包装，复用现有下载、字幕、TTS、渲染逻辑。第一批完成字幕/TTS/横竖屏/pipeline 的可运行闭环，封面接口随后接入。

**Tech Stack:** Go 1.22、标准库 `flag`/`encoding/json`/`os/exec`、现有 `internal/service`、`internal/types`、`config`、`deps`、`yt-dlp`、`ffmpeg`、`ffprobe`。

---

## 文件结构

新增文件：

- `cmd/cli/main.go`：CLI 二进制入口，初始化日志、加载配置、检查依赖、分发命令。
- `internal/cli/commands.go`：子命令解析和执行分发，保持 CLI 参数处理与 pipeline 业务分离。
- `internal/cli/commands_test.go`：验证参数解析、退出码映射、JSON 输出。
- `internal/pipeline/types.go`：阶段枚举、请求结构、响应结构、错误结构、产物结构、字幕来源和 line-mode 常量。
- `internal/pipeline/manifest.go`：manifest 读写、路径补齐、阶段状态更新。
- `internal/pipeline/manifest_test.go`：manifest 读写和参数覆盖测试。
- `internal/pipeline/srt.go`：SRT block 解析、双语字幕目标行抽取、目标 SRT 写入。
- `internal/pipeline/srt_test.go`：line-mode 和多行字幕测试。
- `internal/pipeline/workdir.go`：任务 ID、工作目录创建、输入路径规范化。
- `internal/pipeline/workdir_test.go`：workdir 默认值和显式路径测试。
- `internal/pipeline/service_adapter.go`：把现有 `service.Service` 适配成 pipeline 阶段接口。
- `internal/pipeline/subtitle.go`：字幕阶段编排，包含平台字幕优先和回退转录策略。
- `internal/pipeline/subtitle_test.go`：字幕来源策略和回退语义测试。
- `internal/pipeline/tts.go`：TTS 阶段编排，支持 `--line-mode` 和 `--input-srt`。
- `internal/pipeline/tts_test.go`：TTS 输入抽取、失败 index 记录测试。
- `internal/pipeline/render.go`：横屏/竖屏渲染阶段编排，显式输出 bilingual/dubbed 文件名。
- `internal/pipeline/render_test.go`：渲染请求、输出命名、竖屏警告测试。
- `internal/pipeline/cover.go`：封面阶段接口和 prompt 模板渲染。
- `internal/pipeline/cover_test.go`：prompt 变量替换和 provider 请求测试。
- `internal/pipeline/pipeline.go`：完整 pipeline 编排。
- `internal/pipeline/pipeline_test.go`：输出集合到阶段顺序的映射测试。
- `internal/service/stage_exports.go`：导出既有 service 阶段能力的薄包装。
- `internal/service/render_stage.go`：从现有 `srt_embed.go` 抽出可指定输入字幕和输出文件名的渲染函数。
- `internal/service/render_stage_test.go`：验证渲染命令构造，不跑真实 ffmpeg。
- `pkg/image/openai_compatible.go`：OpenAI-compatible image provider 客户端。
- `pkg/image/openai_compatible_test.go`：image 请求 JSON 和错误处理测试。

修改文件：

- `config/config.go`：新增 `[image]` 配置结构；保留现有默认配置行为。
- `config/config-example.toml`：新增 image provider 示例配置。
- `internal/service/srt_embed.go`：让原有 `embedSubtitles` 复用新的指定字幕渲染函数。
- `internal/service/subtitle_service.go`：后续可迁移到 Pipeline Core；第一批只修正 YouTube fallback 行为时需要最小改动。
- `.goreleaser.yaml`：增加 CLI build。
- `README.md` 和 `docs/zh/README.md`：增加 CLI 快速使用说明。

---

### Task 1: 定义 Pipeline 基础类型和 JSON 响应

**Files:**
- Create: `internal/pipeline/types.go`
- Test: `internal/pipeline/types_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"encoding/json"
	"testing"
)

func TestResponseJSONShape(t *testing.T) {
	resp := Response{
		OK:      true,
		Stage:   StageSubtitle,
		Workdir: "tasks/demo",
		TaskID:  "demo",
		Outputs: Outputs{
			OriginSRT:    "tasks/demo/origin_language_srt.srt",
			TargetSRT:    "tasks/demo/target_language_srt.srt",
			BilingualSRT: "tasks/demo/bilingual_srt.srt",
		},
		Warnings:   []string{"人工字幕未找到，使用自动字幕"},
		DurationMS: 123,
	}

	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if got["ok"] != true {
		t.Fatalf("ok = %v, want true", got["ok"])
	}
	if got["stage"] != "subtitle" {
		t.Fatalf("stage = %v, want subtitle", got["stage"])
	}
	outputs := got["outputs"].(map[string]any)
	if outputs["bilingual_srt"] != "tasks/demo/bilingual_srt.srt" {
		t.Fatalf("bilingual_srt = %v", outputs["bilingual_srt"])
	}
}

func TestExitCodeForErrorKind(t *testing.T) {
	cases := []struct {
		err  *Error
		want int
	}{
		{&Error{Kind: ErrorKindUsage}, 1},
		{&Error{Kind: ErrorKindRetryable}, 2},
		{&Error{Kind: ErrorKindDependency}, 3},
	}
	for _, tc := range cases {
		if got := ExitCodeForError(tc.err); got != tc.want {
			t.Fatalf("ExitCodeForError(%q) = %d, want %d", tc.err.Kind, got, tc.want)
		}
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run 'TestResponseJSONShape|TestExitCodeForErrorKind' -count=1`

Expected: FAIL，错误包含 `undefined: Response`、`undefined: StageSubtitle` 或 `undefined: ExitCodeForError`。

- [ ] **Step 3: 实现基础类型**

```go
package pipeline

type Stage string

const (
	StageSubtitle         Stage = "subtitle"
	StageTTS              Stage = "tts"
	StageRenderHorizontal Stage = "render-horizontal"
	StageRenderVertical   Stage = "render-vertical"
	StageCover            Stage = "cover"
	StagePipeline         Stage = "pipeline"
)

type CaptionSource string

const (
	CaptionSourceAny     CaptionSource = "any"
	CaptionSourceManual  CaptionSource = "manual"
	CaptionSourceAuto    CaptionSource = "auto"
	CaptionSourceWhisper CaptionSource = "whisper"
)

type LineMode string

const (
	LineModeTargetOnly            LineMode = "target-only"
	LineModeBilingualTargetTop    LineMode = "bilingual-target-top"
	LineModeBilingualTargetBottom LineMode = "bilingual-target-bottom"
)

type ErrorKind string

const (
	ErrorKindUsage      ErrorKind = "usage"
	ErrorKindRetryable  ErrorKind = "retryable"
	ErrorKindDependency ErrorKind = "dependency"
	ErrorKindInternal   ErrorKind = "internal"
)

type Error struct {
	Kind      ErrorKind `json:"kind"`
	Code      string    `json:"code"`
	Message   string    `json:"message"`
	Retryable bool      `json:"retryable"`
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func ExitCodeForError(err *Error) int {
	if err == nil {
		return 0
	}
	switch err.Kind {
	case ErrorKindUsage:
		return 1
	case ErrorKindRetryable:
		return 2
	case ErrorKindDependency:
		return 3
	default:
		return 1
	}
}

type Outputs struct {
	OriginVideo       string `json:"origin_video,omitempty"`
	OriginAudio       string `json:"origin_audio,omitempty"`
	OriginSRT         string `json:"origin_srt,omitempty"`
	TargetSRT         string `json:"target_srt,omitempty"`
	BilingualSRT      string `json:"bilingual_srt,omitempty"`
	ShortOriginSRT    string `json:"short_origin_srt,omitempty"`
	ShortOriginMixedSRT string `json:"short_origin_mixed_srt,omitempty"`
	TTSAudio          string `json:"tts_audio,omitempty"`
	VideoWithTTS      string `json:"video_with_tts,omitempty"`
	HorizontalVideo   string `json:"horizontal_video,omitempty"`
	VerticalVideo     string `json:"vertical_video,omitempty"`
	TransferredVideo  string `json:"transferred_vertical_video,omitempty"`
	OriginCover       string `json:"origin_cover,omitempty"`
	GeneratedCover    string `json:"generated_cover,omitempty"`
	FinalCoverPrompt  string `json:"cover_prompt,omitempty"`
	OriginText        string `json:"origin_text,omitempty"`
	TargetText        string `json:"target_text,omitempty"`
}

type Response struct {
	OK            bool          `json:"ok"`
	Stage         Stage         `json:"stage"`
	Workdir       string        `json:"workdir,omitempty"`
	TaskID        string        `json:"task_id,omitempty"`
	CaptionSource string        `json:"caption_source,omitempty"`
	Inputs        map[string]string `json:"inputs,omitempty"`
	Outputs       Outputs       `json:"outputs,omitempty"`
	Warnings      []string      `json:"warnings,omitempty"`
	FailedIndexes []int         `json:"failed_indexes,omitempty"`
	Error         *Error        `json:"error,omitempty"`
	DurationMS    int64         `json:"duration_ms,omitempty"`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/types.go internal/pipeline/types_test.go && go test ./internal/pipeline -run 'TestResponseJSONShape|TestExitCodeForErrorKind' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/types.go internal/pipeline/types_test.go
git commit -m "feat: add pipeline response types"
```

---

### Task 2: 实现 manifest 读写和路径补齐

**Files:**
- Create: `internal/pipeline/manifest.go`
- Test: `internal/pipeline/manifest_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManifestRoundTrip(t *testing.T) {
	dir := t.TempDir()
	m := NewManifest("demo", dir)
	m.InputURL = "https://www.youtube.com/watch?v=abc"
	m.OriginLanguage = "en"
	m.TargetLanguage = "zh_cn"
	m.Outputs.BilingualSRT = filepath.Join(dir, "bilingual_srt.srt")
	m.MarkStage(StageSubtitle, true, "")

	if err := m.Save(); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	loaded, err := LoadManifest(dir)
	if err != nil {
		t.Fatalf("LoadManifest() error = %v", err)
	}
	if loaded.TaskID != "demo" {
		t.Fatalf("TaskID = %q, want demo", loaded.TaskID)
	}
	if loaded.Stages[string(StageSubtitle)].OK != true {
		t.Fatalf("subtitle stage not marked ok")
	}
}

func TestApplyDefaultOutputs(t *testing.T) {
	dir := t.TempDir()
	m := NewManifest("demo", dir)
	m.ApplyDefaultOutputs()

	want := filepath.Join(dir, "target_language_srt.srt")
	if m.Outputs.TargetSRT != want {
		t.Fatalf("TargetSRT = %q, want %q", m.Outputs.TargetSRT, want)
	}
	if _, err := os.Stat(filepath.Join(dir, "output")); err != nil {
		t.Fatalf("output dir was not created: %v", err)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run 'TestManifestRoundTrip|TestApplyDefaultOutputs' -count=1`

Expected: FAIL，错误包含 `undefined: NewManifest` 或 `undefined: LoadManifest`。

- [ ] **Step 3: 实现 manifest**

实现内容：

```go
package pipeline

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const ManifestFileName = "krillinai_manifest.json"

type StageStatus struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	Updated string `json:"updated,omitempty"`
}

type Manifest struct {
	TaskID         string                 `json:"task_id"`
	Workdir        string                 `json:"workdir"`
	InputURL       string                 `json:"input_url,omitempty"`
	OriginLanguage string                 `json:"origin_language,omitempty"`
	TargetLanguage string                 `json:"target_language,omitempty"`
	CaptionSource  string                 `json:"caption_source,omitempty"`
	Provider       map[string]string      `json:"provider,omitempty"`
	Outputs        Outputs                `json:"outputs"`
	Warnings       []string               `json:"warnings,omitempty"`
	FailedIndexes  []int                  `json:"failed_indexes,omitempty"`
	Stages         map[string]StageStatus `json:"stages"`
}

func NewManifest(taskID, workdir string) *Manifest {
	return &Manifest{
		TaskID:   taskID,
		Workdir:  workdir,
		Provider: map[string]string{},
		Stages:   map[string]StageStatus{},
	}
}

func ManifestPath(workdir string) string {
	return filepath.Join(workdir, ManifestFileName)
}

func LoadManifest(workdir string) (*Manifest, error) {
	data, err := os.ReadFile(ManifestPath(workdir))
	if err != nil {
		return nil, err
	}
	var m Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	if m.Provider == nil {
		m.Provider = map[string]string{}
	}
	if m.Stages == nil {
		m.Stages = map[string]StageStatus{}
	}
	return &m, nil
}

func (m *Manifest) Save() error {
	if err := os.MkdirAll(m.Workdir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ManifestPath(m.Workdir), append(data, '\n'), 0644)
}

func (m *Manifest) ApplyDefaultOutputs() error {
	if err := os.MkdirAll(filepath.Join(m.Workdir, "output"), 0755); err != nil {
		return err
	}
	m.Outputs.OriginVideo = filepath.Join(m.Workdir, "origin_video.mp4")
	m.Outputs.OriginAudio = filepath.Join(m.Workdir, "origin_audio.mp3")
	m.Outputs.OriginSRT = filepath.Join(m.Workdir, "origin_language_srt.srt")
	m.Outputs.TargetSRT = filepath.Join(m.Workdir, "target_language_srt.srt")
	m.Outputs.BilingualSRT = filepath.Join(m.Workdir, "bilingual_srt.srt")
	m.Outputs.ShortOriginSRT = filepath.Join(m.Workdir, "short_origin_srt.srt")
	m.Outputs.ShortOriginMixedSRT = filepath.Join(m.Workdir, "short_origin_mixed_srt.srt")
	m.Outputs.TTSAudio = filepath.Join(m.Workdir, "tts_final_audio.wav")
	m.Outputs.VideoWithTTS = filepath.Join(m.Workdir, "video_with_tts.mp4")
	m.Outputs.HorizontalVideo = filepath.Join(m.Workdir, "horizontal_bilingual.mp4")
	m.Outputs.VerticalVideo = filepath.Join(m.Workdir, "vertical_bilingual.mp4")
	m.Outputs.TransferredVideo = filepath.Join(m.Workdir, "transferred_vertical_video.mp4")
	m.Outputs.OriginCover = filepath.Join(m.Workdir, "origin_cover.jpg")
	m.Outputs.GeneratedCover = filepath.Join(m.Workdir, "generated_cover.png")
	m.Outputs.FinalCoverPrompt = filepath.Join(m.Workdir, "cover_prompt.final.txt")
	m.Outputs.OriginText = filepath.Join(m.Workdir, "output", "origin_language.txt")
	m.Outputs.TargetText = filepath.Join(m.Workdir, "output", "target_language.txt")
	return nil
}

func (m *Manifest) MarkStage(stage Stage, ok bool, msg string) {
	m.Stages[string(stage)] = StageStatus{OK: ok, Error: msg}
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/manifest.go internal/pipeline/manifest_test.go && go test ./internal/pipeline -run 'TestManifestRoundTrip|TestApplyDefaultOutputs' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/manifest.go internal/pipeline/manifest_test.go
git commit -m "feat: add pipeline manifest"
```

---

### Task 3: 实现工作目录、任务 ID 和输入路径规范化

**Files:**
- Create: `internal/pipeline/workdir.go`
- Test: `internal/pipeline/workdir_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveWorkdirExplicit(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "custom")
	taskID, workdir, err := ResolveWorkdir("https://www.youtube.com/watch?v=abc123", dir)
	if err != nil {
		t.Fatalf("ResolveWorkdir() error = %v", err)
	}
	if workdir != dir {
		t.Fatalf("workdir = %q, want %q", workdir, dir)
	}
	if taskID == "" {
		t.Fatalf("taskID is empty")
	}
}

func TestResolveWorkdirDefault(t *testing.T) {
	taskID, workdir, err := ResolveWorkdir("https://www.youtube.com/watch?v=abc123", "")
	if err != nil {
		t.Fatalf("ResolveWorkdir() error = %v", err)
	}
	if !strings.HasPrefix(workdir, filepath.Join("tasks", taskID)) {
		t.Fatalf("workdir = %q does not start with tasks/taskID %q", workdir, taskID)
	}
}

func TestNormalizeLocalInput(t *testing.T) {
	got := NormalizeInput("demo.mp4")
	if got != "local:demo.mp4" {
		t.Fatalf("NormalizeInput() = %q, want local:demo.mp4", got)
	}
	if got := NormalizeInput("local:demo.mp4"); got != "local:demo.mp4" {
		t.Fatalf("NormalizeInput(local) = %q", got)
	}
	if got := NormalizeInput("https://www.bilibili.com/video/BV123"); got != "https://www.bilibili.com/video/BV123" {
		t.Fatalf("NormalizeInput(url) = %q", got)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run 'TestResolveWorkdir|TestNormalizeLocalInput' -count=1`

Expected: FAIL，错误包含 `undefined: ResolveWorkdir` 或 `undefined: NormalizeInput`。

- [ ] **Step 3: 实现工作目录工具**

实现内容：

```go
package pipeline

import (
	"fmt"
	"krillin-ai/pkg/util"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func ResolveWorkdir(input, explicit string) (string, string, error) {
	taskID := makeTaskID(input)
	workdir := explicit
	if workdir == "" {
		workdir = filepath.Join("tasks", taskID)
	}
	if err := os.MkdirAll(filepath.Join(workdir, "output"), 0755); err != nil {
		return "", "", err
	}
	return taskID, workdir, nil
}

func makeTaskID(input string) string {
	trimmed := strings.TrimSpace(input)
	last := trimmed
	if parsed, err := url.Parse(trimmed); err == nil && parsed.Path != "" {
		parts := strings.Split(strings.Trim(parsed.Path, "/"), "/")
		last = parts[len(parts)-1]
		if v := parsed.Query().Get("v"); v != "" {
			last = v
		}
	}
	last = strings.ReplaceAll(last, " ", "")
	runes := []rune(last)
	if len(runes) > 16 {
		runes = runes[:16]
	}
	base := util.SanitizePathName(string(runes))
	if base == "" {
		base = "task"
	}
	return fmt.Sprintf("%s_%s", base, util.GenerateRandStringWithUpperLowerNum(4))
}

func NormalizeInput(input string) string {
	if strings.HasPrefix(input, "local:") ||
		strings.HasPrefix(input, "http://") ||
		strings.HasPrefix(input, "https://") {
		return input
	}
	return "local:" + input
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/workdir.go internal/pipeline/workdir_test.go && go test ./internal/pipeline -run 'TestResolveWorkdir|TestNormalizeLocalInput' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/workdir.go internal/pipeline/workdir_test.go
git commit -m "feat: add pipeline workdir handling"
```

---

### Task 4: 实现 SRT 解析与 line-mode 目标字幕抽取

**Files:**
- Create: `internal/pipeline/srt.go`
- Test: `internal/pipeline/srt_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExtractTargetOnlyKeepsSingleLineBlocks(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "target.srt")
	out := filepath.Join(dir, "tts.srt")
	content := "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractTargetSRT(in, out, LineModeTargetOnly); err != nil {
		t.Fatalf("ExtractTargetSRT() error = %v", err)
	}
	got, _ := os.ReadFile(out)
	if string(got) != content {
		t.Fatalf("output = %q, want %q", string(got), content)
	}
}

func TestExtractBilingualTargetTop(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "bilingual.srt")
	out := filepath.Join(dir, "tts.srt")
	content := "1\n00:00:00,000 --> 00:00:01,000\n你好\nhello\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractTargetSRT(in, out, LineModeBilingualTargetTop); err != nil {
		t.Fatalf("ExtractTargetSRT() error = %v", err)
	}
	got, _ := os.ReadFile(out)
	if !strings.Contains(string(got), "\n你好\n\n") {
		t.Fatalf("target top not extracted: %q", string(got))
	}
	if strings.Contains(string(got), "hello") {
		t.Fatalf("origin line leaked into target output: %q", string(got))
	}
}

func TestExtractBilingualTargetBottom(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "bilingual.srt")
	out := filepath.Join(dir, "tts.srt")
	content := "1\n00:00:00,000 --> 00:00:01,000\nhello\n你好\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractTargetSRT(in, out, LineModeBilingualTargetBottom); err != nil {
		t.Fatalf("ExtractTargetSRT() error = %v", err)
	}
	got, _ := os.ReadFile(out)
	if !strings.Contains(string(got), "\n你好\n\n") {
		t.Fatalf("target bottom not extracted: %q", string(got))
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run 'TestExtract' -count=1`

Expected: FAIL，错误包含 `undefined: ExtractTargetSRT`。

- [ ] **Step 3: 实现 SRT 抽取**

实现内容：

```go
package pipeline

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

type srtBlock struct {
	Index     string
	Timestamp string
	Lines     []string
}

func ExtractTargetSRT(input, output string, mode LineMode) error {
	blocks, err := readSRTBlocks(input)
	if err != nil {
		return err
	}
	var b strings.Builder
	for _, block := range blocks {
		text, err := targetLine(block.Lines, mode)
		if err != nil {
			return err
		}
		b.WriteString(block.Index)
		b.WriteString("\n")
		b.WriteString(block.Timestamp)
		b.WriteString("\n")
		b.WriteString(text)
		b.WriteString("\n\n")
	}
	return os.WriteFile(output, []byte(b.String()), 0644)
}

func readSRTBlocks(path string) ([]srtBlock, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var blocks []srtBlock
	var current []string
	scanner := bufio.NewScanner(f)
	flush := func() error {
		if len(current) == 0 {
			return nil
		}
		if len(current) < 3 {
			return fmt.Errorf("invalid srt block: %q", strings.Join(current, "\\n"))
		}
		blocks = append(blocks, srtBlock{
			Index:     current[0],
			Timestamp: current[1],
			Lines:     append([]string(nil), current[2:]...),
		})
		current = nil
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			if err := flush(); err != nil {
				return nil, err
			}
			continue
		}
		current = append(current, line)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if err := flush(); err != nil {
		return nil, err
	}
	return blocks, nil
}

func targetLine(lines []string, mode LineMode) (string, error) {
	switch mode {
	case LineModeTargetOnly:
		return strings.Join(lines, " "), nil
	case LineModeBilingualTargetTop:
		if len(lines) < 2 {
			return "", fmt.Errorf("bilingual target top requires at least two subtitle lines")
		}
		return lines[0], nil
	case LineModeBilingualTargetBottom:
		if len(lines) < 2 {
			return "", fmt.Errorf("bilingual target bottom requires at least two subtitle lines")
		}
		return lines[len(lines)-1], nil
	default:
		return "", fmt.Errorf("unsupported line mode: %s", mode)
	}
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/srt.go internal/pipeline/srt_test.go && go test ./internal/pipeline -run 'TestExtract' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/srt.go internal/pipeline/srt_test.go
git commit -m "feat: add srt target extraction"
```

---

### Task 5: 给现有 service 增加阶段导出包装

**Files:**
- Create: `internal/service/stage_exports.go`
- Test: `internal/service/stage_exports_test.go`

- [ ] **Step 1: 写失败测试**

```go
package service

import (
	"context"
	"krillin-ai/internal/types"
	"testing"
)

func TestStageExportMethodsExist(t *testing.T) {
	var svc Service
	param := &types.SubtitleTaskStepParam{}

	_ = svc.PrepareMedia
	_ = svc.GenerateSubtitlesFromAudio
	_ = svc.GenerateSpeechFromSRT
	_ = svc.FinalizeSubtitleResults

	if false {
		_ = svc.PrepareMedia(context.Background(), param)
		_ = svc.GenerateSubtitlesFromAudio(context.Background(), param)
		_ = svc.GenerateSpeechFromSRT(context.Background(), param)
		_ = svc.FinalizeSubtitleResults(context.Background(), param)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/service -run TestStageExportMethodsExist -count=1`

Expected: FAIL，错误包含 `svc.PrepareMedia undefined`。

- [ ] **Step 3: 实现薄包装**

实现内容：

```go
package service

import (
	"context"
	"krillin-ai/internal/types"
)

func (s Service) PrepareMedia(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.linkToFile(ctx, stepParam)
}

func (s Service) GenerateSubtitlesFromAudio(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.audioToSubtitle(ctx, stepParam)
}

func (s Service) GenerateSpeechFromSRT(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.srtFileToSpeech(ctx, stepParam)
}

func (s Service) FinalizeSubtitleResults(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	return s.uploadSubtitles(ctx, stepParam)
}

func (s Service) DownloadYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	return s.YouTubeSubtitleSrv.downloadYouTubeSubtitle(ctx, req)
}

func (s Service) ProcessYouTubeSubtitle(ctx context.Context, req *YoutubeSubtitleReq) (string, error) {
	return s.YouTubeSubtitleSrv.processYouTubeSubtitle(ctx, req)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/service/stage_exports.go internal/service/stage_exports_test.go && go test ./internal/service -run TestStageExportMethodsExist -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/service/stage_exports.go internal/service/stage_exports_test.go
git commit -m "feat: expose service stage methods"
```

---

### Task 6: 抽出可指定字幕文件和输出名的视频渲染函数

**Files:**
- Create: `internal/service/render_stage.go`
- Create: `internal/service/render_stage_test.go`
- Modify: `internal/service/srt_embed.go`

- [ ] **Step 1: 写失败测试**

```go
package service

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildEmbedSubtitleArgsUsesRequestedSubtitleAndOutput(t *testing.T) {
	req := RenderVideoRequest{
		Workdir:      "tasks/demo",
		InputVideo:   "tasks/demo/origin_video.mp4",
		SubtitleFile: "tasks/demo/target_language_srt.srt",
		OutputFile:   "tasks/demo/output/horizontal_dubbed.mp4",
		Horizontal:   true,
	}
	args, assPath := buildEmbedSubtitleArgs(req)
	joined := strings.Join(args, " ")
	if !strings.Contains(assPath, filepath.Join("tasks", "demo")) {
		t.Fatalf("assPath = %q does not use workdir", assPath)
	}
	if !strings.Contains(joined, "tasks/demo/origin_video.mp4") {
		t.Fatalf("args do not contain input video: %v", args)
	}
	if !strings.Contains(joined, "tasks/demo/output/horizontal_dubbed.mp4") {
		t.Fatalf("args do not contain output file: %v", args)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/service -run TestBuildEmbedSubtitleArgsUsesRequestedSubtitleAndOutput -count=1`

Expected: FAIL，错误包含 `undefined: RenderVideoRequest` 或 `undefined: buildEmbedSubtitleArgs`。

- [ ] **Step 3: 实现渲染请求和命令构造**

实现内容：

```go
package service

import (
	"context"
	"fmt"
	"krillin-ai/internal/storage"
	"krillin-ai/internal/types"
	"os/exec"
	"path/filepath"
	"strings"
)

type RenderVideoRequest struct {
	Workdir      string
	InputVideo   string
	SubtitleFile string
	OutputFile   string
	Horizontal   bool
	StepParam    *types.SubtitleTaskStepParam
}

func (s Service) RenderVideo(ctx context.Context, req RenderVideoRequest) (string, error) {
	assPath := filepath.Join(req.Workdir, "formatted_subtitles.ass")
	stepParam := req.StepParam
	if stepParam == nil {
		stepParam = &types.SubtitleTaskStepParam{TaskBasePath: req.Workdir}
	}
	if err := srtToAss(req.SubtitleFile, assPath, req.Horizontal, stepParam); err != nil {
		return "", fmt.Errorf("RenderVideo srtToAss error: %w", err)
	}
	args, _ := buildEmbedSubtitleArgs(req)
	cmd := exec.Command(storage.FfmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("RenderVideo ffmpeg error: %w, output: %s", err, string(output))
	}
	return req.OutputFile, nil
}

func buildEmbedSubtitleArgs(req RenderVideoRequest) ([]string, string) {
	assPath := filepath.Join(req.Workdir, "formatted_subtitles.ass")
	ass := strings.ReplaceAll(assPath, "\\", "/")
	return []string{
		"-y",
		"-i", req.InputVideo,
		"-vf", fmt.Sprintf("ass=%s", ass),
		"-c:a", "aac",
		"-b:a", "192k",
		req.OutputFile,
	}, assPath
}
```

- [ ] **Step 4: 修改旧渲染入口复用新函数**

在 `internal/service/srt_embed.go` 的旧 `embedSubtitles(stepParam, isHorizontal, withTts)` 内部，只保留输出文件名、输入视频选择，然后调用 `Service{}.RenderVideo` 不合适，因为没有 receiver。推荐把旧的 package-level `embedSubtitles` 改为 `renderSubtitleFile`，再让 `Service.RenderVideo` 与旧入口共同调用它。

目标形状：

```go
func renderSubtitleFile(req RenderVideoRequest) (string, error) {
	assPath := filepath.Join(req.Workdir, "formatted_subtitles.ass")
	stepParam := req.StepParam
	if stepParam == nil {
		stepParam = &types.SubtitleTaskStepParam{TaskBasePath: req.Workdir}
	}
	if err := srtToAss(req.SubtitleFile, assPath, req.Horizontal, stepParam); err != nil {
		return "", fmt.Errorf("renderSubtitleFile srtToAss error: %w", err)
	}
	args, _ := buildEmbedSubtitleArgs(req)
	cmd := exec.Command(storage.FfmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("renderSubtitleFile ffmpeg error: %w, output: %s", err, string(output))
	}
	return req.OutputFile, nil
}
```

旧入口调用：

```go
_, err := renderSubtitleFile(RenderVideoRequest{
	Workdir:      stepParam.TaskBasePath,
	InputVideo:   input,
	SubtitleFile: stepParam.BilingualSrtFilePath,
	OutputFile:   filepath.Join(stepParam.TaskBasePath, "output", outputFileName),
	Horizontal:   isHorizontal,
	StepParam:    stepParam,
})
return err
```

- [ ] **Step 5: 运行测试确认通过**

Run: `gofmt -w internal/service/render_stage.go internal/service/render_stage_test.go internal/service/srt_embed.go && go test ./internal/service -run 'TestBuildEmbedSubtitleArgsUsesRequestedSubtitleAndOutput|TestStageExportMethodsExist' -count=1`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add internal/service/render_stage.go internal/service/render_stage_test.go internal/service/srt_embed.go
git commit -m "feat: add explicit subtitle render stage"
```

---

### Task 7: 建立 pipeline service adapter 和 fake-friendly 接口

**Files:**
- Create: `internal/pipeline/service_adapter.go`
- Test: `internal/pipeline/service_adapter_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"krillin-ai/internal/service"
	"testing"
)

func TestNewServiceAdapterKeepsService(t *testing.T) {
	svc := &service.Service{}
	adapter := NewServiceAdapter(svc)
	if adapter == nil {
		t.Fatalf("NewServiceAdapter() returned nil")
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run TestNewServiceAdapterKeepsService -count=1`

Expected: FAIL，错误包含 `undefined: NewServiceAdapter`。

- [ ] **Step 3: 实现接口和 adapter**

实现内容：

```go
package pipeline

import (
	"context"
	"krillin-ai/internal/service"
	"krillin-ai/internal/types"
)

type StageService interface {
	PrepareMedia(context.Context, *types.SubtitleTaskStepParam) error
	GenerateSubtitlesFromAudio(context.Context, *types.SubtitleTaskStepParam) error
	GenerateSpeechFromSRT(context.Context, *types.SubtitleTaskStepParam) error
	FinalizeSubtitleResults(context.Context, *types.SubtitleTaskStepParam) error
	DownloadYouTubeSubtitle(context.Context, *service.YoutubeSubtitleReq) (string, error)
	ProcessYouTubeSubtitle(context.Context, *service.YoutubeSubtitleReq) (string, error)
	RenderVideo(context.Context, service.RenderVideoRequest) (string, error)
}

type ServiceAdapter struct {
	svc *service.Service
}

func NewServiceAdapter(svc *service.Service) *ServiceAdapter {
	return &ServiceAdapter{svc: svc}
}

func (a *ServiceAdapter) PrepareMedia(ctx context.Context, p *types.SubtitleTaskStepParam) error {
	return a.svc.PrepareMedia(ctx, p)
}

func (a *ServiceAdapter) GenerateSubtitlesFromAudio(ctx context.Context, p *types.SubtitleTaskStepParam) error {
	return a.svc.GenerateSubtitlesFromAudio(ctx, p)
}

func (a *ServiceAdapter) GenerateSpeechFromSRT(ctx context.Context, p *types.SubtitleTaskStepParam) error {
	return a.svc.GenerateSpeechFromSRT(ctx, p)
}

func (a *ServiceAdapter) FinalizeSubtitleResults(ctx context.Context, p *types.SubtitleTaskStepParam) error {
	return a.svc.FinalizeSubtitleResults(ctx, p)
}

func (a *ServiceAdapter) DownloadYouTubeSubtitle(ctx context.Context, r *service.YoutubeSubtitleReq) (string, error) {
	return a.svc.DownloadYouTubeSubtitle(ctx, r)
}

func (a *ServiceAdapter) ProcessYouTubeSubtitle(ctx context.Context, r *service.YoutubeSubtitleReq) (string, error) {
	return a.svc.ProcessYouTubeSubtitle(ctx, r)
}

func (a *ServiceAdapter) RenderVideo(ctx context.Context, r service.RenderVideoRequest) (string, error) {
	return a.svc.RenderVideo(ctx, r)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/service_adapter.go internal/pipeline/service_adapter_test.go && go test ./internal/pipeline -run TestNewServiceAdapterKeepsService -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/service_adapter.go internal/pipeline/service_adapter_test.go
git commit -m "feat: add pipeline service adapter"
```

---

### Task 8: 实现字幕阶段编排和真实 fallback 语义

**Files:**
- Create: `internal/pipeline/subtitle.go`
- Test: `internal/pipeline/subtitle_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"context"
	"errors"
	"krillin-ai/internal/service"
	"krillin-ai/internal/types"
	"testing"
)

type fakeStageService struct {
	downloadErr error
	processErr  error
	calls       []string
}

func (f *fakeStageService) PrepareMedia(context.Context, *types.SubtitleTaskStepParam) error {
	f.calls = append(f.calls, "prepare")
	return nil
}
func (f *fakeStageService) GenerateSubtitlesFromAudio(context.Context, *types.SubtitleTaskStepParam) error {
	f.calls = append(f.calls, "audio")
	return nil
}
func (f *fakeStageService) GenerateSpeechFromSRT(context.Context, *types.SubtitleTaskStepParam) error { return nil }
func (f *fakeStageService) FinalizeSubtitleResults(context.Context, *types.SubtitleTaskStepParam) error { return nil }
func (f *fakeStageService) DownloadYouTubeSubtitle(context.Context, *service.YoutubeSubtitleReq) (string, error) {
	f.calls = append(f.calls, "download-youtube")
	return "demo.en.vtt", f.downloadErr
}
func (f *fakeStageService) ProcessYouTubeSubtitle(context.Context, *service.YoutubeSubtitleReq) (string, error) {
	f.calls = append(f.calls, "process-youtube")
	return "bilingual_srt.srt", f.processErr
}
func (f *fakeStageService) RenderVideo(context.Context, service.RenderVideoRequest) (string, error) { return "", nil }

func TestGenerateSubtitlesFallsBackToAudioWhenAnySourceFails(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{downloadErr: errors.New("no captions")}
	req := SubtitleRequest{
		Input:         "https://www.youtube.com/watch?v=abc",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceAny,
	}
	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateSubtitles() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if got := fake.calls; len(got) != 3 || got[0] != "prepare" || got[1] != "download-youtube" || got[2] != "audio" {
		t.Fatalf("calls = %v", got)
	}
}

func TestGenerateSubtitlesManualDoesNotFallback(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{downloadErr: errors.New("no captions")}
	req := SubtitleRequest{
		Input:         "https://www.youtube.com/watch?v=abc",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceManual,
	}
	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err == nil {
		t.Fatalf("GenerateSubtitles() error = nil, want error")
	}
	if resp.OK {
		t.Fatalf("OK = true, want false")
	}
	if got := fake.calls; len(got) != 2 || got[1] != "download-youtube" {
		t.Fatalf("calls = %v", got)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run 'TestGenerateSubtitles' -count=1`

Expected: FAIL，错误包含 `undefined: SubtitleRequest` 或 `undefined: GenerateSubtitles`。

- [ ] **Step 3: 实现字幕阶段**

实现要点：

```go
type SubtitleRequest struct {
	Input         string
	Workdir       string
	TaskID        string
	OriginLang    string
	TargetLang    string
	UserLang      string
	CaptionSource CaptionSource
	BilingualTop  bool
	MaxWordOneLine int
}
```

`GenerateSubtitles` 必须：

1. 创建或加载 manifest。
2. 构造 `types.SubtitleTaskStepParam`，字段包括 `TaskBasePath`、`TaskId`、`Link`、`OriginLanguage`、`TargetLanguage`、`SubtitleResultType`、`VttSwitch`、`MaxWordOneLine`。
3. 调用 `svc.PrepareMedia`。
4. 当输入为 YouTube 且 `CaptionSource != whisper` 时，调用 `DownloadYouTubeSubtitle` 和 `ProcessYouTubeSubtitle`。
5. 当平台字幕失败且 `CaptionSource == any` 时，追加 warning 并调用 `GenerateSubtitlesFromAudio`。
6. 当 `CaptionSource == manual` 或 `auto` 且平台字幕失败时，返回 `ErrorKindRetryable`，不调用转录。
7. 写入 manifest 和 JSON response。

核心伪代码必须按下列语义落地：

```go
if isYouTube(req.Input) && req.CaptionSource != CaptionSourceWhisper {
	vttFile, err := svc.DownloadYouTubeSubtitle(ctx, youtubeReq)
	if err == nil {
		youtubeReq.VttFile = vttFile
		_, err = svc.ProcessYouTubeSubtitle(ctx, youtubeReq)
	}
	if err == nil {
		m.CaptionSource = "youtube_vtt"
		return success
	}
	if req.CaptionSource != CaptionSourceAny {
		return failedWithoutFallback
	}
	m.Warnings = append(m.Warnings, "平台字幕不可用，回退到转录")
}
err := svc.GenerateSubtitlesFromAudio(ctx, stepParam)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/subtitle.go internal/pipeline/subtitle_test.go && go test ./internal/pipeline -run 'TestGenerateSubtitles' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/subtitle.go internal/pipeline/subtitle_test.go
git commit -m "feat: add subtitle pipeline stage"
```

---

### Task 9: 实现 TTS 阶段编排

**Files:**
- Create: `internal/pipeline/tts.go`
- Test: `internal/pipeline/tts_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateTTSExtractsBilingualTargetBeforeSpeech(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "bilingual.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\nhello\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	fake := &fakeStageService{}
	req := TTSRequest{
		Workdir:  dir,
		TaskID:   "demo",
		InputSRT: input,
		LineMode: LineModeBilingualTargetBottom,
	}
	resp, err := GenerateTTS(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateTTS() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	extracted := filepath.Join(dir, "tts_input.srt")
	data, err := os.ReadFile(extracted)
	if err != nil {
		t.Fatalf("tts input not written: %v", err)
	}
	if string(data) != "1\n00:00:00,000 --> 00:00:01,000\n你好\n\n" {
		t.Fatalf("tts input = %q", string(data))
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run TestGenerateTTSExtractsBilingualTargetBeforeSpeech -count=1`

Expected: FAIL，错误包含 `undefined: TTSRequest` 或 `undefined: GenerateTTS`。

- [ ] **Step 3: 实现 TTS 阶段**

实现内容：

```go
type TTSRequest struct {
	Workdir          string
	TaskID           string
	InputSRT         string
	LineMode         LineMode
	Video            string
	Voice            string
	VoiceCloneSource string
}
```

`GenerateTTS` 必须：

1. 默认 `LineModeTargetOnly`。
2. 默认 `InputSRT` 为 manifest 的 `TargetSRT`。
3. 当 line-mode 不是 `target-only` 时，把抽取结果写到 `workdir/tts_input.srt`。
4. 构造 `types.SubtitleTaskStepParam`，设置 `EnableTts`、`TtsSourceFilePath`、`TtsResultFilePath`、`InputVideoPath`、`TtsVoiceCode`、`VoiceCloneAudioUrl`。
5. 调用 `svc.GenerateSpeechFromSRT`。
6. 写 manifest：`TTSAudio`、`VideoWithTTS`、失败 index。

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/tts.go internal/pipeline/tts_test.go && go test ./internal/pipeline -run TestGenerateTTSExtractsBilingualTargetBeforeSpeech -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/tts.go internal/pipeline/tts_test.go
git commit -m "feat: add tts pipeline stage"
```

---

### Task 10: 实现横屏和竖屏渲染阶段

**Files:**
- Create: `internal/pipeline/render.go`
- Test: `internal/pipeline/render_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import (
	"context"
	"krillin-ai/internal/service"
	"strings"
	"testing"
)

type renderFakeService struct {
	fakeStageService
	lastRender service.RenderVideoRequest
}

func (f *renderFakeService) RenderVideo(ctx context.Context, req service.RenderVideoRequest) (string, error) {
	f.lastRender = req
	return req.OutputFile, nil
}

func TestRenderHorizontalDubbedOutputName(t *testing.T) {
	dir := t.TempDir()
	fake := &renderFakeService{}
	req := RenderRequest{
		Workdir:      dir,
		TaskID:       "demo",
		Video:        "origin_video.mp4",
		Audio:        "tts_final_audio.wav",
		Subtitle:     "target_language_srt.srt",
		Horizontal:   true,
		Dubbed:       true,
	}
	resp, err := Render(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if !strings.HasSuffix(fake.lastRender.OutputFile, "horizontal_dubbed.mp4") {
		t.Fatalf("OutputFile = %q, want horizontal_dubbed.mp4 suffix", fake.lastRender.OutputFile)
	}
}

func TestRenderVerticalBilingualOutputName(t *testing.T) {
	dir := t.TempDir()
	fake := &renderFakeService{}
	req := RenderRequest{
		Workdir:    dir,
		TaskID:     "demo",
		Video:      "origin_video.mp4",
		Subtitle:   "short_origin_mixed_srt.srt",
		Horizontal: false,
		Dubbed:     false,
	}
	resp, err := Render(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if !strings.HasSuffix(fake.lastRender.OutputFile, "vertical_bilingual.mp4") {
		t.Fatalf("OutputFile = %q, want vertical_bilingual.mp4 suffix", fake.lastRender.OutputFile)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run 'TestRender' -count=1`

Expected: FAIL，错误包含 `undefined: RenderRequest` 或 `undefined: Render`。

- [ ] **Step 3: 实现渲染阶段**

实现内容：

```go
type RenderRequest struct {
	Workdir    string
	TaskID     string
	Video      string
	Audio      string
	Subtitle   string
	Horizontal bool
	Dubbed     bool
	MajorTitle string
	MinorTitle string
}
```

`Render` 必须：

1. 当 `Video` 为空时默认使用 manifest 的 `OriginVideo`。
2. 当 `Subtitle` 为空时：
   - 横屏双语默认 `bilingual_srt.srt`。
   - 横屏配音默认 `target_language_srt.srt`。
   - 竖屏双语默认 `short_origin_mixed_srt.srt`。
   - 竖屏配音默认 `target_language_srt.srt`。
3. 当 `Audio` 非空时，先确保 `video_with_tts.mp4` 存在或调用现有替换音频工具；第一版可以复用 TTS 阶段已生成的 `VideoWithTTS`。
4. 输出文件名：
   - `horizontal_bilingual.mp4`
   - `horizontal_dubbed.mp4`
   - `vertical_bilingual.mp4`
   - `vertical_dubbed.mp4`
5. 调用 `svc.RenderVideo`。
6. 写 manifest 和 stdout JSON。

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/render.go internal/pipeline/render_test.go && go test ./internal/pipeline -run 'TestRender' -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/render.go internal/pipeline/render_test.go
git commit -m "feat: add render pipeline stages"
```

---

### Task 11: 实现 pipeline 输出集合到阶段顺序的编排

**Files:**
- Create: `internal/pipeline/pipeline.go`
- Test: `internal/pipeline/pipeline_test.go`

- [ ] **Step 1: 写失败测试**

```go
package pipeline

import "testing"

func TestPlanOutputsMapsToStages(t *testing.T) {
	got, err := PlanOutputs("subtitle,tts,horizontal-bilingual,horizontal-dubbed,vertical-bilingual,vertical-dubbed")
	if err != nil {
		t.Fatalf("PlanOutputs() error = %v", err)
	}
	want := []Stage{
		StageSubtitle,
		StageTTS,
		StageRenderHorizontal,
		StageRenderHorizontal,
		StageRenderVertical,
		StageRenderVertical,
	}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("stage[%d] = %s, want %s", i, got[i], want[i])
		}
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/pipeline -run TestPlanOutputsMapsToStages -count=1`

Expected: FAIL，错误包含 `undefined: PlanOutputs`。

- [ ] **Step 3: 实现编排计划**

实现内容：

```go
type PipelineRequest struct {
	Subtitle SubtitleRequest
	TTS      TTSRequest
	Outputs  string
	Async    bool
}

func PlanOutputs(outputs string) ([]Stage, error) {
	parts := strings.Split(outputs, ",")
	stages := make([]Stage, 0, len(parts))
	for _, part := range parts {
		switch strings.TrimSpace(part) {
		case "subtitle":
			stages = append(stages, StageSubtitle)
		case "tts":
			stages = append(stages, StageTTS)
		case "horizontal-bilingual", "horizontal-dubbed":
			stages = append(stages, StageRenderHorizontal)
		case "vertical-bilingual", "vertical-dubbed":
			stages = append(stages, StageRenderVertical)
		case "cover":
			stages = append(stages, StageCover)
		case "":
		default:
			return nil, fmt.Errorf("unsupported output: %s", part)
		}
	}
	return stages, nil
}
```

`RunPipeline` 逐个调用 `GenerateSubtitles`、`GenerateTTS`、`Render`、`GenerateCover`。`--async` 第一版只允许返回 task_id 并后台 goroutine 执行；异步状态写入 manifest，不依赖内存 map。

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/pipeline/pipeline.go internal/pipeline/pipeline_test.go && go test ./internal/pipeline -run TestPlanOutputsMapsToStages -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/pipeline/pipeline.go internal/pipeline/pipeline_test.go
git commit -m "feat: add pipeline planner"
```

---

### Task 12: 实现 CLI 参数解析和 JSON 输出

**Files:**
- Create: `internal/cli/commands.go`
- Create: `internal/cli/commands_test.go`
- Create: `cmd/cli/main.go`

- [ ] **Step 1: 写失败测试**

```go
package cli

import "testing"

func TestParseSubtitleCommand(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"https://www.youtube.com/watch?v=abc",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", "tasks/demo",
		"--caption-source", "any",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Name != "subtitle" {
		t.Fatalf("Name = %q, want subtitle", cmd.Name)
	}
	if cmd.Subtitle.Input != "https://www.youtube.com/watch?v=abc" {
		t.Fatalf("Input = %q", cmd.Subtitle.Input)
	}
	if cmd.Subtitle.Workdir != "tasks/demo" {
		t.Fatalf("Workdir = %q", cmd.Subtitle.Workdir)
	}
}

func TestParseTTSCommandRequiresInputSRT(t *testing.T) {
	_, err := Parse([]string{"tts", "--workdir", "tasks/demo"})
	if err == nil {
		t.Fatalf("Parse() error = nil, want error")
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/cli -run TestParse -count=1`

Expected: FAIL，错误包含 `undefined: Parse`。

- [ ] **Step 3: 实现 CLI 解析**

实现要求：

1. 使用标准库 `flag.NewFlagSet`，不新增第三方 CLI 依赖。
2. `Parse(args []string)` 返回 `Command`。
3. 命令包括 `subtitle`、`tts`、`render-horizontal`、`render-vertical`、`cover`、`pipeline`、`status`。
4. 参数错误返回普通 error，main 中转成 `pipeline.ErrorKindUsage`。

核心结构：

```go
type Command struct {
	Name     string
	Subtitle pipeline.SubtitleRequest
	TTS      pipeline.TTSRequest
	Render   pipeline.RenderRequest
	Pipeline pipeline.PipelineRequest
}
```

`cmd/cli/main.go` 负责：

```go
func main() {
	log.InitLogger()
	defer log.GetLogger().Sync()
	if !config.LoadConfig() {
		writeAndExit(pipeline.Response{OK: false, Error: &pipeline.Error{Kind: pipeline.ErrorKindUsage, Code: "config_not_found", Message: "未找到配置文件", Retryable: false}})
	}
	if err := config.CheckConfig(); err != nil {
		writeAndExit(errorResponse(err, pipeline.ErrorKindUsage))
	}
	if err := deps.CheckDependency(); err != nil {
		writeAndExit(errorResponse(err, pipeline.ErrorKindDependency))
	}
	cmd, err := cli.Parse(os.Args[1:])
	if err != nil {
		writeAndExit(errorResponse(err, pipeline.ErrorKindUsage))
	}
	svc := service.NewService()
	adapter := pipeline.NewServiceAdapter(svc)
	resp := cli.Execute(context.Background(), adapter, cmd)
	writeAndExit(resp)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `gofmt -w internal/cli/commands.go internal/cli/commands_test.go cmd/cli/main.go && go test ./internal/cli -run TestParse -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/cli/commands.go internal/cli/commands_test.go cmd/cli/main.go
git commit -m "feat: add cli command parser"
```

---

### Task 13: CLI 端到端 dry-run 测试与构建

**Files:**
- Modify: `internal/cli/commands.go`
- Modify: `cmd/cli/main.go`
- Test: `internal/cli/commands_test.go`

- [ ] **Step 1: 增加 dry-run 测试**

```go
func TestExecuteDryRunSubtitleReturnsJSONReadyResponse(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"local:demo.mp4",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", t.TempDir(),
		"--dry-run",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if !resp.OK {
		t.Fatalf("OK = false, error = %#v", resp.Error)
	}
	if resp.Stage != pipeline.StageSubtitle {
		t.Fatalf("Stage = %s", resp.Stage)
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./internal/cli -run TestExecuteDryRunSubtitleReturnsJSONReadyResponse -count=1`

Expected: FAIL，错误包含 `unknown flag: dry-run` 或 `undefined: Execute`。

- [ ] **Step 3: 实现 `--dry-run`**

实现要求：

1. 所有命令支持 `--dry-run`。
2. dry-run 不调用外部依赖和 service，只解析参数、创建 workdir、写 manifest、返回 JSON。
3. 用于 CI 中验证 CLI 二进制不需要真实 API key。

- [ ] **Step 4: 构建 CLI**

Run: `go build -o build/krillinai-cli ./cmd/cli`

Expected: 命令成功，`build/krillinai-cli` 存在。

- [ ] **Step 5: 运行 dry-run**

Run: `./build/krillinai-cli subtitle local:demo.mp4 --origin-lang en --target-lang zh_cn --workdir /tmp/krillinai-cli-demo --dry-run`

Expected: stdout 是 JSON，包含 `"ok":true` 和 `"stage":"subtitle"`。

- [ ] **Step 6: 提交**

```bash
git add internal/cli/commands.go internal/cli/commands_test.go cmd/cli/main.go
git commit -m "feat: support cli dry run"
```

---

### Task 14: 增加 image 配置和封面 prompt 阶段

**Files:**
- Modify: `config/config.go`
- Modify: `config/config-example.toml`
- Create: `internal/pipeline/cover.go`
- Create: `internal/pipeline/cover_test.go`
- Create: `pkg/image/openai_compatible.go`
- Create: `pkg/image/openai_compatible_test.go`

- [ ] **Step 1: 写配置失败测试**

```go
package config

import "testing"

func TestDefaultImageConfig(t *testing.T) {
	if Conf.Image.Provider != "openai-compatible" {
		t.Fatalf("Image.Provider = %q, want openai-compatible", Conf.Image.Provider)
	}
	if Conf.Image.Openai.Model == "" {
		t.Fatalf("Image.Openai.Model is empty")
	}
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `go test ./config -run TestDefaultImageConfig -count=1`

Expected: FAIL，错误包含 `Conf.Image undefined`。

- [ ] **Step 3: 实现 image 配置**

在 `config/config.go` 增加：

```go
type Image struct {
	Provider string                 `toml:"provider"`
	Openai   OpenaiCompatibleConfig `toml:"openai"`
}

type Config struct {
	App        App                    `toml:"app"`
	Server     Server                 `toml:"server"`
	Llm        OpenaiCompatibleConfig `toml:"llm"`
	Transcribe Transcribe             `toml:"transcribe"`
	Tts        Tts                    `toml:"tts"`
	Image      Image                  `toml:"image"`
}
```

默认值：

```go
Image: Image{
	Provider: "openai-compatible",
	Openai: OpenaiCompatibleConfig{
		Model: "gpt-image-1",
	},
},
```

在 `config/config-example.toml` 增加：

```toml
[image]
    provider = "openai-compatible"
    [image.openai]
        base_url = ""
        api_key = ""
        model = "gpt-image-1"
```

- [ ] **Step 4: 实现 prompt 模板渲染测试**

```go
func TestRenderCoverPrompt(t *testing.T) {
	template := "{{title}}\n{{target_language}}\n{{style_hint}}"
	got := RenderCoverPrompt(template, CoverPromptData{
		Title: "原始标题",
		TargetLanguage: "zh_cn",
		StyleHint: "Bilibili 科技封面",
	})
	want := "原始标题\nzh_cn\nBilibili 科技封面"
	if got != want {
		t.Fatalf("RenderCoverPrompt() = %q, want %q", got, want)
	}
}
```

- [ ] **Step 5: 实现 cover prompt**

`internal/pipeline/cover.go` 增加：

```go
type CoverPromptData struct {
	Title          string
	Description    string
	OriginLanguage string
	TargetLanguage string
	StyleHint      string
}

func RenderCoverPrompt(tmpl string, data CoverPromptData) string {
	replacer := strings.NewReplacer(
		"{{title}}", data.Title,
		"{{description}}", data.Description,
		"{{origin_language}}", data.OriginLanguage,
		"{{target_language}}", data.TargetLanguage,
		"{{style_hint}}", data.StyleHint,
	)
	return replacer.Replace(tmpl)
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `gofmt -w config/config.go internal/pipeline/cover.go internal/pipeline/cover_test.go pkg/image/openai_compatible.go pkg/image/openai_compatible_test.go && go test ./config ./internal/pipeline ./pkg/image -run 'TestDefaultImageConfig|TestRenderCoverPrompt|TestOpenAI' -count=1`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add config/config.go config/config-example.toml internal/pipeline/cover.go internal/pipeline/cover_test.go pkg/image/openai_compatible.go pkg/image/openai_compatible_test.go
git commit -m "feat: add cover generation config"
```

---

### Task 15: 发布配置和文档

**Files:**
- Modify: `.goreleaser.yaml`
- Modify: `README.md`
- Modify: `docs/zh/README.md`
- Test: build command

- [ ] **Step 1: 修改 GoReleaser build**

把 `.goreleaser.yaml` 的 `builds` 扩成两个 build：

```yaml
builds:
  - id: server
    binary: KrillinAI
    env:
      - CGO_ENABLED=0
    goos:
      - darwin
      - linux
      - windows
    main: ./cmd/server/main.go
  - id: cli
    binary: krillinai
    env:
      - CGO_ENABLED=0
    goos:
      - darwin
      - linux
      - windows
    main: ./cmd/cli/main.go
```

- [ ] **Step 2: 增加 README CLI 示例**

在 `README.md` 和 `docs/zh/README.md` 中增加中文 CLI 说明。内容包括：

```markdown
### CLI 用法

KrillinAI 提供阶段化 CLI，适合脚本和 Agent 调用。每个命令默认同步执行，完成后输出 JSON。

```bash
krillinai subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --origin-lang en --target-lang zh_cn --workdir tasks/demo
krillinai tts --workdir tasks/demo --input-srt tasks/demo/target_language_srt.srt --line-mode target-only
krillinai render-horizontal --workdir tasks/demo --video tasks/demo/origin_video.mp4 --subtitle tasks/demo/bilingual_srt.srt
krillinai render-vertical --workdir tasks/demo --video tasks/demo/origin_video.mp4 --subtitle tasks/demo/short_origin_mixed_srt.srt
```

Agent 应优先读取 stdout JSON 和 `krillinai_manifest.json`，不要解析普通日志。
```

- [ ] **Step 3: 构建 server 和 CLI**

Run:

```bash
go build -o build/KrillinAI ./cmd/server
go build -o build/krillinai ./cmd/cli
```

Expected: 两个命令都成功，`build/KrillinAI` 和 `build/krillinai` 存在。

- [ ] **Step 4: 运行文档相关测试**

Run: `go test ./internal/pipeline ./internal/cli ./internal/service ./config -count=1`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add .goreleaser.yaml README.md docs/zh/README.md
git commit -m "docs: add cli usage"
```

---

### Task 16: 最终验证

**Files:**
- No code changes expected

- [ ] **Step 1: 全量 Go 测试**

Run: `go test ./...`

Expected: PASS。如果现有桌面依赖导致环境相关失败，记录失败包和错误，并至少确认以下命令 PASS：

```bash
go test ./internal/pipeline ./internal/cli ./internal/service ./pkg/util ./config -count=1
```

- [ ] **Step 2: CLI dry-run 验证**

Run:

```bash
go build -o build/krillinai ./cmd/cli
./build/krillinai subtitle local:demo.mp4 --origin-lang en --target-lang zh_cn --workdir /tmp/krillinai-cli-demo --dry-run
```

Expected: stdout JSON 包含：

```json
{
  "ok": true,
  "stage": "subtitle"
}
```

并且 `/tmp/krillinai-cli-demo/krillinai_manifest.json` 存在。

- [ ] **Step 3: 真实短链路冒烟验证**

在本地 `config/config.toml` 已配置可用 LLM 和 transcribe provider 时运行：

```bash
./build/krillinai subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --origin-lang en --target-lang zh_cn --workdir /tmp/krillinai-real-demo --caption-source any
```

Expected:

- stdout JSON 包含 `"ok":true`。
- `/tmp/krillinai-real-demo/origin_language_srt.srt` 存在。
- `/tmp/krillinai-real-demo/target_language_srt.srt` 存在。
- `/tmp/krillinai-real-demo/bilingual_srt.srt` 存在。

- [ ] **Step 4: 检查工作区**

Run: `git status --short`

Expected: 只出现执行验证产生的本地非提交文件；没有未提交的源码改动。

- [ ] **Step 5: 保存项目状态到 AgentMemory**

保存内容：

```text
KrillinAI CLI 化已完成第一阶段实施：阶段化命令、pipeline core、manifest、JSON 输出、字幕/TTS/横竖屏渲染和基础封面配置。记录通过的测试命令、未覆盖的真实 API 冒烟项和下一步发布事项。
```
