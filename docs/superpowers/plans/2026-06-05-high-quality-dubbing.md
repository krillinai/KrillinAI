# 高质量配音算法实现计划

> **面向 agentic workers：** 实现本计划时必须逐任务执行，并使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 用参考 VideoLingo 思路的高质量配音流水线替换 KrillinAI 当前逐字幕硬对齐 TTS 算法，优先提升自然口播、时间轴稳定性和失败可诊断性。

**架构：** 新增 `internal/service/dubbing` 包，把 SRT 解析、文本清理、估时、口播改写、chunk 规划、TTS、时间轴拟合、音频拼接和视频 mux 拆开。外部接口保持不变：Web 继续调用 `Service.srtFileToSpeech(...)`，CLI 继续调用 `pipeline.GenerateTTS(...)`，最终仍输出 `tts_final_audio.wav` 和 `video_with_tts.mp4`。

**技术栈：** Go、现有 `types.Ttser`、现有 `types.ChatCompleter`、ffmpeg/ffprobe、TOML 配置、fake TTS 和 fake command runner 单元测试。

---

## 参考边界

本阶段只实现 VideoLingo 配音流程中与质量直接相关的一阶能力：字幕清理、短句合并、估时、LLM 缩短口播文本、配音任务计划、分段 TTS、生成 `dub.srt`、合成 `dub.wav` 等价音轨并 mux 到视频。第一阶段不引入 Demucs、背景声保留、多说话人、口型同步和 provider 专属韵律参数。

VideoLingo 的关键参考点是：`core/_8_1_audio_task.py` 会解析 SRT、合并短字幕、清理文本、按估计时长用 LLM 修剪文本并生成音频任务；后续把生成的配音音轨与视频合成。KrillinAI 本阶段用 Go 轻量实现同一类策略，但保留现有 `openai`、`aliyun`、`edge-tts` TTS 接口。

---

## 文件结构

- 新建 `internal/service/dubbing/types.go`：配音配置、Cue、PlanItem、Chunk、Report、Runner 依赖、注入接口。
- 新建 `internal/service/dubbing/srt.go`：稳健 SRT 解析、时间戳转换、SRT 写回。
- 新建 `internal/service/dubbing/clean.go`：TTS 文本清理、音效/静音字幕识别。
- 新建 `internal/service/dubbing/estimator.go`：高级统计估时器、语言语速 profile、标点/数字/缩写惩罚、任务内校准、启发式兜底。
- 新建 `internal/service/dubbing/optimizer.go`：LLM 口播化改写器。
- 新建 `internal/service/dubbing/planner.go`：短句合并、gap 吸收、chunk 规划、改写触发。
- 新建 `internal/service/dubbing/tts.go`：重试 TTS、raw segment 生成、真实时长测量。
- 新建 `internal/service/dubbing/fit.go`：chunk 级时间轴拟合、调速边界、warning/report。
- 新建 `internal/service/dubbing/audio.go`：ffmpeg runner、atempo 链、静音生成、fitted segment、concat、视频 mux。
- 新建 `internal/service/dubbing/runner.go`：完整编排入口。
- 修改 `config/config.go`：新增 `[dubbing]` 配置和默认值。
- 修改 `config/config-example.toml`：新增 `[dubbing]` 示例。
- 修改 `internal/service/audio2subtitle.go`：Web 配音输入改为目标语言单语 SRT。
- 修改 `internal/service/srt2speech.go`：保留音色克隆，替换旧算法为 `dubbing.Runner`。
- 修改 `internal/pipeline/tts.go`：CLI 路径把 manifest 目标语言写入 `stepParam.TargetLanguage`，并保持现有输出路径。
- 不修改 `internal/types/subtitle_task.go`：新增调试产物文件名放在 `internal/service/dubbing/types.go`，避免污染任务公共常量。

---

### 任务 1：新增配置和数据模型

**文件：**
- 修改：`config/config.go`
- 修改：`config/config-example.toml`
- 新建：`internal/service/dubbing/types.go`
- 测试：`config/config_test.go`
- 测试：`internal/service/dubbing/types_test.go`

- [ ] **步骤 1：写失败的默认配置测试**

把以下测试追加到 `config/config_test.go`：

```go
func TestDefaultDubbingConfig(t *testing.T) {
	if Conf.Dubbing.MinSubtitleDuration != 2.5 {
		t.Fatalf("MinSubtitleDuration = %v, want 2.5", Conf.Dubbing.MinSubtitleDuration)
	}
	if Conf.Dubbing.MaxChunkSize != 5 {
		t.Fatalf("MaxChunkSize = %d, want 5", Conf.Dubbing.MaxChunkSize)
	}
	if Conf.Dubbing.GapTolerance != 1.5 {
		t.Fatalf("GapTolerance = %v, want 1.5", Conf.Dubbing.GapTolerance)
	}
	if Conf.Dubbing.SpeedMin != 0.95 || Conf.Dubbing.SpeedAccept != 1.15 || Conf.Dubbing.SpeedMax != 1.30 {
		t.Fatalf("speed config = %+v", Conf.Dubbing)
	}
	if !Conf.Dubbing.EnableTextRewrite {
		t.Fatalf("EnableTextRewrite = false, want true")
	}
	if Conf.Dubbing.RewriteMaxAttempts != 2 {
		t.Fatalf("RewriteMaxAttempts = %d, want 2", Conf.Dubbing.RewriteMaxAttempts)
	}
	if Conf.Dubbing.Estimator != "statistical" {
		t.Fatalf("Estimator = %q, want statistical", Conf.Dubbing.Estimator)
	}
}
```

- [ ] **步骤 2：写失败的数据模型测试**

新建 `internal/service/dubbing/types_test.go`：

```go
package dubbing

import (
	"strings"
	"testing"
)

func TestDefaultConfigValues(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.MinSubtitleDuration != 2.5 || cfg.MaxChunkSize != 5 || cfg.GapTolerance != 1.5 {
		t.Fatalf("DefaultConfig timing = %+v", cfg)
	}
	if cfg.SpeedMin != 0.95 || cfg.SpeedAccept != 1.15 || cfg.SpeedMax != 1.30 {
		t.Fatalf("DefaultConfig speed = %+v", cfg)
	}
	if !cfg.EnableTextRewrite || cfg.RewriteMaxAttempts != 2 || cfg.Estimator != "statistical" {
		t.Fatalf("DefaultConfig rewrite = %+v", cfg)
	}
}

func TestCueDuration(t *testing.T) {
	cue := Cue{Start: 1.25, End: 3.75}
	if cue.Duration() != 2.5 {
		t.Fatalf("Duration() = %v, want 2.5", cue.Duration())
	}
}
```

- [ ] **步骤 3：确认测试失败**

运行：

```bash
go test ./config ./internal/service/dubbing
```

预期：失败，原因是 `Conf.Dubbing` 和 `internal/service/dubbing` 尚不存在。

- [ ] **步骤 4：添加配置类型和默认值**

在 `config/config.go` 中新增：

```go
type Dubbing struct {
	MinSubtitleDuration float64 `toml:"min_subtitle_duration"`
	MaxChunkSize        int     `toml:"max_chunk_size"`
	GapTolerance        float64 `toml:"gap_tolerance"`
	SpeedMin            float64 `toml:"speed_min"`
	SpeedAccept         float64 `toml:"speed_accept"`
	SpeedMax            float64 `toml:"speed_max"`
	EnableTextRewrite   bool    `toml:"enable_text_rewrite"`
	RewriteMaxAttempts  int     `toml:"rewrite_max_attempts"`
	Estimator           string  `toml:"estimator"`
}
```

在 `type Config` 中新增字段：

```go
Dubbing Dubbing `toml:"dubbing"`
```

在 `Conf` 默认值中新增：

```go
Dubbing: Dubbing{
	MinSubtitleDuration: 2.5,
	MaxChunkSize:        5,
	GapTolerance:        1.5,
	SpeedMin:            0.95,
	SpeedAccept:         1.15,
	SpeedMax:            1.30,
	EnableTextRewrite:   true,
	RewriteMaxAttempts:  2,
	Estimator:           "statistical",
},
```

- [ ] **步骤 5：添加配置示例**

在 `config/config-example.toml` 的 `[tts]` 后、`[image]` 前追加：

