# CLI 字幕样式支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 KrillinAI CLI 增加 Agent 可编排的字幕样式 JSON 能力，让 `subtitle`、`render-horizontal`、`render-vertical` 能接收样式文件，并由 service 生成对应 ASS 样式与效果标签。

**Architecture:** 新增 `internal/subtitle_style` 作为唯一的样式解析、合并、校验和 ASS 生成模块；CLI 读取默认 JSON 与用户覆盖 JSON，pipeline/service 只传递已解析的样式对象；`srtToAss` 根据样式对象生成 ASS header 和 Dialogue override tags。默认样式文件缺失时回退代码默认值，用户显式样式文件错误时直接失败。

**Tech Stack:** Go 标准库 `encoding/json`、现有 `flag` CLI、现有 `internal/pipeline`、`internal/service/srt_embed.go`、ffmpeg/libass ASS 渲染链路。

---

## 范围检查

本规格集中在一个子系统：CLI 字幕样式基座能力。它包含样式文件、CLI 入参、pipeline 传递和 ASS 生成，但这些都服务于同一个可测试目标：传入 JSON 后生成不同的真实 ASS/视频。无需拆成多个独立计划。

已有未提交改动：

- `internal/service/youtube_subtitle_test.go` 当前有上一轮测试路径修复，执行本计划时不要误纳入字幕样式提交，除非用户明确要求一并提交。

## 文件结构

- Create: `internal/subtitle_style/style.go`
  - 定义 `StyleSet`、`ScreenStyle`、`Style`、默认样式、深度合并、字段校验、颜色转换、ASS header 生成、Dialogue tag 生成。
- Create: `internal/subtitle_style/style_test.go`
  - 覆盖默认样式、颜色转换、未知字段、深度合并、raw style、fade/override tags。
- Create: `config/subtitle-style-default.json`
  - 项目默认样式，语义对齐当前固定 ASS header。
- Create: `config/subtitle-style-example.json`
  - 给 Agent/开发者参考的覆盖样式示例。
- Modify: `internal/types/subtitle_task.go`
  - `SubtitleTaskStepParam` 增加 `SubtitleStyle *subtitlestyle.StyleSet`。
- Modify: `internal/service/srt_embed.go`
  - `srtToAss` 改为从 `SubtitleStyle` 生成 ASS header 和 Dialogue tags。
- Modify: `internal/service/srt_embed_test.go`
  - 增加自定义样式影响 ASS 的测试。
- Modify: `internal/service/render_stage.go`
  - 确保 `RenderVideoRequest.StepParam.SubtitleStyle` 进入 `srtToAss`，nil 时保持默认。
- Modify: `internal/pipeline/render.go`
  - `RenderRequest` 增加 `SubtitleStyle *subtitlestyle.StyleSet`，传入 `StepParam`。
- Modify: `internal/pipeline/subtitle.go`
  - `SubtitleRequest` 增加 `SubtitleStyle *subtitlestyle.StyleSet`，传入 `StepParam`。
- Modify: `internal/pipeline/render_test.go`
  - 验证 render pipeline 透传样式。
- Modify: `internal/pipeline/subtitle_test.go`
  - 验证 subtitle pipeline 透传样式到 stepParam。
- Modify: `internal/cli/commands.go`
  - `subtitle`、`render-horizontal`、`render-vertical` 增加 `--subtitle-style-file`；Execute/dry-run 加载并校验样式。
- Modify: `internal/cli/commands_test.go`
  - 验证参数解析、help 文案、样式文件加载错误。

---

### Task 1: 新增字幕样式模块

**Files:**
- Create: `internal/subtitle_style/style.go`
- Create: `internal/subtitle_style/style_test.go`

- [ ] **Step 1: 写失败测试**

在 `internal/subtitle_style/style_test.go` 新建测试文件：

```go
package subtitlestyle

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultStyleBuildsCurrentHorizontalHeader(t *testing.T) {
	style := DefaultStyleSet()
	header := BuildAssHeader(style, true)

	if !strings.Contains(header, "Style: Major,Arial,14,&H0000BFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,2,10,10,20,1") {
		t.Fatalf("horizontal Major style missing current defaults:\n%s", header)
	}
	if !strings.Contains(header, "Style: Minor,Arial,10,&H0000BFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2.5,1.5,2,10,10,30,1") {
		t.Fatalf("horizontal Minor style missing current defaults:\n%s", header)
	}
}

func TestParseColorConvertsHTMLToASS(t *testing.T) {
	got, err := NormalizeASSColor("#3366CC")
	if err != nil {
		t.Fatalf("NormalizeASSColor() error = %v", err)
	}
	if got != "&H00CC6633" {
		t.Fatalf("NormalizeASSColor() = %q, want &H00CC6633", got)
	}

	got, err = NormalizeASSColor("#3366CC80")
	if err != nil {
		t.Fatalf("NormalizeASSColor(alpha) error = %v", err)
	}
	if got != "&H80CC6633" {
		t.Fatalf("NormalizeASSColor(alpha) = %q, want &H80CC6633", got)
	}
}

func TestLoadOverrideRejectsUnknownField(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "style.json")
	if err := os.WriteFile(path, []byte(`{"horizontal":{"major":{"font_colour":"#fff"}}}`), 0644); err != nil {
		t.Fatal(err)
	}

	_, err := LoadOverrideFile(path)
	if err == nil {
		t.Fatal("LoadOverrideFile() error = nil, want unknown field error")
	}
	if !strings.Contains(err.Error(), "font_colour") {
		t.Fatalf("error = %v, want field path containing font_colour", err)
	}
}

func TestMergeKeepsDefaultsForMissingFields(t *testing.T) {
	base := DefaultStyleSet()
	override := &StyleSet{
		Horizontal: ScreenStyle{
			Major: Style{PrimaryColor: "#FFFFFF", Outline: floatPtr(3)},
		},
	}

	got, err := Merge(base, override)
	if err != nil {
		t.Fatalf("Merge() error = %v", err)
	}
	if got.Horizontal.Major.PrimaryColor != "#FFFFFF" {
		t.Fatalf("primary color = %q, want override", got.Horizontal.Major.PrimaryColor)
	}
	if got.Horizontal.Major.FontSize == nil || *got.Horizontal.Major.FontSize != 14 {
		t.Fatalf("font size not inherited: %#v", got.Horizontal.Major.FontSize)
	}
	if got.Vertical.Minor.FontSize == nil || *got.Vertical.Minor.FontSize != 7 {
		t.Fatalf("vertical minor font size not inherited: %#v", got.Vertical.Minor.FontSize)
	}
}

func TestRawStyleAndDialogueTags(t *testing.T) {
	style := DefaultStyleSet()
	style.Horizontal.Major.RawASSStyle = "Style: Major,Arial,30,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,20,20,40,1"
	style.Horizontal.Major.FadeInMS = intPtr(120)
	style.Horizontal.Major.FadeOutMS = intPtr(180)
	style.Horizontal.Major.OverrideTags = `\blur1`

	header := BuildAssHeader(style, true)
	if !strings.Contains(header, style.Horizontal.Major.RawASSStyle) {
		t.Fatalf("raw style was not used:\n%s", header)
	}
	tags := DialogueTags(style.Horizontal.Major)
	if tags != `{\fad(120,180)\blur1}` {
		t.Fatalf("DialogueTags() = %q", tags)
	}
}

func intPtr(v int) *int { return &v }
func floatPtr(v float64) *float64 { return &v }
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
go test -count=1 ./internal/subtitle_style
```

