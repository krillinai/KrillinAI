# KrillinAI CLI 字幕样式能力设计

日期：2026-06-08

## 背景

KrillinAI 当前烧录字幕时使用固定 ASS 样式。横屏和竖屏分别写死在 `types.AssHeaderHorizontal`、`types.AssHeaderVertical`，`srtToAss` 再以 `Major` 和 `Minor` 两个 ASS Style 名生成 Dialogue。这个方式能稳定产出视频，但外部 Agent 无法为不同视频类型、内容调性和发布平台定制字幕的颜色、字号、位置、描边、阴影、淡入淡出等视觉效果。

本轮目标是补齐 KrillinAI CLI 的基座能力。上层 Agent 会基于 CLI 自动生成样式、调用渲染、检查产物，并可能在后续提供 HTML 设计器。本轮不做 HTML 设计器，但要让 CLI 和样式文件成为稳定、可编排、可校验的接口。

## 目标

- 支持独立 JSON 字幕样式文件，供 CLI 和上层 Agent 读写。
- 提供项目默认样式 JSON，让不传样式文件时输出尽量保持当前视觉效果。
- 支持横屏和竖屏分别配置样式。
- 每个方向支持 `major` 和 `minor` 两套样式，对应当前 ASS 中的主字幕和副字幕。
- 支持常用 ASS Style 字段的结构化配置。
- 提供 `raw_ass_style` 和 `override_tags` 作为高级逃生口。
- 支持 `fade_in_ms`、`fade_out_ms` 结构化生成 ASS `\fad(...)` 效果。
- CLI 支持传入样式文件，并将样式透传到 pipeline/render/service/srtToAss。
- 输出真实 ASS 文件，方便 Agent 检查最终渲染输入。

## 非目标

- 本轮不实现 HTML 所见即所得设计器。
- 本轮不优先接 HTTP 创建字幕任务接口。
- 本轮不实现逐条字幕的动态 `pos/move` 编辑 UI。
- 本轮不改变字幕分段、翻译、配音算法。
- 本轮不删除旧的 ASS header 常量，除非实现中确认为冗余且测试已覆盖。

## 样式文件

默认样式文件：

```text
config/subtitle-style-default.json
config/subtitle-style-example.json
```

默认加载顺序：

```text
1. 代码内置默认值
2. config/subtitle-style-default.json
3. CLI --subtitle-style-file 指定的覆盖文件
```

如果默认样式文件不存在，CLI 回退到代码内置默认值并记录 warning。用户显式传入的样式文件不存在或非法时，CLI 直接失败。

样式文件使用 JSON。JSON 比 TOML 更适合上层 Agent 生成、修改和校验，也方便未来 HTML 设计器共用同一份 schema。

## JSON Schema 结构

顶层按横竖屏分开：

```json
{
  "version": 1,
  "horizontal": {
    "major": {},
    "minor": {}
  },
  "vertical": {
    "major": {},
    "minor": {}
  }
}
```

每个 style 支持以下结构化字段：

```json
{
  "font_name": "Arial",
  "font_size": 14,
  "primary_color": "#BFFF00",
  "secondary_color": "#0000FF",
  "outline_color": "#000000",
  "back_color": "#00000080",
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
  "encoding": 1,
  "fade_in_ms": 0,
  "fade_out_ms": 0,
  "override_tags": "",
  "raw_ass_style": ""
}
```

字段说明：

- `font_name`：ASS `Fontname`。
- `font_size`：ASS `Fontsize`。
- `primary_color`、`secondary_color`、`outline_color`、`back_color`：支持 `#RRGGBB`、`#RRGGBBAA` 和 ASS 原生 `&H...`。
- `bold`、`italic`、`underline`、`strike_out`：布尔值，生成 ASS 的 `-1` 或 `0`。
- `scale_x`、`scale_y`、`spacing`、`angle`、`border_style`、`outline`、`shadow`、`alignment`、`margin_l`、`margin_r`、`margin_v`、`encoding`：对应 ASS Style 行字段。
- `fade_in_ms`、`fade_out_ms`：结构化生成 `\fad(in,out)`。
- `override_tags`：高级效果标签，插入 Dialogue 文本开头，例如 `\blur1` 或 `\bord4`。
- `raw_ass_style`：完整覆盖对应 style 的 ASS `Style:` 内容。

颜色转换规则：

- `#RRGGBB` 转成 `&H00BBGGRR`。
- `#RRGGBBAA` 转成 `&HAABBGGRR`。
- `&H...` 原样接受，但需要校验基本格式。

## 样式合并

用户样式文件与默认样式采用深度合并。用户文件只需要写覆盖字段，未写字段继承默认样式。

示例：

```json
{
  "horizontal": {
    "major": {
      "primary_color": "#FFFFFF",
      "outline": 3
    }
  }
}
```

这个文件只覆盖横屏主字幕颜色和描边，其余横屏副字幕、竖屏样式、字号、边距等都继承默认值。

未知字段必须报错。Agent 场景下，拼错字段如果静默忽略会导致难以定位的视觉问题。

## CLI 接口

优先接入会产生 ASS 或烧录视频的 CLI 命令。

渲染命令示例：

```bash
krillinai-cli render-horizontal \
  --workdir tasks/xxx \
  --video video.mp4 \
  --subtitle bilingual_srt.srt \
  --subtitle-style-file style.json
```

竖屏渲染使用同一参数：