```toml
[dubbing]
    min_subtitle_duration = 2.5 # 最短配音字幕时长，短句会优先合并
    max_chunk_size = 5 # 单个配音 chunk 最多合并字幕条数
    gap_tolerance = 1.5 # 可吸收的相邻字幕空隙，单位秒
    speed_min = 0.95 # 允许的最慢调速倍率
    speed_accept = 1.15 # 推荐的最大自然调速倍率
    speed_max = 1.30 # 硬上限，超过后优先改写文本
    enable_text_rewrite = true # 是否允许 LLM 改写为自然口播
    rewrite_max_attempts = 2 # 单条字幕最多改写次数
    estimator = "statistical" # 估时器，当前支持 statistical
```

- [ ] **步骤 6：创建数据模型**

新建 `internal/service/dubbing/types.go`：

```go
package dubbing

import (
	"context"
	"krillin-ai/internal/types"
)

const (
	DubbingDirName       = "dubbing"
	DubbingInputFileName = "dubbing_input.srt"
	DubbingPlanFileName  = "dubbing_plan.json"
	DubbingReportName    = "dubbing_report.json"
	DubSubtitleFileName  = "dub.srt"
)

type Config struct {
	MinSubtitleDuration float64
	MaxChunkSize        int
	GapTolerance        float64
	SpeedMin            float64
	SpeedAccept         float64
	SpeedMax            float64
	EnableTextRewrite   bool
	RewriteMaxAttempts  int
	Estimator           string
}

func DefaultConfig() Config {
	return Config{
		MinSubtitleDuration: 2.5,
		MaxChunkSize:        5,
		GapTolerance:        1.5,
		SpeedMin:            0.95,
		SpeedAccept:         1.15,
		SpeedMax:            1.30,
		EnableTextRewrite:   true,
		RewriteMaxAttempts:  2,
		Estimator:           "statistical",
	}
}

type Cue struct {
	Index int
	Start float64
	End   float64
	Text  string
}

func (c Cue) Duration() float64 {
	return c.End - c.Start
}

type PlanItem struct {
	Index              int     `json:"index"`
	OriginalStart      float64 `json:"original_start"`
	OriginalEnd        float64 `json:"original_end"`
	NewStart           float64 `json:"new_start"`
	NewEnd             float64 `json:"new_end"`
	OriginalText       string  `json:"original_text"`
	CleanText          string  `json:"clean_text"`
	SpokenText         string  `json:"spoken_text"`
	EstimatedDuration  float64 `json:"estimated_duration"`
	EstimateConfidence float64 `json:"estimate_confidence"`
	ActualDuration     float64 `json:"actual_duration"`
	SpeedFactor        float64 `json:"speed_factor"`
	ChunkID            int     `json:"chunk_id"`
	RewriteAttempts    int     `json:"rewrite_attempts"`
	Warning            string  `json:"warning,omitempty"`
}

type Chunk struct {
	ID    int
	Items []int
	Start float64
	End   float64
}

type Report struct {
	Warnings       []string `json:"warnings"`
	FailedIndexes  []int    `json:"failed_indexes"`
	MaxSpeedFactor float64  `json:"max_speed_factor"`
	RewriteCount   int      `json:"rewrite_count"`
}

type CommandRunner func(args []string) error
type DurationProbe func(path string) (float64, error)

type Dependencies struct {
	TTS         types.Ttser
	Chat        types.ChatCompleter
	Language    types.StandardLanguageCode
	Voice       string
	Workdir     string
	InputSRT    string
	InputVideo  string
	OutputAudio string
	OutputVideo string
	Config      Config
	FFmpeg      CommandRunner
	Duration    DurationProbe
}

type TextOptimizer interface {
	Optimize(ctx context.Context, text string, availableSeconds float64, reason string) (string, error)
}
```

- [ ] **步骤 7：运行测试**

```bash
gofmt -w config/config.go internal/service/dubbing/types.go config/config_test.go internal/service/dubbing/types_test.go
go test ./config ./internal/service/dubbing
```

预期：通过。

- [ ] **步骤 8：提交**

```bash
git add config/config.go config/config-example.toml config/config_test.go internal/service/dubbing/types.go internal/service/dubbing/types_test.go
git commit -m "feat: add dubbing config and model"
```

---

### 任务 2：实现 SRT 解析和 TTS 文本清理

**文件：**
- 新建：`internal/service/dubbing/srt.go`
- 新建：`internal/service/dubbing/clean.go`
- 测试：`internal/service/dubbing/srt_test.go`
- 测试：`internal/service/dubbing/clean_test.go`

- [ ] **步骤 1：写 SRT parser 测试**

新建 `internal/service/dubbing/srt_test.go`：

```go
package dubbing

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseSRTSupportsMultilineCRLFAndNoTrailingBlank(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "input.srt")
	content := "1\r\n00:00:01,000 --> 00:00:03,500\r\n第一行\r\n第二行\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,250\r\n最后一句"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	cues, err := ParseSRTFile(path)
	if err != nil {
		t.Fatalf("ParseSRTFile() error = %v", err)
	}
	if len(cues) != 2 {
		t.Fatalf("len(cues) = %d, want 2", len(cues))
	}
	if cues[0].Start != 1 || cues[0].End != 3.5 || cues[0].Text != "第一行 第二行" {
		t.Fatalf("first cue = %+v", cues[0])
	}
	if cues[1].Start != 4 || cues[1].End != 5.25 || cues[1].Text != "最后一句" {
		t.Fatalf("second cue = %+v", cues[1])
	}
}

func TestWriteSRTUsesNewTimeline(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "dub.srt")
	cues := []Cue{{Index: 1, Start: 0.2, End: 1.45, Text: "你好"}, {Index: 2, Start: 2, End: 3.01, Text: "世界"}}
	if err := WriteSRTFile(path, cues); err != nil {
		t.Fatalf("WriteSRTFile() error = %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "1\n00:00:00,200 --> 00:00:01,450\n你好\n\n2\n00:00:02,000 --> 00:00:03,010\n世界\n\n"
	if string(data) != want {
		t.Fatalf("srt = %q, want %q", string(data), want)
	}
}
```

- [ ] **步骤 2：写文本清理测试**

新建 `internal/service/dubbing/clean_test.go`：

```go
package dubbing

import "testing"

func TestCleanTextForSpeechRemovesNoiseButKeepsMeaning(t *testing.T) {
	got := CleanTextForSpeech("（掌声）  你好——世界 & ™ ")
	if got != "你好世界" {
		t.Fatalf("CleanTextForSpeech() = %q", got)
	}
}

func TestIsSilenceOnlyText(t *testing.T) {
	if !IsSilenceOnlyText("（音乐）") {
		t.Fatalf("music cue should be silence-only")
	}
	if IsSilenceOnlyText("你好") {
		t.Fatalf("spoken text should not be silence-only")
	}
}
```

- [ ] **步骤 3：确认测试失败**

```bash
go test ./internal/service/dubbing
```

预期：失败，原因是解析和清理函数尚不存在。

- [ ] **步骤 4：实现 `srt.go`**

创建 `internal/service/dubbing/srt.go`：