Expected: FAIL，原因是 `internal/subtitle_style` 包和函数尚不存在。

- [ ] **Step 3: 写最小实现**

创建 `internal/subtitle_style/style.go`，实现以下公开 API 和核心逻辑：

```go
package subtitlestyle

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
)

const assHeaderPrefix = `[Script Info]
Title: Example
Original Script:
ScriptType: v4.00+
PlayDepth: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`

const assEvents = `

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

type StyleSet struct {
	Version    int         `json:"version,omitempty"`
	Horizontal ScreenStyle `json:"horizontal,omitempty"`
	Vertical   ScreenStyle `json:"vertical,omitempty"`
}

type ScreenStyle struct {
	Major Style `json:"major,omitempty"`
	Minor Style `json:"minor,omitempty"`
}

type Style struct {
	FontName       string   `json:"font_name,omitempty"`
	FontSize       *int     `json:"font_size,omitempty"`
	PrimaryColor   string   `json:"primary_color,omitempty"`
	SecondaryColor string   `json:"secondary_color,omitempty"`
	OutlineColor   string   `json:"outline_color,omitempty"`
	BackColor      string   `json:"back_color,omitempty"`
	Bold           *bool    `json:"bold,omitempty"`
	Italic         *bool    `json:"italic,omitempty"`
	Underline      *bool    `json:"underline,omitempty"`
	StrikeOut      *bool    `json:"strike_out,omitempty"`
	ScaleX         *int     `json:"scale_x,omitempty"`
	ScaleY         *int     `json:"scale_y,omitempty"`
	Spacing        *float64 `json:"spacing,omitempty"`
	Angle          *float64 `json:"angle,omitempty"`
	BorderStyle    *int     `json:"border_style,omitempty"`
	Outline        *float64 `json:"outline,omitempty"`
	Shadow         *float64 `json:"shadow,omitempty"`
	Alignment      *int     `json:"alignment,omitempty"`
	MarginL        *int     `json:"margin_l,omitempty"`
	MarginR        *int     `json:"margin_r,omitempty"`
	MarginV        *int     `json:"margin_v,omitempty"`
	Encoding       *int     `json:"encoding,omitempty"`
	FadeInMS       *int     `json:"fade_in_ms,omitempty"`
	FadeOutMS      *int     `json:"fade_out_ms,omitempty"`
	OverrideTags   string   `json:"override_tags,omitempty"`
	RawASSStyle    string   `json:"raw_ass_style,omitempty"`
}

func DefaultStyleSet() *StyleSet {
	bold := true
	off := false
	return &StyleSet{
		Version: 1,
		Horizontal: ScreenStyle{
			Major: style("Arial", 14, "#FFBF00", "#FF0000", "#000000", "#00000064", bold, off, 100, 100, 0, 0, 1, 2.5, 1.5, 2, 10, 10, 20, 1),
			Minor: style("Arial", 10, "#FFBF00", "#FF0000", "#000000", "#00000064", bold, off, 100, 100, 0, 0, 1, 2.5, 1.5, 2, 10, 10, 30, 1),
		},
		Vertical: ScreenStyle{
			Major: style("Arial", 12, "#FFBF00", "#FF0000", "#000000", "#00000064", bold, off, 100, 100, 0, 0, 1, 2.2, 1.2, 2, 10, 10, 92, 1),
			Minor: style("Arial", 7, "#FFBF00", "#FF0000", "#000000", "#00000064", bold, off, 100, 100, 0, 0, 1, 2.0, 1.0, 2, 10, 10, 101, 1),
		},
	}
}

func style(font string, size int, primary, secondary, outlineColor, back string, bold, off bool, scaleX, scaleY int, spacing, angle float64, border int, outline, shadow float64, align, ml, mr, mv, encoding int) Style {
	return Style{
		FontName: font, FontSize: &size, PrimaryColor: primary, SecondaryColor: secondary,
		OutlineColor: outlineColor, BackColor: back, Bold: &bold, Italic: &off,
		Underline: &off, StrikeOut: &off, ScaleX: &scaleX, ScaleY: &scaleY,
		Spacing: &spacing, Angle: &angle, BorderStyle: &border, Outline: &outline,
		Shadow: &shadow, Alignment: &align, MarginL: &ml, MarginR: &mr,
		MarginV: &mv, Encoding: &encoding,
	}
}