```bash
krillinai-cli render-vertical \
  --workdir tasks/xxx \
  --video video.mp4 \
  --subtitle short_origin_mixed_srt.srt \
  --subtitle-style-file style.json
```

完整字幕流程命令如果已有对应 CLI 入口，也接入相同参数：

```bash
krillinai-cli subtitle \
  ... \
  --subtitle-style-file style.json
```

CLI 行为：

- 不传 `--subtitle-style-file`：使用代码内置默认值和 `config/subtitle-style-default.json`。
- 传入 `{}`：等价于只使用默认样式。
- 传入非法 JSON：命令失败，并显示具体文件与解析错误。
- 传入未知字段：命令失败，并显示字段路径。
- 传入非法颜色、越界数值、非法 raw style：命令失败，并显示字段路径。

## 数据流

```text
CLI args
  ↓
loadSubtitleStyle(default file + optional override file)
  ↓
pipeline.RenderRequest / SubtitleRequest
  ↓
service.RenderVideoRequest
  ↓
types.SubtitleTaskStepParam.SubtitleStyle
  ↓
srtToAss(input.srt, output.ass, style)
  ↓
ffmpeg ass filter
```

建议新增独立模块：

```text
internal/subtitle_style
```

模块职责：

- 读取 JSON 文件。
- 校验未知字段和字段范围。
- 深度合并默认样式与覆盖样式。
- 将结构化样式转换为 ASS Style 行。
- 生成 ASS header。
- 生成 Dialogue override tags。

`types.SubtitleTaskStepParam` 增加样式字段，用于在 service 内部传递。

## ASS 生成规则

当前固定 header 生成方式改为：

```text
BuildAssHeader(styleSet, horizontal)
```

规则：

- 横屏使用 `style.horizontal.major/minor`。
- 竖屏使用 `style.vertical.major/minor`。
- ASS Style 名继续使用 `Major` 和 `Minor`，兼容现有 Dialogue 逻辑。
- 默认样式值与当前固定 header 对齐，保证默认效果基本不变。
- `raw_ass_style` 优先级最高，存在时优先生成该 style 的 ASS Style 行。
- `raw_ass_style` 只覆盖 Style 行；Dialogue 的 `fade_in_ms`、`fade_out_ms`、`override_tags` 仍可生效。
- `fade_in_ms/fade_out_ms` 自动合成 `\fad(in,out)`。
- `override_tags` 规范化后插入 Dialogue 开头。

横屏双语 Dialogue 保持 `Major` 和 `Minor` 分层：

```ass
Dialogue: ...,Major,,0,0,0,,{major tags}{\an2}{\rMajor}<major text>\N{minor tags}{\rMinor}<minor text>
```

竖屏逻辑保持现状：

- 中文或目标主字幕使用 `Major`。
- 英文或副字幕使用 `Minor`。
- 现有竖屏中文拆行逻辑不变。

位置策略：

- 本轮以 ASS `alignment` 和 `margin_l/r/v` 作为主要位置能力。
- 不新增结构化 `position_x/position_y`，避免和 `alignment/margin` 混用导致不可预测。
- 高级定位可以通过 `override_tags` 写 `\pos(...)` 或 `\move(...)`。

## 错误处理

必须提供可定位的错误信息：

- JSON 语法错误：包含文件路径和解析错误。
- 未知字段：包含字段路径。
- 颜色非法：包含字段路径，例如 `horizontal.major.primary_color`。
- 数值越界：包含字段路径和允许范围。
- `raw_ass_style` 非法：包含 style 路径和原因。
- 默认样式文件缺失：warning 后回退内置默认值。
- 用户显式样式文件缺失：直接失败。

建议校验范围：

- `font_size`：1 到 200。
- `scale_x`、`scale_y`：1 到 400。
- `alignment`：1 到 9。
- `margin_l`、`margin_r`、`margin_v`：0 到 2000。
- `outline`、`shadow`：0 到 20。
- `fade_in_ms`、`fade_out_ms`：0 到 10000。

## 测试策略

`internal/subtitle_style` 单元测试：

- 默认样式生成与当前固定 ASS header 等价或语义一致。
- JSON 深度合并。
- `#RRGGBB`、`#RRGGBBAA`、`&H...` 颜色转换。
- 未知字段报错。
- 非法字段范围报错。
- `raw_ass_style` 覆盖。
- `fade_in_ms/fade_out_ms` 与 `override_tags` 合成。

`internal/service/srt_embed_test.go`：

- `srtToAss` 使用自定义颜色、字号、边距。
- 横屏 `major/minor` 都生效。
- 竖屏 `major/minor` 都生效。
- 输出 `formatted_*.ass` 可被检查。

`internal/cli` 和 `internal/pipeline`：

- `render --subtitle-style-file` 把样式传到 service。
- 不传样式文件时走默认。
- 非法样式文件失败。
- 用户覆盖文件只写部分字段时深度合并。

## 兼容性

- 默认不传样式时，输出效果尽量保持当前固定样式。
- 保留 `Major` 和 `Minor` 两个 style 名。
- 保留输出 ASS 文件，方便 Agent 检查。
- HTTP 接口本轮不重点接，但内部链路支持样式后，后续只需要 DTO 透传。

## 后续扩展

后续可以基于同一 JSON schema 增加：

- HTML 样式设计器。
- `krillinai-cli subtitle-style preview` 命令，使用 ffmpeg/libass 生成真实预览图或短视频。
- 风格 preset，例如 `cinema`、`documentary`、`shorts`、`bilibili`。
- 每条字幕级别的局部 override。