```go
package dubbing

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

func ParseSRTFile(path string) ([]Cue, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, nil
	}
	blocks := strings.Split(text, "\n\n")
	cues := make([]Cue, 0, len(blocks))
	for _, block := range blocks {
		lines := nonEmptyLines(block)
		if len(lines) < 2 {
			continue
		}
		index, err := strconv.Atoi(strings.TrimSpace(lines[0]))
		if err != nil {
			return nil, fmt.Errorf("invalid srt index %q: %w", lines[0], err)
		}
		parts := strings.Split(lines[1], " --> ")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid srt timestamp line %q", lines[1])
		}
		start, err := ParseTimestamp(parts[0])
		if err != nil {
			return nil, fmt.Errorf("cue %d start: %w", index, err)
		}
		end, err := ParseTimestamp(parts[1])
		if err != nil {
			return nil, fmt.Errorf("cue %d end: %w", index, err)
		}
		cues = append(cues, Cue{
			Index: index,
			Start: start,
			End:   end,
			Text:  strings.Join(lines[2:], " "),
		})
	}
	return cues, nil
}

func nonEmptyLines(block string) []string {
	raw := strings.Split(block, "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		line = strings.TrimSpace(line)
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func ParseTimestamp(value string) (float64, error) {
	value = strings.TrimSpace(value)
	fields := strings.Split(value, ":")
	if len(fields) != 3 {
		return 0, fmt.Errorf("invalid timestamp %q", value)
	}
	hours, err := strconv.Atoi(fields[0])
	if err != nil {
		return 0, fmt.Errorf("invalid hour in %q: %w", value, err)
	}
	minutes, err := strconv.Atoi(fields[1])
	if err != nil {
		return 0, fmt.Errorf("invalid minute in %q: %w", value, err)
	}
	secParts := strings.Split(fields[2], ",")
	if len(secParts) != 2 {
		return 0, fmt.Errorf("invalid seconds in %q", value)
	}
	seconds, err := strconv.Atoi(secParts[0])
	if err != nil {
		return 0, fmt.Errorf("invalid second in %q: %w", value, err)
	}
	millis, err := strconv.Atoi(secParts[1])
	if err != nil {
		return 0, fmt.Errorf("invalid millis in %q: %w", value, err)
	}
	return float64(hours*3600+minutes*60+seconds) + float64(millis)/1000, nil
}

func FormatTimestamp(seconds float64) string {
	if seconds < 0 {
		seconds = 0
	}
	totalMillis := int(seconds*1000 + 0.5)
	hours := totalMillis / 3600000
	totalMillis %= 3600000
	minutes := totalMillis / 60000
	totalMillis %= 60000
	secs := totalMillis / 1000
	millis := totalMillis % 1000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, secs, millis)
}

func WriteSRTFile(path string, cues []Cue) error {
	var b strings.Builder
	for i, cue := range cues {
		index := cue.Index
		if index <= 0 {
			index = i + 1
		}
		b.WriteString(strconv.Itoa(index))
		b.WriteString("\n")
		b.WriteString(FormatTimestamp(cue.Start))
		b.WriteString(" --> ")
		b.WriteString(FormatTimestamp(cue.End))
		b.WriteString("\n")
		b.WriteString(strings.TrimSpace(cue.Text))
		b.WriteString("\n\n")
	}
	return os.WriteFile(path, []byte(b.String()), 0644)
}
```

- [ ] **步骤 5：实现 `clean.go`**

创建 `internal/service/dubbing/clean.go`：

```go
package dubbing

import (
	"regexp"
	"strings"
)

var (
	parenNoisePattern = regexp.MustCompile(`(?i)[(（][^()（）]*(music|applause|laughter|laugh|noise|sound|silence|inaudible|掌声|音乐|笑声|噪音|静音)[^()（）]*[)）]`)
	anyParenPattern   = regexp.MustCompile(`[(（][^()（）]{0,20}[)）]`)
	spacePattern      = regexp.MustCompile(`\s+`)
)

func CleanTextForSpeech(text string) string {
	text = parenNoisePattern.ReplaceAllString(text, "")
	text = strings.ReplaceAll(text, "&", "")
	text = strings.ReplaceAll(text, "®", "")
	text = strings.ReplaceAll(text, "™", "")
	text = strings.ReplaceAll(text, "©", "")
	text = strings.ReplaceAll(text, "——", "")
	text = strings.ReplaceAll(text, "--", "")
	text = strings.ReplaceAll(text, "-", "")
	text = spacePattern.ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func IsSilenceOnlyText(text string) bool {
	cleaned := CleanTextForSpeech(text)
	if cleaned == "" {
		return true
	}
	withoutParens := anyParenPattern.ReplaceAllString(cleaned, "")
	return strings.TrimSpace(withoutParens) == ""
}
```

- [ ] **步骤 6：运行测试**

```bash
gofmt -w internal/service/dubbing/srt.go internal/service/dubbing/clean.go internal/service/dubbing/srt_test.go internal/service/dubbing/clean_test.go
go test ./internal/service/dubbing
```

预期：通过。

- [ ] **步骤 7：提交**

```bash
git add internal/service/dubbing/srt.go internal/service/dubbing/clean.go internal/service/dubbing/srt_test.go internal/service/dubbing/clean_test.go
git commit -m "feat: add dubbing srt parsing and cleanup"
```

---

### 任务 3：实现高级估时器和口播化改写

**文件：**
- 新建：`internal/service/dubbing/estimator.go`
- 新建：`internal/service/dubbing/optimizer.go`
- 测试：`internal/service/dubbing/estimator_test.go`
- 测试：`internal/service/dubbing/optimizer_test.go`

- [ ] **步骤 1：写估时器测试**

新建 `internal/service/dubbing/estimator_test.go`：

```go
package dubbing

import (
	"krillin-ai/internal/types"
	"testing"
)

func TestStatisticalEstimatorAddsPunctuationAndNumberPenalty(t *testing.T) {
	est := NewStatisticalEstimator()
	plain, _, err := est.Estimate("你好世界", types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatal(err)
	}
	withPause, _, err := est.Estimate("你好，世界。2026", types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatal(err)
	}
	if withPause <= plain {
		t.Fatalf("withPause = %v, plain = %v; want punctuation and number to add duration", withPause, plain)
	}
}

func TestEstimatorCalibrationAdjustsFutureEstimates(t *testing.T) {
	est := NewStatisticalEstimator()
	before, _, _ := est.Estimate("这是一个测试句子", types.LanguageNameSimplifiedChinese)
	est.Calibrate(types.LanguageNameSimplifiedChinese, before, before*1.5)
	after, _, _ := est.Estimate("这是一个测试句子", types.LanguageNameSimplifiedChinese)
	if after <= before {
		t.Fatalf("after = %v, before = %v; want calibration to increase estimate", after, before)
	}
}

func TestHeuristicFallbackReturnsLowConfidence(t *testing.T) {
	est := NewHeuristicEstimator()
	seconds, confidence, err := est.Estimate("hello world", "")
	if err != nil {
		t.Fatal(err)
	}
	if seconds <= 0 || confidence >= 0.7 {
		t.Fatalf("seconds=%v confidence=%v", seconds, confidence)
	}
}
```

- [ ] **步骤 2：写 optimizer 测试**

新建 `internal/service/dubbing/optimizer_test.go`：

```go
package dubbing

import (
	"context"
	"testing"
)

type fakeChat struct {
	response string
	query    string
	err      error
}

func (f *fakeChat) ChatCompletion(query string) (string, error) {
	f.query = query
	return f.response, f.err
}

func TestLLMOptimizerReturnsSingleLineTrimmedText(t *testing.T) {
	chat := &fakeChat{response: "  更自然的说法\n"}
	opt := NewLLMOptimizer(chat)
	got, err := opt.Optimize(context.Background(), "字幕腔文本", 2.5, "estimated_too_long")
	if err != nil {
		t.Fatalf("Optimize() error = %v", err)
	}
	if got != "更自然的说法" {
		t.Fatalf("Optimize() = %q", got)
	}
	if chat.query == "" {
		t.Fatalf("expected optimizer to call chat")
	}
}
```

- [ ] **步骤 3：确认测试失败**

```bash
go test ./internal/service/dubbing
```

预期：失败，原因是 estimator 和 optimizer 尚不存在。

- [ ] **步骤 4：实现估时器**

创建 `internal/service/dubbing/estimator.go`：