func LoadOverrideFile(path string) (*StyleSet, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read subtitle style file %s: %w", path, err)
	}
	return Decode(data, path)
}

func Decode(data []byte, source string) (*StyleSet, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var style StyleSet
	if err := dec.Decode(&style); err != nil {
		return nil, fmt.Errorf("parse subtitle style %s: %w", source, err)
	}
	if err := Validate(&style); err != nil {
		return nil, err
	}
	return &style, nil
}

func Merge(base, override *StyleSet) (*StyleSet, error) {
	if base == nil {
		base = DefaultStyleSet()
	}
	result := *base
	if override == nil {
		return &result, nil
	}
	if override.Version != 0 {
		result.Version = override.Version
	}
	mergeScreen(&result.Horizontal, override.Horizontal)
	mergeScreen(&result.Vertical, override.Vertical)
	if err := Validate(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func mergeScreen(dst *ScreenStyle, src ScreenStyle) {
	dst.Major = mergeStyle(dst.Major, src.Major)
	dst.Minor = mergeStyle(dst.Minor, src.Minor)
}

func mergeStyle(dst, src Style) Style {
	if src.FontName != "" { dst.FontName = src.FontName }
	if src.FontSize != nil { dst.FontSize = src.FontSize }
	if src.PrimaryColor != "" { dst.PrimaryColor = src.PrimaryColor }
	if src.SecondaryColor != "" { dst.SecondaryColor = src.SecondaryColor }
	if src.OutlineColor != "" { dst.OutlineColor = src.OutlineColor }
	if src.BackColor != "" { dst.BackColor = src.BackColor }
	if src.Bold != nil { dst.Bold = src.Bold }
	if src.Italic != nil { dst.Italic = src.Italic }
	if src.Underline != nil { dst.Underline = src.Underline }
	if src.StrikeOut != nil { dst.StrikeOut = src.StrikeOut }
	if src.ScaleX != nil { dst.ScaleX = src.ScaleX }
	if src.ScaleY != nil { dst.ScaleY = src.ScaleY }
	if src.Spacing != nil { dst.Spacing = src.Spacing }
	if src.Angle != nil { dst.Angle = src.Angle }
	if src.BorderStyle != nil { dst.BorderStyle = src.BorderStyle }
	if src.Outline != nil { dst.Outline = src.Outline }
	if src.Shadow != nil { dst.Shadow = src.Shadow }
	if src.Alignment != nil { dst.Alignment = src.Alignment }
	if src.MarginL != nil { dst.MarginL = src.MarginL }
	if src.MarginR != nil { dst.MarginR = src.MarginR }
	if src.MarginV != nil { dst.MarginV = src.MarginV }
	if src.Encoding != nil { dst.Encoding = src.Encoding }
	if src.FadeInMS != nil { dst.FadeInMS = src.FadeInMS }
	if src.FadeOutMS != nil { dst.FadeOutMS = src.FadeOutMS }
	if src.OverrideTags != "" { dst.OverrideTags = src.OverrideTags }
	if src.RawASSStyle != "" { dst.RawASSStyle = src.RawASSStyle }
	return dst
}

func Validate(set *StyleSet) error {
	if set == nil {
		return nil
	}
	for path, style := range map[string]Style{
		"horizontal.major": set.Horizontal.Major,
		"horizontal.minor": set.Horizontal.Minor,
		"vertical.major": set.Vertical.Major,
		"vertical.minor": set.Vertical.Minor,
	} {
		if err := validateStyle(path, style); err != nil {
			return err
		}
	}
	return nil
}

func validateStyle(path string, s Style) error {
	if s.FontSize != nil && (*s.FontSize < 1 || *s.FontSize > 200) { return fmt.Errorf("%s.font_size must be 1..200", path) }
	if s.ScaleX != nil && (*s.ScaleX < 1 || *s.ScaleX > 400) { return fmt.Errorf("%s.scale_x must be 1..400", path) }
	if s.ScaleY != nil && (*s.ScaleY < 1 || *s.ScaleY > 400) { return fmt.Errorf("%s.scale_y must be 1..400", path) }
	if s.Alignment != nil && (*s.Alignment < 1 || *s.Alignment > 9) { return fmt.Errorf("%s.alignment must be 1..9", path) }
	if err := validateMargin(path+".margin_l", s.MarginL); err != nil { return err }
	if err := validateMargin(path+".margin_r", s.MarginR); err != nil { return err }
	if err := validateMargin(path+".margin_v", s.MarginV); err != nil { return err }
	if err := validateFloat(path+".outline", s.Outline, 0, 20); err != nil { return err }
	if err := validateFloat(path+".shadow", s.Shadow, 0, 20); err != nil { return err }
	if err := validateFade(path+".fade_in_ms", s.FadeInMS); err != nil { return err }
	if err := validateFade(path+".fade_out_ms", s.FadeOutMS); err != nil { return err }
	for field, value := range map[string]string{"primary_color": s.PrimaryColor, "secondary_color": s.SecondaryColor, "outline_color": s.OutlineColor, "back_color": s.BackColor} {
		if value != "" {
			if _, err := NormalizeASSColor(value); err != nil { return fmt.Errorf("%s.%s: %w", path, field, err) }
		}
	}
	if s.RawASSStyle != "" && !validRawStyleLine(s.RawASSStyle) {
		return fmt.Errorf("%s.raw_ass_style must be a complete ASS Style line", path)
	}
	return nil
}

func validateMargin(path string, value *int) error {
	if value != nil && (*value < 0 || *value > 2000) { return fmt.Errorf("%s must be 0..2000", path) }
	return nil
}

func validateFloat(path string, value *float64, min, max float64) error {
	if value != nil && (*value < min || *value > max) { return fmt.Errorf("%s must be %.0f..%.0f", path, min, max) }
	return nil
}

func validateFade(path string, value *int) error {
	if value != nil && (*value < 0 || *value > 10000) { return fmt.Errorf("%s must be 0..10000", path) }
	return nil
}

func BuildAssHeader(set *StyleSet, horizontal bool) string {
	if set == nil { set = DefaultStyleSet() }
	screen := set.Vertical
	if horizontal { screen = set.Horizontal }
	return assHeaderPrefix +
		styleLine("Major", screen.Major) + "\n" +
		styleLine("Minor", screen.Minor) + "\n" +
		assEvents
}

func styleLine(name string, s Style) string {
	if s.RawASSStyle != "" {
		return s.RawASSStyle
	}
	return fmt.Sprintf("Style: %s,%s,%d,%s,%s,%s,%s,%d,%d,%d,%d,%d,%d,%s,%s,%d,%s,%s,%d,%d,%d,%d,%d",
		name, s.FontName, intValue(s.FontSize), color(s.PrimaryColor), color(s.SecondaryColor),
		color(s.OutlineColor), color(s.BackColor), assBool(s.Bold), assBool(s.Italic),
		assBool(s.Underline), assBool(s.StrikeOut), intValue(s.ScaleX), intValue(s.ScaleY),
		floatString(s.Spacing), floatString(s.Angle), intValue(s.BorderStyle),
		floatString(s.Outline), floatString(s.Shadow), intValue(s.Alignment),
		intValue(s.MarginL), intValue(s.MarginR), intValue(s.MarginV), intValue(s.Encoding))
}

func DialogueTags(s Style) string {
	var tags []string
	if s.FadeInMS != nil || s.FadeOutMS != nil {
		tags = append(tags, fmt.Sprintf(`\fad(%d,%d)`, intValue(s.FadeInMS), intValue(s.FadeOutMS)))
	}
	if strings.TrimSpace(s.OverrideTags) != "" {
		tags = append(tags, normalizeOverrideTags(s.OverrideTags))
	}
	if len(tags) == 0 {
		return ""
	}
	return "{" + strings.Join(tags, "") + "}"
}

func Alignment(s Style) int {
	if s.Alignment == nil || *s.Alignment < 1 || *s.Alignment > 9 {
		return 2
	}
	return *s.Alignment
}

func NormalizeASSColor(input string) (string, error) {
	if strings.HasPrefix(input, "&H") {
		if !regexp.MustCompile(`^&H[0-9A-Fa-f]{6,8}$`).MatchString(input) {
			return "", fmt.Errorf("invalid ASS color %q", input)
		}
		return strings.ToUpper(input), nil
	}
	hex := strings.TrimPrefix(input, "#")
	if len(hex) != 6 && len(hex) != 8 {
		return "", fmt.Errorf("invalid color %q", input)
	}
	if _, err := strconv.ParseUint(hex, 16, 32); err != nil {
		return "", fmt.Errorf("invalid color %q", input)
	}
	rr, gg, bb := hex[0:2], hex[2:4], hex[4:6]
	aa := "00"
	if len(hex) == 8 {
		aa = hex[6:8]
	}
	return strings.ToUpper("&H" + aa + bb + gg + rr), nil
}

func color(v string) string { c, _ := NormalizeASSColor(v); return c }
func intValue(v *int) int { if v == nil { return 0 }; return *v }
func assBool(v *bool) int { if v != nil && *v { return -1 }; return 0 }
func floatString(v *float64) string { if v == nil { return "0" }; return strconv.FormatFloat(*v, 'f', -1, 64) }
func validRawStyleLine(line string) bool { return strings.HasPrefix(line, "Style: ") && len(strings.Split(strings.TrimPrefix(line, "Style: "), ",")) == 23 }
func normalizeOverrideTags(tags string) string { return strings.Trim(tags, "{}") }
```

- [ ] **Step 4: 跑测试确认通过**

Run:

```bash
go test -count=1 ./internal/subtitle_style
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add internal/subtitle_style/style.go internal/subtitle_style/style_test.go
git commit -m "feat: add subtitle style model"
```

---

### Task 2: 添加默认 JSON 样式文件

**Files:**
- Create: `config/subtitle-style-default.json`
- Create: `config/subtitle-style-example.json`

- [ ] **Step 1: 写默认配置文件**

创建 `config/subtitle-style-default.json`：

```json
{
  "version": 1,
  "horizontal": {
    "major": {
      "font_name": "Arial",
      "font_size": 14,
      "primary_color": "#FFBF00",
      "secondary_color": "#FF0000",
      "outline_color": "#000000",
      "back_color": "#00000064",
      "bold": true,
      "italic": false,
      "underline": false,
      "strike_out": false,
      "scale_x": 100,
      "scale_y": 100,
      "spacing": 0,
      "angle": 0,
      "border_style": 1,
      "outline": 2.5,
      "shadow": 1.5,
      "alignment": 2,
      "margin_l": 10,
      "margin_r": 10,
      "margin_v": 20,
      "encoding": 1
    },
    "minor": {
      "font_name": "Arial",
      "font_size": 10,
      "primary_color": "#FFBF00",
      "secondary_color": "#FF0000",
      "outline_color": "#000000",
      "back_color": "#00000064",
      "bold": true,
      "italic": false,
      "underline": false,
      "strike_out": false,
      "scale_x": 100,
      "scale_y": 100,
      "spacing": 0,
      "angle": 0,
      "border_style": 1,
      "outline": 2.5,
      "shadow": 1.5,
      "alignment": 2,
      "margin_l": 10,
      "margin_r": 10,
      "margin_v": 30,
      "encoding": 1
    }
  },
  "vertical": {
    "major": {
      "font_name": "Arial",
      "font_size": 12,
      "primary_color": "#FFBF00",
      "secondary_color": "#FF0000",
      "outline_color": "#000000",
      "back_color": "#00000064",
      "bold": true,
      "italic": false,
      "underline": false,
      "strike_out": false,
      "scale_x": 100,
      "scale_y": 100,
      "spacing": 0,
      "angle": 0,
      "border_style": 1,
      "outline": 2.2,
      "shadow": 1.2,
      "alignment": 2,
      "margin_l": 10,
      "margin_r": 10,
      "margin_v": 92,
      "encoding": 1
    },
    "minor": {
      "font_name": "Arial",
      "font_size": 7,
      "primary_color": "#FFBF00",
      "secondary_color": "#FF0000",
      "outline_color": "#000000",
      "back_color": "#00000064",
      "bold": true,
      "italic": false,
      "underline": false,
      "strike_out": false,
      "scale_x": 100,
      "scale_y": 100,
      "spacing": 0,
      "angle": 0,
      "border_style": 1,
      "outline": 2,
      "shadow": 1,
      "alignment": 2,
      "margin_l": 10,
      "margin_r": 10,
      "margin_v": 101,
      "encoding": 1
    }
  }
}
```

- [ ] **Step 2: 写示例覆盖文件**

创建 `config/subtitle-style-example.json`：

```json
{
  "version": 1,
  "horizontal": {
    "major": {
      "font_size": 18,
      "primary_color": "#FFFFFF",
      "outline_color": "#111111",
      "outline": 3,
      "shadow": 1,
      "fade_in_ms": 120,
      "fade_out_ms": 120,
      "override_tags": "\\blur1"
    },
    "minor": {
      "font_size": 12,
      "primary_color": "#FFD966",
      "outline": 2.5
    }
  },
  "vertical": {
    "major": {
      "font_size": 14,
      "primary_color": "#FFFFFF",
      "outline": 3,
      "margin_v": 86
    },
    "minor": {
      "font_size": 8,
      "primary_color": "#FFD966",
      "margin_v": 100
    }
  }
}
```

- [ ] **Step 3: 验证 JSON 可解析**

Run:

```bash
go test -count=1 ./internal/subtitle_style
```

Expected: PASS。若需要额外验证，可临时在测试中读取 `../../config/subtitle-style-default.json`，但不要让测试依赖当前工作目录不稳定。

- [ ] **Step 4: 提交**

```bash
git add config/subtitle-style-default.json config/subtitle-style-example.json
git commit -m "chore: add default subtitle style files"
```

---

### Task 3: 接入 ASS 生成

**Files:**
- Modify: `internal/types/subtitle_task.go`
- Modify: `internal/service/srt_embed.go`
- Modify: `internal/service/srt_embed_test.go`

- [ ] **Step 1: 写失败测试**

在 `internal/service/srt_embed_test.go` 增加：

```go
func TestHorizontalAssUsesCustomSubtitleStyle(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "subtitle.srt")
	out := filepath.Join(dir, "subtitle.ass")
	content := "1\n00:00:00,840 --> 00:00:02,900\n主字幕\n副字幕\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	fontSize := 22
	marginV := 44
	outline := 4.0
	fadeIn := 120
	fadeOut := 180
	style := subtitlestyle.DefaultStyleSet()
	style.Horizontal.Major.FontSize = &fontSize
	style.Horizontal.Major.PrimaryColor = "#FFFFFF"
	style.Horizontal.Major.MarginV = &marginV
	style.Horizontal.Major.Outline = &outline
	style.Horizontal.Major.FadeInMS = &fadeIn
	style.Horizontal.Major.FadeOutMS = &fadeOut
	style.Horizontal.Major.OverrideTags = `\blur1`

	err := srtToAss(in, out, true, &types.SubtitleTaskStepParam{
		TaskBasePath:  dir,
		SubtitleStyle: style,
	})
	if err != nil {
		t.Fatalf("srtToAss() error = %v", err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	ass := string(data)
	if !strings.Contains(ass, "Style: Major,Arial,22,&H00FFFFFF") {
		t.Fatalf("custom Major style missing:\n%s", ass)
	}
	if !strings.Contains(ass, ",4,1.5,2,10,10,44,1") {
		t.Fatalf("custom outline/margin missing:\n%s", ass)
	}
	if !strings.Contains(ass, `{\fad(120,180)\blur1}{\an2}{\rMajor}主字幕`) {
		t.Fatalf("custom dialogue tags missing:\n%s", ass)
	}
}

func TestVerticalAssUsesCustomMinorStyle(t *testing.T) {
	dir := t.TempDir()
	in := filepath.Join(dir, "subtitle.srt")
	out := filepath.Join(dir, "subtitle.ass")
	content := "1\n00:00:00,840 --> 00:00:02,900\nEnglish subtitle\n\n"
	if err := os.WriteFile(in, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	fontSize := 11
	style := subtitlestyle.DefaultStyleSet()
	style.Vertical.Minor.FontSize = &fontSize
	style.Vertical.Minor.PrimaryColor = "#00FF00"

	err := srtToAss(in, out, false, &types.SubtitleTaskStepParam{
		TaskBasePath:  dir,
		SubtitleStyle: style,
	})
	if err != nil {
		t.Fatalf("srtToAss() error = %v", err)
	}
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	ass := string(data)
	if !strings.Contains(ass, "Style: Minor,Arial,11,&H0000FF00") {
		t.Fatalf("custom vertical Minor style missing:\n%s", ass)
	}
}
```

同时在 import 中加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
go test -count=1 ./internal/service -run 'TestHorizontalAssUsesCustomSubtitleStyle|TestVerticalAssUsesCustomMinorStyle'
```

Expected: FAIL，原因是 `SubtitleTaskStepParam.SubtitleStyle` 字段不存在，或 `srtToAss` 尚未使用样式。

- [ ] **Step 3: 修改 `SubtitleTaskStepParam`**

在 `internal/types/subtitle_task.go` import 区加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

在 `SubtitleTaskStepParam` 增加字段：

```go
SubtitleStyle *subtitlestyle.StyleSet // CLI/Agent 传入的字幕样式；nil 时使用默认样式
```

- [ ] **Step 4: 修改 `srtToAss` header 生成**

在 `internal/service/srt_embed.go` import 区加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

在 `srtToAss` 开头创建样式对象：

```go
styleSet := subtitlestyle.DefaultStyleSet()
if stepParam != nil && stepParam.SubtitleStyle != nil {
	styleSet = stepParam.SubtitleStyle
}
screenStyle := styleSet.Vertical
if isHorizontal {
	screenStyle = styleSet.Horizontal
}
```

把固定 header 写入替换为：

```go
_, _ = assFile.WriteString(subtitlestyle.BuildAssHeader(styleSet, isHorizontal))
```

横屏 Dialogue 生成替换为：

```go
majorTags := subtitlestyle.DialogueTags(screenStyle.Major)
minorTags := subtitlestyle.DialogueTags(screenStyle.Minor)
majorAlignment := subtitlestyle.Alignment(screenStyle.Major)
minorAlignment := subtitlestyle.Alignment(screenStyle.Minor)

if len(subtitleLines) == 1 {
	combinedText := fmt.Sprintf("%s{\\an%d}{\\rMajor}%s", majorTags, majorAlignment, util.CleanPunction(subtitleLines[0]))
	_, _ = assFile.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Major,,0,0,0,,%s\n", startFormatted, endFormatted, combinedText))
	continue
}
combinedText := fmt.Sprintf("%s{\\an%d}{\\rMajor}%s\\N%s{\\an%d}{\\rMinor}%s",
	majorTags, majorAlignment, subtitleLines[0],
	minorTags, minorAlignment, util.CleanPunction(subtitleLines[1]))
_, _ = assFile.WriteString(fmt.Sprintf("Dialogue: 0,%s,%s,Major,,0,0,0,,%s\n", startFormatted, endFormatted, combinedText))
```

竖屏中文 Major Dialogue 替换为：

```go
combinedText := fmt.Sprintf("%s{\\an%d}{\\rMajor}%s",
	subtitlestyle.DialogueTags(screenStyle.Major),
	subtitlestyle.Alignment(screenStyle.Major),
	line)
```

竖屏英文 Minor Dialogue 替换为：

```go
combinedText := fmt.Sprintf("%s{\\an%d}{\\rMinor}%s",
	subtitlestyle.DialogueTags(screenStyle.Minor),
	subtitlestyle.Alignment(screenStyle.Minor),
	cleanedText)
```

- [ ] **Step 5: 跑测试确认通过**

Run:

```bash
go test -count=1 ./internal/subtitle_style ./internal/service -run 'TestHorizontalAssUsesCustomSubtitleStyle|TestVerticalAssUsesCustomMinorStyle|TestHorizontalAssKeepsSingleLineSubtitle|TestVerticalAssKeepsChineseLineInSingleDialogueWithLineBreak|TestVerticalAssSplitsLongChineseAcrossTime'
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add internal/types/subtitle_task.go internal/service/srt_embed.go internal/service/srt_embed_test.go internal/subtitle_style/style.go internal/subtitle_style/style_test.go
git commit -m "feat: render subtitles with configurable ASS styles"
```

---

### Task 4: 接入 pipeline 数据流

**Files:**
- Modify: `internal/pipeline/render.go`
- Modify: `internal/pipeline/subtitle.go`
- Modify: `internal/pipeline/render_test.go`
- Modify: `internal/pipeline/subtitle_test.go`

- [ ] **Step 1: 写 render 失败测试**

在 `internal/pipeline/render_test.go` 增加：

```go
func TestRenderPassesSubtitleStyleToService(t *testing.T) {
	dir := t.TempDir()
	fake := &renderFakeService{}
	style := subtitlestyle.DefaultStyleSet()
	req := RenderRequest{
		Workdir:       dir,
		TaskID:        "demo",
		Video:         "origin_video.mp4",
		Subtitle:      "bilingual_srt.srt",
		Horizontal:    true,
		SubtitleStyle: style,
	}

	resp, err := Render(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if fake.lastRender.StepParam == nil || fake.lastRender.StepParam.SubtitleStyle != style {
		t.Fatalf("SubtitleStyle was not passed to service")
	}
}
```

在 import 中加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

- [ ] **Step 2: 写 subtitle 失败测试**

扩展 `fakeStageService.PrepareMedia`，记录最后一次 stepParam：

```go
lastPrepare *types.SubtitleTaskStepParam
```

在 `PrepareMedia` 中加入：

```go
f.lastPrepare = p
```

在 `internal/pipeline/subtitle_test.go` 增加：

```go
func TestGenerateSubtitlesPassesSubtitleStyleToStepParam(t *testing.T) {
	dir := t.TempDir()
	fake := &fakeStageService{}
	style := subtitlestyle.DefaultStyleSet()
	req := SubtitleRequest{
		Input:         "local:demo.mp4",
		Workdir:       dir,
		TaskID:        "demo",
		OriginLang:    "en",
		TargetLang:    "zh_cn",
		CaptionSource: CaptionSourceWhisper,
		SubtitleStyle: style,
	}

	resp, err := GenerateSubtitles(context.Background(), fake, req)
	if err != nil {
		t.Fatalf("GenerateSubtitles() error = %v", err)
	}
	if !resp.OK {
		t.Fatalf("OK = false, want true")
	}
	if fake.lastPrepare == nil || fake.lastPrepare.SubtitleStyle != style {
		t.Fatalf("SubtitleStyle was not passed to stepParam")
	}
}
```

在 import 中加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

- [ ] **Step 3: 跑测试确认失败**

Run:

```bash
go test -count=1 ./internal/pipeline -run 'TestRenderPassesSubtitleStyleToService|TestGenerateSubtitlesPassesSubtitleStyleToStepParam'
```

Expected: FAIL，原因是 `RenderRequest.SubtitleStyle` 和 `SubtitleRequest.SubtitleStyle` 尚不存在。

- [ ] **Step 4: 修改 pipeline request 和 stepParam**

在 `internal/pipeline/render.go` import 加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

给 `RenderRequest` 增加：

```go
SubtitleStyle *subtitlestyle.StyleSet
```

创建 `stepParam` 时设置：

```go
SubtitleStyle: req.SubtitleStyle,
```

在 `internal/pipeline/subtitle.go` import 加入：

```go
import subtitlestyle "krillin-ai/internal/subtitle_style"
```

给 `SubtitleRequest` 增加：

```go
SubtitleStyle *subtitlestyle.StyleSet
```

在 `subtitleStepParam` 返回值中设置：

```go
SubtitleStyle: req.SubtitleStyle,
```

- [ ] **Step 5: 跑 pipeline 测试**

Run:

```bash
go test -count=1 ./internal/pipeline
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add internal/pipeline/render.go internal/pipeline/subtitle.go internal/pipeline/render_test.go internal/pipeline/subtitle_test.go
git commit -m "feat: pass subtitle styles through pipeline"
```

---

### Task 5: 接入 CLI 参数和样式加载

**Files:**
- Modify: `internal/cli/commands.go`
- Modify: `internal/cli/commands_test.go`

- [ ] **Step 1: 写 CLI 失败测试**

在 `internal/cli/commands_test.go` 增加：

```go
func TestParseRenderCommandAcceptsSubtitleStyleFile(t *testing.T) {
	cmd, err := Parse([]string{
		"render-horizontal",
		"--workdir", "tasks/demo",
		"--video", "origin.mp4",
		"--subtitle", "bilingual.srt",
		"--subtitle-style-file", "style.json",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Render.SubtitleStyleFile != "style.json" {
		t.Fatalf("SubtitleStyleFile = %q", cmd.Render.SubtitleStyleFile)
	}
}

func TestParseSubtitleCommandAcceptsSubtitleStyleFile(t *testing.T) {
	cmd, err := Parse([]string{
		"subtitle",
		"local:demo.mp4",
		"--origin-lang", "en",
		"--target-lang", "zh_cn",
		"--workdir", "tasks/demo",
		"--subtitle-style-file", "style.json",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if cmd.Subtitle.SubtitleStyleFile != "style.json" {
		t.Fatalf("SubtitleStyleFile = %q", cmd.Subtitle.SubtitleStyleFile)
	}
}

func TestExecuteDryRunRenderRejectsInvalidSubtitleStyleFile(t *testing.T) {
	cmd, err := Parse([]string{
		"render-horizontal",
		"--workdir", t.TempDir(),
		"--video", "origin.mp4",
		"--subtitle", "bilingual.srt",
		"--subtitle-style-file", "missing.json",
		"--dry-run",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if resp.OK {
		t.Fatalf("OK = true, want false for missing style file")
	}
	if resp.Error == nil || !strings.Contains(resp.Error.Message, "missing.json") {
		t.Fatalf("error = %#v, want missing style file message", resp.Error)
	}
}

func TestExecuteDryRunRenderLoadsSubtitleStyleFile(t *testing.T) {
	dir := t.TempDir()
	stylePath := filepath.Join(dir, "style.json")
	if err := os.WriteFile(stylePath, []byte(`{"horizontal":{"major":{"primary_color":"#FFFFFF"}}}`), 0644); err != nil {
		t.Fatal(err)
	}
	cmd, err := Parse([]string{
		"render-horizontal",
		"--workdir", dir,
		"--video", "origin.mp4",
		"--subtitle", "bilingual.srt",
		"--subtitle-style-file", stylePath,
		"--dry-run",
	})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	resp := Execute(context.Background(), nil, cmd)
	if !resp.OK {
		t.Fatalf("OK = false, error = %#v", resp.Error)
	}
}
```

在 import 中加入：

```go
import (
	"os"
	"path/filepath"
)
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
go test -count=1 ./internal/cli -run 'TestParseRenderCommandAcceptsSubtitleStyleFile|TestParseSubtitleCommandAcceptsSubtitleStyleFile|TestExecuteDryRunRenderRejectsInvalidSubtitleStyleFile|TestExecuteDryRunRenderLoadsSubtitleStyleFile'
```

Expected: FAIL，原因是 `SubtitleStyleFile` 字段和 CLI flag 尚不存在。

- [ ] **Step 3: 修改 pipeline request 增加样式文件路径**

在 `internal/pipeline/render.go` 的 `RenderRequest` 增加：

```go
SubtitleStyleFile string
```

在 `internal/pipeline/subtitle.go` 的 `SubtitleRequest` 增加：

```go
SubtitleStyleFile string
```

这个字段只供 CLI 记录来源路径；真正传给 service 的仍是 `SubtitleStyle`。

- [ ] **Step 4: 修改 CLI flag 和 help**

在 `Help` 的 `subtitle` flags 加入：

```text
  --subtitle-style-file <file>  JSON subtitle style override file
```

在 `render-horizontal` 和 `render-vertical` flags 加入同样一行。

在 `parseSubtitle` 加入：

```go
subtitleStyleFile := fs.String("subtitle-style-file", "", "subtitle style JSON file")
```

构造 `pipeline.SubtitleRequest` 时设置：

```go
SubtitleStyleFile: *subtitleStyleFile,
```

在 `parseRender` 加入：

```go
subtitleStyleFile := fs.String("subtitle-style-file", "", "subtitle style JSON file")
```

构造 `pipeline.RenderRequest` 时设置：

```go
SubtitleStyleFile: *subtitleStyleFile,
```

- [ ] **Step 5: 实现 CLI 样式加载**

在 `internal/cli/commands.go` import 加入：

```go
import (
	subtitlestyle "krillin-ai/internal/subtitle_style"
)
```

新增常量和 helper：

```go
const defaultSubtitleStylePath = "config/subtitle-style-default.json"

func loadSubtitleStyleForCLI(styleFile string) (*subtitlestyle.StyleSet, error) {
	base := subtitlestyle.DefaultStyleSet()
	if _, err := os.Stat(defaultSubtitleStylePath); err == nil {
		fileStyle, err := subtitlestyle.LoadOverrideFile(defaultSubtitleStylePath)
		if err != nil {
			return nil, err
		}
		base, err = subtitlestyle.Merge(base, fileStyle)
		if err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if strings.TrimSpace(styleFile) == "" {
		return base, nil
	}
	override, err := subtitlestyle.LoadOverrideFile(styleFile)
	if err != nil {
		return nil, err
	}
	return subtitlestyle.Merge(base, override)
}
```

在 `Execute` 中，调用 pipeline 前加载样式：

```go
case "subtitle":
	style, err := loadSubtitleStyleForCLI(cmd.Subtitle.SubtitleStyleFile)
	if err != nil {
		return styleLoadFailure(pipeline.StageSubtitle, cmd.Subtitle.Workdir, cmd.Subtitle.TaskID, err)
	}
	cmd.Subtitle.SubtitleStyle = style
	resp, err := pipeline.GenerateSubtitles(ctx, svc, cmd.Subtitle)
	return responseWithError(resp, err)
case "render-horizontal", "render-vertical":
	style, err := loadSubtitleStyleForCLI(cmd.Render.SubtitleStyleFile)
	if err != nil {
		return styleLoadFailure(renderStageFromCommand(cmd.Name), cmd.Render.Workdir, cmd.Render.TaskID, err)
	}
	cmd.Render.SubtitleStyle = style
	resp, err := pipeline.Render(ctx, svc, cmd.Render)
	return responseWithError(resp, err)
```

新增错误 helper：

```go
func styleLoadFailure(stage pipeline.Stage, workdir, taskID string, err error) pipeline.Response {
	return pipeline.Response{
		OK:      false,
		Stage:   stage,
		Workdir: workdir,
		TaskID:  taskID,
		Error: &pipeline.Error{
			Kind:    pipeline.ErrorKindUsage,
			Code:    "subtitle_style_load_failed",
			Message: err.Error(),
		},
	}
}

func renderStageFromCommand(name string) pipeline.Stage {
	if name == "render-horizontal" {
		return pipeline.StageRenderHorizontal
	}
	return pipeline.StageRenderVertical
}
```

在 `dryRun` 的 `subtitle`、`render-horizontal`、`render-vertical` 分支开头调用 `loadSubtitleStyleForCLI`，失败时返回 `styleLoadFailure`。

- [ ] **Step 6: 跑 CLI 测试**

Run:

```bash
go test -count=1 ./internal/cli
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add internal/cli/commands.go internal/cli/commands_test.go internal/pipeline/render.go internal/pipeline/subtitle.go
git commit -m "feat: add CLI subtitle style flag"
```

---

### Task 6: 端到端窄验证和构建

**Files:**
- Modify as needed only if tests expose small integration gaps.

- [ ] **Step 1: 跑样式模块、CLI、pipeline、service 窄测试**

Run:

```bash
go test -count=1 ./internal/subtitle_style ./internal/cli ./internal/pipeline ./internal/service -run 'Test.*SubtitleStyle|TestHorizontalAss|TestVerticalAss|TestSplitChineseText|TestParse'
```

Expected: PASS。

- [ ] **Step 2: 跑构建**

Run:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

Expected: PASS，无输出。

- [ ] **Step 3: 手工 dry-run 验证样式文件参数**

Run:

```bash
./build/krillinai-cli render-horizontal \
  --workdir "$(mktemp -d)" \
  --video origin.mp4 \
  --subtitle bilingual.srt \
  --subtitle-style-file config/subtitle-style-example.json \
  --dry-run
```

Expected: 输出 JSON response，`ok` 为 true 或当前 CLI dry-run 的等价成功字段。

- [ ] **Step 4: 确认不提交无关改动**

Run:

```bash
git status --short
```

Expected: 不应意外暂存 `internal/service/youtube_subtitle_test.go`，除非用户要求提交上一轮测试修复。

- [ ] **Step 5: 最终提交判断**

如果 Task 6 暴露集成问题，回到对应任务修正并在对应任务提交中提交修复。Task 6 本身是验证任务；没有新增代码时不创建提交。

---

## 最终验收

执行以下命令：

```bash
go test -count=1 ./internal/subtitle_style ./internal/cli ./internal/pipeline
go test -count=1 ./internal/service -run 'Test.*SubtitleStyle|TestHorizontalAss|TestVerticalAss|TestSplitChineseText'
go build -o build/krillinai-cli ./cmd/cli
```

说明：

- 当前 `go test -count=1 ./internal/service` 全包可能仍受旧的 `audio2subtitle_test.go` Windows 路径硬编码影响失败。不要把这个旧问题混入本功能，除非用户另行要求修复。
- 每次提交前执行 `git diff --check`。
- 每次提交前执行 `git diff --staged | rg -n -i "(api_key|access_key|secret|token|sk-|LTAI)"`，确认没有密钥进入提交。

## 规格覆盖自检

- 独立 JSON 样式文件：Task 1、Task 2。
- 默认 JSON 和代码默认值：Task 1、Task 2、Task 5。
- 横屏/竖屏、major/minor：Task 1、Task 3。
- 结构化 ASS 字段：Task 1。
- `raw_ass_style`、`override_tags`：Task 1、Task 3。
- `fade_in_ms`、`fade_out_ms`：Task 1、Task 3。
- CLI `--subtitle-style-file`：Task 5。
- pipeline/render/service 传递：Task 4、Task 5。
- 输出真实 ASS：Task 3 保持现有 `formatted_*.ass` 产物路径。
- 错误处理和未知字段：Task 1、Task 5。