```go
package dubbing

import (
	"krillin-ai/internal/types"
	"regexp"
	"strings"
	"sync"
	"unicode"
)

type DurationEstimator interface {
	Estimate(text string, language types.StandardLanguageCode) (seconds float64, confidence float64, err error)
}

type CalibratingEstimator interface {
	DurationEstimator
	Calibrate(language types.StandardLanguageCode, estimated, actual float64)
}

type speechRateProfile struct {
	CharsPerSecond float64
	WordsPerSecond float64
	Confidence     float64
}

type StatisticalEstimator struct {
	mu          sync.Mutex
	calibration map[types.StandardLanguageCode]float64
}

func NewStatisticalEstimator() *StatisticalEstimator {
	return &StatisticalEstimator{calibration: make(map[types.StandardLanguageCode]float64)}
}

func (e *StatisticalEstimator) Estimate(text string, language types.StandardLanguageCode) (float64, float64, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return 0.1, 1, nil
	}
	profile, ok := speechProfiles[language]
	if !ok {
		return NewHeuristicEstimator().Estimate(text, language)
	}
	seconds := baseDuration(text, profile) + punctuationPause(text) + numberPenalty(text) + acronymPenalty(text)
	e.mu.Lock()
	factor := e.calibration[language]
	e.mu.Unlock()
	if factor == 0 {
		factor = 1
	}
	return seconds * factor, profile.Confidence, nil
}

func (e *StatisticalEstimator) Calibrate(language types.StandardLanguageCode, estimated, actual float64) {
	if estimated <= 0 || actual <= 0 {
		return
	}
	ratio := actual / estimated
	e.mu.Lock()
	defer e.mu.Unlock()
	current := e.calibration[language]
	if current == 0 {
		current = 1
	}
	e.calibration[language] = current*0.75 + ratio*0.25
}

type HeuristicEstimator struct{}

func NewHeuristicEstimator() *HeuristicEstimator {
	return &HeuristicEstimator{}
}

func (e *HeuristicEstimator) Estimate(text string, language types.StandardLanguageCode) (float64, float64, error) {
	words := regexp.MustCompile(`\S+`).FindAllString(strings.TrimSpace(text), -1)
	chars := nonSpaceRuneCount(text)
	seconds := float64(chars)/5.0 + float64(len(words))/3.0 + punctuationPause(text)
	if seconds < 0.3 {
		seconds = 0.3
	}
	return seconds, 0.5, nil
}

var speechProfiles = map[types.StandardLanguageCode]speechRateProfile{
	types.LanguageNameSimplifiedChinese:  {CharsPerSecond: 4.2, Confidence: 0.88},
	types.LanguageNameTraditionalChinese: {CharsPerSecond: 4.2, Confidence: 0.88},
	types.LanguageNameJapanese:           {CharsPerSecond: 4.0, Confidence: 0.82},
	types.LanguageNameKorean:             {CharsPerSecond: 4.0, Confidence: 0.82},
	types.LanguageNameEnglish:            {WordsPerSecond: 2.45, Confidence: 0.86},
	types.LanguageNameGerman:             {WordsPerSecond: 2.25, Confidence: 0.82},
	types.LanguageNameRussian:            {WordsPerSecond: 2.30, Confidence: 0.80},
	types.LanguageNameTurkish:            {WordsPerSecond: 2.35, Confidence: 0.80},
}

func baseDuration(text string, profile speechRateProfile) float64 {
	if profile.WordsPerSecond > 0 {
		words := regexp.MustCompile(`\S+`).FindAllString(text, -1)
		return float64(len(words)) / profile.WordsPerSecond
	}
	return float64(nonSpaceRuneCount(text)) / profile.CharsPerSecond
}

func nonSpaceRuneCount(text string) int {
	count := 0
	for _, r := range text {
		if unicode.IsSpace(r) || unicode.IsPunct(r) {
			continue
		}
		count++
	}
	return count
}

func punctuationPause(text string) float64 {
	pause := 0.0
	for _, r := range text {
		switch r {
		case ',', '，', ';', '；', '、':
			pause += 0.12
		case '.', '。', '!', '！', '?', '？':
			pause += 0.22
		case '\n':
			pause += 0.18
		}
	}
	return pause
}

func numberPenalty(text string) float64 {
	matches := regexp.MustCompile(`\d+`).FindAllString(text, -1)
	penalty := 0.0
	for _, match := range matches {
		penalty += 0.08 * float64(len(match))
	}
	return penalty
}

func acronymPenalty(text string) float64 {
	matches := regexp.MustCompile(`\b[A-Z]{2,}\b`).FindAllString(text, -1)
	penalty := 0.0
	for _, match := range matches {
		penalty += 0.06 * float64(len(match))
	}
	return penalty
}
```

- [ ] **步骤 5：实现 optimizer**

创建 `internal/service/dubbing/optimizer.go`：

```go
package dubbing

import (
	"context"
	"fmt"
	"krillin-ai/internal/types"
	"strings"
)

type LLMOptimizer struct {
	chat types.ChatCompleter
}

func NewLLMOptimizer(chat types.ChatCompleter) *LLMOptimizer {
	return &LLMOptimizer{chat: chat}
}

func (o *LLMOptimizer) Optimize(ctx context.Context, text string, availableSeconds float64, reason string) (string, error) {
	if o == nil || o.chat == nil {
		return text, nil
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	prompt := fmt.Sprintf(`请把下面字幕改写成更自然、更短、更适合口播的一句话。
要求：
1. 保留核心含义，不添加新事实。
2. 输出目标语言文本，不要解释。
3. 输出单行纯文本。
4. 尽量适合 %.1f 秒内自然朗读。
触发原因：%s

字幕：
%s`, availableSeconds, reason, text)
	resp, err := o.chat.ChatCompletion(prompt)
	if err != nil {
		return "", err
	}
	resp = strings.TrimSpace(resp)
	resp = strings.ReplaceAll(resp, "\r", " ")
	resp = strings.ReplaceAll(resp, "\n", " ")
	resp = strings.Join(strings.Fields(resp), " ")
	if resp == "" {
		return text, nil
	}
	return resp, nil
}
```

- [ ] **步骤 6：运行测试**

```bash
gofmt -w internal/service/dubbing/estimator.go internal/service/dubbing/optimizer.go internal/service/dubbing/estimator_test.go internal/service/dubbing/optimizer_test.go
go test ./internal/service/dubbing
```

预期：通过。

- [ ] **步骤 7：提交**

```bash
git add internal/service/dubbing/estimator.go internal/service/dubbing/optimizer.go internal/service/dubbing/estimator_test.go internal/service/dubbing/optimizer_test.go
git commit -m "feat: add dubbing estimator and optimizer"
```

---

### 任务 4：实现 chunk 规划和时间轴拟合

**文件：**
- 新建：`internal/service/dubbing/planner.go`
- 新建：`internal/service/dubbing/fit.go`
- 测试：`internal/service/dubbing/planner_test.go`
- 测试：`internal/service/dubbing/fit_test.go`

- [ ] **步骤 1：写 planner 测试**

新建 `internal/service/dubbing/planner_test.go`：

```go
package dubbing

import (
	"krillin-ai/internal/types"
	"testing"
)

func TestPlannerMergesShortAdjacentCues(t *testing.T) {
	cfg := DefaultConfig()
	cues := []Cue{
		{Index: 1, Start: 0, End: 0.8, Text: "你好"},
		{Index: 2, Start: 1.0, End: 2.2, Text: "我们开始吧"},
		{Index: 3, Start: 5.0, End: 6.0, Text: "下一段"},
	}
	planner := NewPlanner(cfg, NewStatisticalEstimator(), nil)
	plan, chunks, err := planner.Plan(cues, types.LanguageNameSimplifiedChinese)
	if err != nil {
		t.Fatalf("Plan() error = %v", err)
	}
	if len(plan) != 3 || len(chunks) != 2 {
		t.Fatalf("plan=%+v chunks=%+v", plan, chunks)
	}
	if plan[0].ChunkID != plan[1].ChunkID {
		t.Fatalf("first short cue should merge with second: %+v", plan)
	}
	if plan[2].ChunkID == plan[1].ChunkID {
		t.Fatalf("large gap should start a new chunk: %+v", plan)
	}
}
```

- [ ] **步骤 2：写 fitter 测试**

新建 `internal/service/dubbing/fit_test.go`：

```go
package dubbing

import "testing"

func TestFitTimelineProducesMonotonicTimesAndChunkSpeed(t *testing.T) {
	cfg := DefaultConfig()
	plan := []PlanItem{
		{Index: 1, OriginalStart: 0, OriginalEnd: 1, SpokenText: "一", ActualDuration: 0.8, ChunkID: 1},
		{Index: 2, OriginalStart: 1.1, OriginalEnd: 2, SpokenText: "二", ActualDuration: 0.8, ChunkID: 1},
	}
	chunks := []Chunk{{ID: 1, Items: []int{0, 1}, Start: 0, End: 2.5}}
	got, report, err := FitTimeline(plan, chunks, cfg)
	if err != nil {
		t.Fatalf("FitTimeline() error = %v", err)
	}
	if got[0].NewStart != 0 || got[1].NewStart < got[0].NewEnd {
		t.Fatalf("timeline overlaps: %+v", got)
	}
	if report.MaxSpeedFactor <= 0 {
		t.Fatalf("MaxSpeedFactor not set: %+v", report)
	}
}
```

- [ ] **步骤 3：确认测试失败**

```bash
go test ./internal/service/dubbing
```

预期：失败，原因是 planner 和 fitter 尚不存在。

- [ ] **步骤 4：实现 planner**

创建 `internal/service/dubbing/planner.go`：

```go
package dubbing

import (
	"context"
	"krillin-ai/internal/types"
)

type Planner struct {
	cfg       Config
	estimator DurationEstimator
	optimizer TextOptimizer
}

func NewPlanner(cfg Config, estimator DurationEstimator, optimizer TextOptimizer) *Planner {
	if cfg.MaxChunkSize <= 0 {
		cfg = DefaultConfig()
	}
	if estimator == nil {
		estimator = NewStatisticalEstimator()
	}
	return &Planner{cfg: cfg, estimator: estimator, optimizer: optimizer}
}

func (p *Planner) Plan(cues []Cue, language types.StandardLanguageCode) ([]PlanItem, []Chunk, error) {
	if len(cues) == 0 {
		return nil, nil, nil
	}
	plan := make([]PlanItem, len(cues))
	for i, cue := range cues {
		clean := CleanTextForSpeech(cue.Text)
		estimate, confidence, err := p.estimator.Estimate(clean, language)
		if err != nil {
			return nil, nil, err
		}
		spoken := clean
		rewriteAttempts := 0
		available := cue.Duration() + p.cfg.GapTolerance
		if p.cfg.EnableTextRewrite && estimate > available && p.optimizer != nil {
			rewritten, err := p.optimizer.Optimize(context.Background(), clean, available, "estimated_too_long")
			if err == nil && rewritten != "" {
				spoken = rewritten
				rewriteAttempts = 1
			}
		}
		plan[i] = PlanItem{
			Index:              cue.Index,
			OriginalStart:      cue.Start,
			OriginalEnd:        cue.End,
			OriginalText:       cue.Text,
			CleanText:          clean,
			SpokenText:         spoken,
			EstimatedDuration:  estimate,
			EstimateConfidence: confidence,
			RewriteAttempts:    rewriteAttempts,
		}
	}
	chunks := p.makeChunks(cues, plan)
	return plan, chunks, nil
}

func (p *Planner) makeChunks(cues []Cue, plan []PlanItem) []Chunk {
	chunks := []Chunk{}
	current := Chunk{ID: 1, Start: cues[0].Start}
	for i := range cues {
		if len(current.Items) == 0 {
			current.Start = cues[i].Start
		}
		current.Items = append(current.Items, i)
		plan[i].ChunkID = current.ID
		current.End = cues[i].End
		shouldCut := true
		if i < len(cues)-1 {
			gap := cues[i+1].Start - cues[i].End
			shortCue := cues[i].Duration() < p.cfg.MinSubtitleDuration
			canMerge := gap <= p.cfg.GapTolerance && len(current.Items) < p.cfg.MaxChunkSize
			shouldCut = !(shortCue || canMerge)
		}
		if len(current.Items) >= p.cfg.MaxChunkSize {
			shouldCut = true
		}
		if shouldCut {
			chunks = append(chunks, current)
			current = Chunk{ID: current.ID + 1}
		}
	}
	return chunks
}
```

- [ ] **步骤 5：实现 fitter**

创建 `internal/service/dubbing/fit.go`：

```go
package dubbing

import "fmt"

func FitTimeline(plan []PlanItem, chunks []Chunk, cfg Config) ([]PlanItem, Report, error) {
	report := Report{}
	for _, chunk := range chunks {
		if len(chunk.Items) == 0 {
			continue
		}
		actual := 0.0
		for _, idx := range chunk.Items {
			actual += plan[idx].ActualDuration
		}
		available := chunk.End - chunk.Start
		if available <= 0 {
			return nil, report, fmt.Errorf("chunk %d has invalid duration", chunk.ID)
		}
		speed := 1.0
		if actual > available {
			speed = actual / available
		}
		if speed > cfg.SpeedAccept {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d speed %.3f exceeds accept %.3f", chunk.ID, speed, cfg.SpeedAccept))
		}
		if speed > cfg.SpeedMax {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d speed %.3f exceeds max %.3f", chunk.ID, speed, cfg.SpeedMax))
		}
		if speed > report.MaxSpeedFactor {
			report.MaxSpeedFactor = speed
		}
		if speed < cfg.SpeedMin {
			speed = cfg.SpeedMin
		}
		cur := chunk.Start
		for _, idx := range chunk.Items {
			duration := plan[idx].ActualDuration / speed
			plan[idx].SpeedFactor = speed
			plan[idx].NewStart = cur
			plan[idx].NewEnd = cur + duration
			cur = plan[idx].NewEnd
		}
		if cur > chunk.End+0.6 {
			report.Warnings = append(report.Warnings, fmt.Sprintf("chunk %d overflows by %.3fs", chunk.ID, cur-chunk.End))
		}
	}
	return plan, report, nil
}
```

- [ ] **步骤 6：运行测试**

```bash
gofmt -w internal/service/dubbing/planner.go internal/service/dubbing/fit.go internal/service/dubbing/planner_test.go internal/service/dubbing/fit_test.go
go test ./internal/service/dubbing
```

预期：通过。

- [ ] **步骤 7：提交**

```bash
git add internal/service/dubbing/planner.go internal/service/dubbing/fit.go internal/service/dubbing/planner_test.go internal/service/dubbing/fit_test.go
git commit -m "feat: plan and fit dubbing timeline"
```

---

### 任务 5：实现 TTS 生成和音频工具

**文件：**
- 新建：`internal/service/dubbing/tts.go`
- 新建：`internal/service/dubbing/audio.go`
- 测试：`internal/service/dubbing/tts_test.go`
- 测试：`internal/service/dubbing/audio_test.go`

- [ ] **步骤 1：写 TTS 重试测试**

新建 `internal/service/dubbing/tts_test.go`：

```go
package dubbing

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

type fakeTTS struct {
	failures int
	calls    int
}

func (f *fakeTTS) Text2Speech(text, voice, outputFile string) error {
	f.calls++
	if f.calls <= f.failures {
		return errors.New("tts failed")
	}
	return os.WriteFile(outputFile, []byte("wav"), 0644)
}

func TestGenerateRawSegmentsRetriesAndWritesFiles(t *testing.T) {
	dir := t.TempDir()
	tts := &fakeTTS{failures: 1}
	plan := []PlanItem{{Index: 1, SpokenText: "你好"}}
	got, err := GenerateRawSegments(context.Background(), tts, plan, "voice", dir, nil, func(string) (float64, error) {
		return 1.2, nil
	})
	if err != nil {
		t.Fatalf("GenerateRawSegments() error = %v", err)
	}
	if tts.calls != 2 {
		t.Fatalf("calls = %d, want 2", tts.calls)
	}
	if got[0].ActualDuration != 1.2 {
		t.Fatalf("ActualDuration = %v", got[0].ActualDuration)
	}
	if _, err := os.Stat(filepath.Join(dir, "raw", "1.wav")); err != nil {
		t.Fatalf("raw file missing: %v", err)
	}
}
```

- [ ] **步骤 2：写音频工具测试**

新建 `internal/service/dubbing/audio_test.go`：

```go
package dubbing

import "testing"

func TestBuildAtempoFilterChainsLargeSpeed(t *testing.T) {
	got := buildAtempoFilter(3.0)
	if got != "atempo=2.000,atempo=1.500" {
		t.Fatalf("buildAtempoFilter(3) = %q", got)
	}
}

func TestBuildMuxArgsMapsVideoAndDubAudio(t *testing.T) {
	args := buildMuxArgs("input.mp4", "dub.wav", "out.mp4")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-map 0:v:0") || !strings.Contains(joined, "-map 1:a:0") {
		t.Fatalf("args should map original video and dub audio: %v", args)
	}
}
```

- [ ] **步骤 3：确认测试失败**

```bash
go test ./internal/service/dubbing
```

预期：失败，原因是 TTS 和音频函数尚不存在。

- [ ] **步骤 4：实现 `tts.go`**

创建 `internal/service/dubbing/tts.go`：

```go
package dubbing

import (
	"context"
	"fmt"
	"krillin-ai/internal/types"
	"os"
	"path/filepath"
)

func GenerateRawSegments(ctx context.Context, tts types.Ttser, plan []PlanItem, voice, dir string, run CommandRunner, duration DurationProbe) ([]PlanItem, error) {
	if run == nil {
		run = defaultFFmpegRunner
	}
	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		return nil, err
	}
	for i := range plan {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		output := filepath.Join(rawDir, fmt.Sprintf("%d.wav", plan[i].Index))
		if IsSilenceOnlyText(plan[i].SpokenText) {
			if err := WriteTinySilence(output, run); err != nil {
				return nil, err
			}
		} else {
			if err := retryTTS(tts, plan[i].SpokenText, voice, output, 3); err != nil {
				return nil, fmt.Errorf("tts segment %d failed: %w", plan[i].Index, err)
			}
		}
		dur, err := duration(output)
		if err != nil {
			return nil, err
		}
		plan[i].ActualDuration = dur
	}
	return plan, nil
}

func retryTTS(tts types.Ttser, text, voice, output string, attempts int) error {
	var last error
	for i := 0; i < attempts; i++ {
		last = tts.Text2Speech(text, voice, output)
		if last == nil {
			if _, err := os.Stat(output); err == nil {
				return nil
			}
			last = fmt.Errorf("output file missing: %s", output)
		}
	}
	return last
}
```

- [ ] **步骤 5：实现 `audio.go` 基础工具**

创建 `internal/service/dubbing/audio.go`：

```go
package dubbing

import (
	"fmt"
	"krillin-ai/internal/storage"
	"os/exec"
	"strings"
)

func defaultFFmpegRunner(args []string) error {
	cmd := exec.Command(storage.FfmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %w, output: %s", err, string(output))
	}
	return nil
}

func WriteTinySilence(output string, run CommandRunner) error {
	if run == nil {
		run = defaultFFmpegRunner
	}
	return run([]string{
		"-y",
		"-f", "lavfi",
		"-i", "anullsrc=channel_layout=mono:sample_rate=44100",
		"-t", "0.100",
		"-ar", "44100",
		"-ac", "1",
		"-c:a", "pcm_s16le",
		output,
	})
}

func buildAtempoFilter(speed float64) string {
	if speed <= 0 {
		speed = 1
	}
	parts := []string{}
	for speed > 2.0 {
		parts = append(parts, "atempo=2.000")
		speed /= 2.0
	}
	for speed < 0.5 {
		parts = append(parts, "atempo=0.500")
		speed /= 0.5
	}
	parts = append(parts, fmt.Sprintf("atempo=%.3f", speed))
	return strings.Join(parts, ",")
}

func buildMuxArgs(inputVideo, inputAudio, outputVideo string) []string {
	return []string{
		"-y",
		"-i", inputVideo,
		"-i", inputAudio,
		"-c:v", "copy",
		"-map", "0:v:0",
		"-map", "1:a:0",
		"-c:a", "aac",
		"-b:a", "192k",
		outputVideo,
	}
}
```

- [ ] **步骤 6：运行测试**

```bash
gofmt -w internal/service/dubbing/tts.go internal/service/dubbing/audio.go internal/service/dubbing/tts_test.go internal/service/dubbing/audio_test.go
go test ./internal/service/dubbing
```

预期：通过。

- [ ] **步骤 7：提交**

```bash
git add internal/service/dubbing/tts.go internal/service/dubbing/audio.go internal/service/dubbing/tts_test.go internal/service/dubbing/audio_test.go
git commit -m "feat: add dubbing tts and audio helpers"
```

---

### 任务 6：实现 runner、音频拼接、字幕和视频输出

**文件：**
- 新建：`internal/service/dubbing/runner.go`
- 修改：`internal/service/dubbing/audio.go`
- 测试：`internal/service/dubbing/runner_test.go`
- 测试：`internal/service/dubbing/audio_assemble_test.go`

- [ ] **步骤 1：写 runner fake 测试**

新建 `internal/service/dubbing/runner_test.go`：

```go
package dubbing

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fakeRunnerWritingOutputs(dir string) CommandRunner {
	return func(args []string) error {
		out := args[len(args)-1]
		if strings.HasSuffix(out, ".wav") || strings.HasSuffix(out, ".mp4") {
			return os.WriteFile(out, []byte("media"), 0644)
		}
		return nil
	}
}

func TestRunWritesDubbingArtifactsWithFakeTTS(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.srt")
	video := filepath.Join(dir, "origin.mp4")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(video, []byte("video"), 0644); err != nil {
		t.Fatal(err)
	}
	deps := Dependencies{
		TTS:         &fakeTTS{},
		Language:    "zh_cn",
		Voice:       "voice",
		Workdir:     dir,
		InputSRT:    input,
		InputVideo:  video,
		OutputAudio: filepath.Join(dir, "tts_final_audio.wav"),
		OutputVideo: filepath.Join(dir, "video_with_tts.mp4"),
		Config:      DefaultConfig(),
		FFmpeg:      fakeRunnerWritingOutputs(dir),
		Duration: func(string) (float64, error) {
			return 0.8, nil
		},
	}
	result, err := NewRunner(deps).Run(context.Background())
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	for _, path := range []string{
		filepath.Join(dir, DubbingDirName, DubbingInputFileName),
		filepath.Join(dir, DubbingDirName, DubbingPlanFileName),
		filepath.Join(dir, DubbingDirName, DubbingReportName),
		filepath.Join(dir, DubbingDirName, DubSubtitleFileName),
		result.Audio,
		result.Video,
	} {
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			t.Fatalf("missing output %s: info=%v err=%v", path, info, err)
		}
	}
}

func TestRunnerRequiresInputVideoForMux(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.srt")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	deps := Dependencies{
		TTS:         &fakeTTS{},
		Language:    "zh_cn",
		Voice:       "voice",
		Workdir:     dir,
		InputSRT:    input,
		OutputAudio: filepath.Join(dir, "tts_final_audio.wav"),
		OutputVideo: filepath.Join(dir, "video_with_tts.mp4"),
		Config:      DefaultConfig(),
		FFmpeg:      fakeRunnerWritingOutputs(dir),
		Duration: func(string) (float64, error) {
			return 0.8, nil
		},
	}
	_, err := NewRunner(deps).Run(context.Background())
	if err == nil {
		t.Fatalf("Run() error = nil, want missing input video error")
	}
}
```

- [ ] **步骤 2：写音频拼接测试**

新建 `internal/service/dubbing/audio_assemble_test.go`：

```go
package dubbing

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssembleAudioWritesConcatListInFittedDir(t *testing.T) {
	dir := t.TempDir()
	rawDir := filepath.Join(dir, "raw")
	if err := os.MkdirAll(rawDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(rawDir, "1.wav"), []byte("raw"), 0644); err != nil {
		t.Fatal(err)
	}
	plan := []PlanItem{{Index: 1, NewStart: 0.5, NewEnd: 1.3, SpeedFactor: 1.0}}
	err := AssembleAudio(plan, dir, filepath.Join(dir, "out.wav"), func(args []string) error {
		return os.WriteFile(args[len(args)-1], []byte("media"), 0644)
	})
	if err != nil {
		t.Fatalf("AssembleAudio() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "fitted", "concat.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "silence_1.wav") || !strings.Contains(string(data), "1.wav") {
		t.Fatalf("concat list = %q", string(data))
	}
}
```

- [ ] **步骤 3：确认测试失败**

```bash
go test ./internal/service/dubbing
```

预期：失败，原因是 runner 和完整拼接函数尚不存在。

- [ ] **步骤 4：扩展 `audio.go`**

在 `internal/service/dubbing/audio.go` 中追加：

```go
func BuildDubCues(plan []PlanItem) []Cue {
	cues := make([]Cue, 0, len(plan))
	for i, item := range plan {
		cues = append(cues, Cue{
			Index: i + 1,
			Start: item.NewStart,
			End:   item.NewEnd,
			Text:  item.SpokenText,
		})
	}
	return cues
}

func fittedSegmentPath(segmentsDir string, index int) string {
	return filepath.Join(segmentsDir, "fitted", fmt.Sprintf("%d.wav", index))
}

func AssembleAudio(plan []PlanItem, segmentsDir, outputAudio string, run CommandRunner) error {
	if run == nil {
		run = defaultFFmpegRunner
	}
	fittedDir := filepath.Join(segmentsDir, "fitted")
	if err := os.MkdirAll(fittedDir, 0755); err != nil {
		return err
	}
	for _, item := range plan {
		raw := filepath.Join(segmentsDir, "raw", fmt.Sprintf("%d.wav", item.Index))
		fitted := fittedSegmentPath(segmentsDir, item.Index)
		args := []string{"-y", "-i", raw, "-filter:a", buildAtempoFilter(item.SpeedFactor), "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", fitted}
		if err := run(args); err != nil {
			return err
		}
	}
	listFile := filepath.Join(fittedDir, "concat.txt")
	var list strings.Builder
	lastEnd := 0.0
	for _, item := range plan {
		if item.NewStart > lastEnd {
			silence := filepath.Join(fittedDir, fmt.Sprintf("silence_%d.wav", item.Index))
			args := []string{"-y", "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100", "-t", fmt.Sprintf("%.3f", item.NewStart-lastEnd), "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", silence}
			if err := run(args); err != nil {
				return err
			}
			list.WriteString(fmt.Sprintf("file '%s'\n", filepath.Base(silence)))
		}
		list.WriteString(fmt.Sprintf("file '%s'\n", filepath.Base(fittedSegmentPath(segmentsDir, item.Index))))
		lastEnd = item.NewEnd
	}
	if err := os.WriteFile(listFile, []byte(list.String()), 0644); err != nil {
		return err
	}
	return run([]string{"-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outputAudio})
}
```

把 `audio.go` imports 扩展为包含 `os` 和 `path/filepath`。

- [ ] **步骤 5：实现 runner**

创建 `internal/service/dubbing/runner.go`：

```go
package dubbing

import (
	"context"
	"encoding/json"
	"fmt"
	"krillin-ai/internal/types"
	"krillin-ai/pkg/util"
	"os"
	"path/filepath"
)

type Result struct {
	Plan   []PlanItem
	Chunks []Chunk
	Report Report
	DubSRT string
	Audio  string
	Video  string
}

type Runner struct {
	deps Dependencies
}

func NewRunner(deps Dependencies) *Runner {
	if deps.Config.MaxChunkSize <= 0 {
		deps.Config = DefaultConfig()
	}
	if deps.FFmpeg == nil {
		deps.FFmpeg = defaultFFmpegRunner
	}
	if deps.Duration == nil {
		deps.Duration = util.GetAudioDuration
	}
	if deps.OutputAudio == "" && deps.Workdir != "" {
		deps.OutputAudio = filepath.Join(deps.Workdir, types.TtsResultAudioFileName)
	}
	if deps.OutputVideo == "" && deps.Workdir != "" {
		deps.OutputVideo = filepath.Join(deps.Workdir, types.SubtitleTaskVideoWithTtsFileName)
	}
	return &Runner{deps: deps}
}

func (r *Runner) Run(ctx context.Context) (Result, error) {
	if err := r.validate(); err != nil {
		return Result{}, err
	}
	dubDir := filepath.Join(r.deps.Workdir, DubbingDirName)
	segmentsDir := filepath.Join(dubDir, "segments")
	if err := os.MkdirAll(segmentsDir, 0755); err != nil {
		return Result{}, err
	}
	cues, err := ParseSRTFile(r.deps.InputSRT)
	if err != nil {
		return Result{}, err
	}
	cleaned := make([]Cue, 0, len(cues))
	for _, cue := range cues {
		cue.Text = CleanTextForSpeech(cue.Text)
		cleaned = append(cleaned, cue)
	}
	inputSRT := filepath.Join(dubDir, DubbingInputFileName)
	if err := WriteSRTFile(inputSRT, cleaned); err != nil {
		return Result{}, err
	}
	planner := NewPlanner(r.deps.Config, NewStatisticalEstimator(), NewLLMOptimizer(r.deps.Chat))
	plan, chunks, err := planner.Plan(cues, r.deps.Language)
	if err != nil {
		return Result{}, err
	}
	plan, err = GenerateRawSegments(ctx, r.deps.TTS, plan, r.deps.Voice, segmentsDir, r.deps.FFmpeg, r.deps.Duration)
	if err != nil {
		return Result{}, err
	}
	fitted, report, err := FitTimeline(plan, chunks, r.deps.Config)
	if err != nil {
		return Result{}, err
	}
	dubSRT := filepath.Join(dubDir, DubSubtitleFileName)
	if err := WriteSRTFile(dubSRT, BuildDubCues(fitted)); err != nil {
		return Result{}, err
	}
	if err := writeJSON(filepath.Join(dubDir, DubbingPlanFileName), fitted); err != nil {
		return Result{}, err
	}
	if err := writeJSON(filepath.Join(dubDir, DubbingReportName), report); err != nil {
		return Result{}, err
	}
	if err := AssembleAudio(fitted, segmentsDir, r.deps.OutputAudio, r.deps.FFmpeg); err != nil {
		return Result{}, err
	}
	if err := ensureNonEmptyFile(r.deps.OutputAudio, "dubbing audio output"); err != nil {
		return Result{}, err
	}
	if err := r.deps.FFmpeg(buildMuxArgs(r.deps.InputVideo, r.deps.OutputAudio, r.deps.OutputVideo)); err != nil {
		return Result{}, err
	}
	if err := ensureNonEmptyFile(r.deps.OutputVideo, "video mux output"); err != nil {
		return Result{}, err
	}
	return Result{Plan: fitted, Chunks: chunks, Report: report, DubSRT: dubSRT, Audio: r.deps.OutputAudio, Video: r.deps.OutputVideo}, nil
}

func (r *Runner) validate() error {
	if r.deps.Workdir == "" {
		return fmt.Errorf("workdir is required")
	}
	if r.deps.InputSRT == "" {
		return fmt.Errorf("input srt is required")
	}
	if r.deps.TTS == nil {
		return fmt.Errorf("tts client is required")
	}
	if r.deps.InputVideo == "" {
		return fmt.Errorf("input video is required for video_with_tts output")
	}
	return ensureNonEmptyFile(r.deps.InputVideo, "input video")
}

func ensureNonEmptyFile(path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("%s missing: %w", label, err)
	}
	if info.Size() == 0 {
		return fmt.Errorf("%s empty: %s", label, path)
	}
	return nil
}

func writeJSON(path string, value interface{}) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0644)
}
```

- [ ] **步骤 6：运行测试**

```bash
gofmt -w internal/service/dubbing/audio.go internal/service/dubbing/runner.go internal/service/dubbing/runner_test.go internal/service/dubbing/audio_assemble_test.go
go test ./internal/service/dubbing
```

预期：通过。

- [ ] **步骤 7：提交**

```bash
git add internal/service/dubbing/audio.go internal/service/dubbing/runner.go internal/service/dubbing/runner_test.go internal/service/dubbing/audio_assemble_test.go
git commit -m "feat: assemble dubbing outputs"
```

---

### 任务 7：替换 Web 和 CLI 配音入口

**文件：**
- 修改：`internal/service/audio2subtitle.go`
- 修改：`internal/service/srt2speech.go`
- 修改：`internal/pipeline/tts.go`
- 测试：`internal/service/srt2speech_test.go`
- 测试：`internal/pipeline/tts_test.go`

- [ ] **步骤 1：写 Web 输入选择测试**

新建 `internal/service/srt2speech_test.go`：

```go
package service

import (
	"path/filepath"
	"testing"
)

func TestTargetSRTPathForDubbingUsesTargetLanguageFile(t *testing.T) {
	base := filepath.Join("tasks", "demo")
	got := targetSRTPathForDubbing(base)
	want := filepath.Join(base, "target_language_srt.srt")
	if got != want {
		t.Fatalf("targetSRTPathForDubbing() = %q, want %q", got, want)
	}
}
```

- [ ] **步骤 2：扩展 CLI 语言测试**

在 `internal/pipeline/tts_test.go` 的 `TestGenerateTTSUsesManifestTargetSRTWhenInputEmpty` 中追加断言：

```go
if fake.lastSpeech.TargetLanguage != "zh_cn" {
	t.Fatalf("TargetLanguage = %q, want zh_cn", fake.lastSpeech.TargetLanguage)
}
```

并在该测试创建 manifest 后设置：

```go
manifest.TargetLanguage = "zh_cn"
```

- [ ] **步骤 3：确认测试失败**

```bash
go test ./internal/service ./internal/pipeline
```

预期：失败，原因是 `targetSRTPathForDubbing` 不存在，CLI 尚未把 manifest 目标语言传给 stepParam。

- [ ] **步骤 4：修正 Web 配音输入**

在 `internal/service/srt2speech.go` 添加：

```go
func targetSRTPathForDubbing(taskBasePath string) string {
	return filepath.Join(taskBasePath, types.SubtitleTaskTargetLanguageSrtFileName)
}
```

在 `internal/service/audio2subtitle.go` 中把：

```go
stepParam.TtsSourceFilePath = stepParam.BilingualSrtFilePath
```

改为：

```go
stepParam.TtsSourceFilePath = targetSRTPathForDubbing(stepParam.TaskBasePath)
```

- [ ] **步骤 5：替换 `srtFileToSpeech` 主体**

在 `internal/service/srt2speech.go` 中保留函数名，替换为新 runner 调用。必须保留音色克隆：

```go
func (s Service) srtFileToSpeech(ctx context.Context, stepParam *types.SubtitleTaskStepParam) error {
	if !stepParam.EnableTts {
		return nil
	}
	if stepParam.TtsSourceFilePath == "" {
		stepParam.TtsSourceFilePath = targetSRTPathForDubbing(stepParam.TaskBasePath)
	}
	voiceCode := stepParam.TtsVoiceCode
	if stepParam.VoiceCloneAudioUrl != "" {
		code, err := s.VoiceCloneClient.CosyVoiceClone("krillinai", stepParam.VoiceCloneAudioUrl)
		if err != nil {
			return fmt.Errorf("srtFileToSpeech CosyVoiceClone error: %w", err)
		}
		voiceCode = code
	}
	outputAudio := stepParam.TtsResultFilePath
	if outputAudio == "" {
		outputAudio = filepath.Join(stepParam.TaskBasePath, types.TtsResultAudioFileName)
	}
	outputVideo := stepParam.VideoWithTtsFilePath
	if outputVideo == "" {
		outputVideo = filepath.Join(stepParam.TaskBasePath, types.SubtitleTaskVideoWithTtsFileName)
	}
	runner := dubbing.NewRunner(dubbing.Dependencies{
		TTS:         s.TtsClient,
		Chat:        s.ChatCompleter,
		Language:    stepParam.TargetLanguage,
		Voice:       voiceCode,
		Workdir:     stepParam.TaskBasePath,
		InputSRT:    stepParam.TtsSourceFilePath,
		InputVideo:  stepParam.InputVideoPath,
		OutputAudio: outputAudio,
		OutputVideo: outputVideo,
		Config: dubbing.Config{
			MinSubtitleDuration: config.Conf.Dubbing.MinSubtitleDuration,
			MaxChunkSize:        config.Conf.Dubbing.MaxChunkSize,
			GapTolerance:        config.Conf.Dubbing.GapTolerance,
			SpeedMin:            config.Conf.Dubbing.SpeedMin,
			SpeedAccept:         config.Conf.Dubbing.SpeedAccept,
			SpeedMax:            config.Conf.Dubbing.SpeedMax,
			EnableTextRewrite:   config.Conf.Dubbing.EnableTextRewrite,
			RewriteMaxAttempts:  config.Conf.Dubbing.RewriteMaxAttempts,
			Estimator:           config.Conf.Dubbing.Estimator,
		},
	})
	result, err := runner.Run(ctx)
	if err != nil {
		return fmt.Errorf("srtFileToSpeech dubbing runner error: %w", err)
	}
	stepParam.TtsResultFilePath = result.Audio
	stepParam.VideoWithTtsFilePath = result.Video
	if stepParam.TaskPtr != nil {
		stepParam.TaskPtr.ProcessPct = 98
	}
	return nil
}
```

新增 imports：`krillin-ai/config`、`krillin-ai/internal/service/dubbing`。删除旧算法残留的未使用 imports 和 helper 函数。`processSubtitlesConcurrently`、`parseSRT`、`adjustAudioDuration`、`concatenateAudioFiles`、`newGenerateSilence` 只要不再被其他文件调用，就一并删除。

- [ ] **步骤 6：修正 CLI 语言传递**

在 `internal/pipeline/tts.go` 创建 `SubtitleTaskStepParam` 时新增：

```go
TargetLanguage: types.StandardLanguageCode(manifest.TargetLanguage),
```

保持 `TtsResultFilePath` 和 `VideoWithTtsFilePath` 使用 manifest 当前输出，不能退回硬编码路径。

- [ ] **步骤 7：运行测试**

```bash
gofmt -w internal/service/srt2speech.go internal/service/audio2subtitle.go internal/pipeline/tts.go internal/service/srt2speech_test.go internal/pipeline/tts_test.go
go test ./internal/service/dubbing ./internal/service ./internal/pipeline
```

预期：通过。

- [ ] **步骤 8：提交**

```bash
git add internal/service/srt2speech.go internal/service/audio2subtitle.go internal/pipeline/tts.go internal/service/srt2speech_test.go internal/pipeline/tts_test.go
git commit -m "feat: route tts through high quality dubbing"
```

---

### 任务 8：端到端验证和回归收口

**文件：**
- 修改：`internal/service/dubbing/runner_test.go`
- 修改：`internal/service/dubbing/audio_assemble_test.go`

- [ ] **步骤 1：补充失败路径测试**

在 `internal/service/dubbing/runner_test.go` 增加：

```go
func TestRunFailsWhenMuxDoesNotCreateOutput(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.srt")
	video := filepath.Join(dir, "origin.mp4")
	if err := os.WriteFile(input, []byte("1\n00:00:00,000 --> 00:00:01,000\n你好\n\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(video, []byte("video"), 0644); err != nil {
		t.Fatal(err)
	}
	deps := Dependencies{
		TTS:         &fakeTTS{},
		Language:    "zh_cn",
		Voice:       "voice",
		Workdir:     dir,
		InputSRT:    input,
		InputVideo:  video,
		OutputAudio: filepath.Join(dir, "tts_final_audio.wav"),
		OutputVideo: filepath.Join(dir, "video_with_tts.mp4"),
		Config:      DefaultConfig(),
		FFmpeg: func(args []string) error {
			out := args[len(args)-1]
			if strings.HasSuffix(out, ".wav") {
				return os.WriteFile(out, []byte("media"), 0644)
			}
			return nil
		},
		Duration: func(string) (float64, error) {
			return 0.8, nil
		},
	}
	_, err := NewRunner(deps).Run(context.Background())
	if err == nil {
		t.Fatalf("Run() error = nil, want missing mux output error")
	}
}
```

- [ ] **步骤 2：运行聚焦测试**

```bash
go test ./internal/service/dubbing ./internal/service ./internal/pipeline
```

预期：通过。若步骤 1 失败，修正 runner 输出校验后重跑同一命令。

- [ ] **步骤 3：运行全项目测试**

```bash
go test ./...
```

预期：通过。若外部服务相关测试因为本地凭据缺失失败，记录失败 package 和错误信息，并保留步骤 2 的聚焦测试作为本次功能验证。

- [ ] **步骤 4：本地手工 smoke**

生成本地视频 fixture：

```bash
mkdir -p tasks/dubbing-smoke
ffmpeg -y -f lavfi -i color=c=black:s=320x180:d=3 -f lavfi -i anullsrc=channel_layout=mono:sample_rate=44100 -shortest -c:v libx264 -c:a aac tasks/dubbing-smoke/origin_video.mp4
cat > tasks/dubbing-smoke/target_language_srt.srt <<'EOF'
1
00:00:00,000 --> 00:00:01,200
你好，我们开始吧。

2
00:00:01,500 --> 00:00:02,700
这是一段测试配音。

EOF
```

在本地已有可用 TTS provider 配置时运行：

```bash
./build/krillinai-cli tts --workdir tasks/dubbing-smoke --input-srt tasks/dubbing-smoke/target_language_srt.srt --video tasks/dubbing-smoke/origin_video.mp4 --voice voice-a
```

检查：

```bash
test -s tasks/dubbing-smoke/tts_final_audio.wav
test -s tasks/dubbing-smoke/video_with_tts.mp4
test -s tasks/dubbing-smoke/dubbing/dub.srt
test -s tasks/dubbing-smoke/dubbing/dubbing_plan.json
test -s tasks/dubbing-smoke/dubbing/dubbing_report.json
```

若本地没有可用 TTS provider 凭据，在交付说明中记录：`手工 smoke 因本地没有可用 TTS provider 凭据而跳过`。

- [ ] **步骤 5：提交**

```bash
git add internal/service/dubbing/runner_test.go internal/service/dubbing/audio_assemble_test.go
git commit -m "test: verify high quality dubbing pipeline"
```

---

## 自审清单

- 旧接口直接替换：任务 7。
- Web 使用目标语言单语 SRT：任务 7。
- CLI 保留 `GenerateTTS`，并向 service 传递 manifest 目标语言：任务 7。
- 保留音色克隆：任务 7。
- 输出路径兼容 `stepParam` 和 manifest：任务 6、任务 7。
- SRT 稳健解析和文本清理：任务 2。
- 高级统计估时、语言 profile、惩罚项和校准：任务 3。
- LLM 口播化改写：任务 3、任务 4。
- VideoLingo 风格短句合并和 chunk 规划：任务 4。
- TTS 重试和正常文本失败即失败：任务 5。
- chunk 级时间轴拟合和调速 warning：任务 4。
- `dubbing_input.srt`、`dub.srt`、`dubbing_plan.json`、`dubbing_report.json`：任务 6。
- 音频拼接、视频 mux 和输出非空校验：任务 6、任务 8。
- 第一阶段非目标未混入：没有 Demucs、背景混音、多说话人、口型同步。
