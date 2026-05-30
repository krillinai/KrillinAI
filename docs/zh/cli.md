# KrillinAI CLI 能力总结

KrillinAI 提供一套阶段化命令行工具，适用于脚本编排、CI/CD 流水线以及 AI Agent 调用。所有命令默认同步执行，完成后向 stdout 输出 JSON 结果。

## 命令总览

| 命令 | 用途 | 核心能力 |
|---|---|---|
| `subtitle` | 字幕生成 | 视频 → 语音识别 → 翻译 → 双语字幕文件 |
| `tts` | 语音合成 | SRT 字幕 → TTS 配音音频 |
| `render-horizontal` | 横屏视频合成 | 视频 + 字幕/音频 → 横屏成品视频 |
| `render-vertical` | 竖屏视频合成 | 视频 + 字幕/音频 → 竖屏成品视频 |
| `pipeline` | 全流程编排 | 多阶段组合输出（subtitle/tts/render/cover） |
| `cover` | 封面生成 | AI 封面图生成 |
| `status` | 状态查询 | 查询任务状态（预留） |

## 通用机制

### 输入方式

- **YouTube URL**：`https://www.youtube.com/watch?v=xxx`，自动通过 yt-dlp 下载视频
- **本地文件**：`local:demo.mp4` 或直接路径 `path/to/video.mp4`
- **SRT 字幕文件**：`path/to/subtitle.srt`

### JSON 输出

所有命令执行完毕后，向 stdout 输出一行 JSON。Agent 或调用方应以此为唯一可靠输出，不要解析普通日志。

```json
{
  "ok": true,
  "stage": "subtitle",
  "workdir": "tasks/demo",
  "task_id": "abc123",
  "outputs": {
    "origin_video": "tasks/demo/origin_video.mp4",
    "origin_srt": "tasks/demo/origin_srt.srt",
    "target_srt": "tasks/demo/target_language_srt.srt",
    "bilingual_srt": "tasks/demo/bilingual_srt.srt"
  },
  "warnings": [],
  "duration_ms": 45200
}
```

失败时：

```json
{
  "ok": false,
  "error": {
    "kind": "retryable",
    "code": "audio_transcription_failed",
    "message": "transcription error: connection timeout",
    "retryable": true
  }
}
```

### 退出码

| 退出码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 用法错误（参数不正确） |
| `2` | 可重试错误（网络超时、服务暂时不可用） |
| `3` | 依赖缺失（ffmpeg 等工具未安装） |

### Dry-Run 模式

所有命令支持 `--dry-run` 参数，仅校验参数合法性并生成 manifest 文件，不调用任何外部服务（不下载视频、不调用 AI API）。

```bash
krillinai subtitle "https://youtube.com/watch?v=abc" --origin-lang en --target-lang zh_cn --workdir tasks/demo --dry-run
```

### Manifest 持久化

每个任务在工作目录下生成 `krillinai_manifest.json`，记录所有阶段的输入输出路径和完成状态。后续命令可加载该 manifest 复用已有产物。

### 错误分类

| error.kind | 含义 | 处置建议 |
|---|---|---|
| `usage` | 参数错误 | 检查参数后重试 |
| `retryable` | 临时性错误 | 等待后自动重试 |
| `dependency` | 外部工具缺失 | 安装 ffmpeg / yt-dlp 等依赖 |
| `internal` | 内部异常 | 查阅日志排查 |

---

## 命令详解

### 1. subtitle — 字幕生成

从视频生成双语字幕。输入可以是 YouTube 链接或本地视频文件。

```bash
krillinai subtitle <输入源> [flags]
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `<输入源>` | positional | 是 | — | YouTube URL 或 `local:文件路径` |
| `--origin-lang` | string | 否 | — | 源语言代码（如 `en`、`zh`、`ja`） |
| `--target-lang` | string | 否 | — | 目标翻译语言代码（如 `zh_cn`） |
| `--user-lang` | string | 否 | `zh_cn` | 用户界面语言 |
| `--workdir` | string | 否 | 自动生成 | 任务工作目录 |
| `--task-id` | string | 否 | 自动生成 | 任务唯一标识 |
| `--caption-source` | string | 否 | `any` | 字幕来源策略 |
| `--bilingual-top` | bool | 否 | `true` | 双语字幕中译文是否显示在顶部 |
| `--max-word-one-line` | int | 否 | `12` | 每行最大字数 |
| `--dry-run` | bool | 否 | `false` | 仅校验，不执行 |

**字幕来源（caption-source）：**

| 值 | 行为 |
|---|---|
| `any` | 优先 YouTube 原生字幕，不可用时回退 Whisper 转录（默认） |
| `manual` | 仅使用手工字幕 |
| `auto` | 仅使用 YouTube 自动生成字幕 |
| `whisper` | 强制 Whisper 本地转录，不使用平台字幕 |

**输出产物：**

| 文件 | 说明 |
|---|---|
| `origin_srt.srt` | 源语言字幕 |
| `target_language_srt.srt` | 翻译后的目标语言字幕 |
| `bilingual_srt.srt` | 双语字幕 |
| `origin_video.mp4` | 原始视频 |
| `origin_audio.wav` | 提取的音频 |

**示例：**

```bash
# YouTube 视频字幕翻译
krillinai subtitle "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo

# 本地视频强制 Whisper 转录
krillinai subtitle "local:my_video.mp4" \
  --origin-lang ja \
  --target-lang zh_cn \
  --caption-source whisper \
  --workdir tasks/my_task

# 仅校验参数
krillinai subtitle "https://youtube.com/watch?v=abc" \
  --origin-lang en \
  --target-lang zh_cn \
  --dry-run
```

---

### 2. tts — 语音合成

将 SRT 字幕文件合成为配音音频，并将配音嵌入原视频生成带配音的视频文件。

```bash
krillinai tts --input-srt <字幕文件> [flags]
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--input-srt` | string | 是 | — | 输入 SRT 字幕文件路径 |
| `--workdir` | string | 否 | — | 任务工作目录 |
| `--task-id` | string | 否 | — | 任务唯一标识 |
| `--line-mode` | string | 否 | `target-only` | 配音行模式 |
| `--video` | string | 否 | manifest 记录 | 输入视频路径（用于生成带配音的视频） |
| `--voice` | string | 否 | — | 语音音色代码 |
| `--voice-clone-source` | string | 否 | — | 语音克隆源音频 URL |
| `--dry-run` | bool | 否 | `false` | 仅校验，不执行 |

**行模式（line-mode）：**

| 值 | 含义 |
|---|---|
| `target-only` | 仅配音译文（默认） |
| `bilingual-target-top` | 双语配音，译文在上 |
| `bilingual-target-bottom` | 双语配音，译文在下 |

**输出产物：**

| 文件 | 说明 |
|---|---|
| `tts_audio.wav`（或对应的音频格式） | 生成的配音音频 |
| `video_with_tts.mp4` | 嵌入配音后的视频（如果提供了 `--video`） |

**示例：**

```bash
# 从翻译后字幕生成配音
krillinai tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --line-mode target-only

# 生成配音并嵌入视频
krillinai tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt \
  --video tasks/demo/origin_video.mp4 \
  --voice cosyvoice_zh_female_01
```

---

### 3. render-horizontal / render-vertical — 视频合成

将字幕或配音合成到视频中，生成横屏或竖屏成品。

```bash
krillinai render-horizontal [flags]
krillinai render-vertical [flags]
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--workdir` | string | 否 | — | 任务工作目录 |
| `--task-id` | string | 否 | — | 任务唯一标识 |
| `--video` | string | 否 | manifest 记录 | 输入视频路径 |
| `--audio` | string | 否 | — | 输入音频路径 |
| `--subtitle` | string | 否 | manifest 记录 | 输入字幕文件路径 |
| `--dubbed` | bool | 否 | `false` | 是否渲染配音版 |
| `--major-title` | string | 否 | — | 竖屏主标题（仅 render-vertical） |
| `--minor-title` | string | 否 | — | 竖屏副标题（仅 render-vertical） |
| `--dry-run` | bool | 否 | `false` | 仅校验，不执行 |

**默认行为（未显式指定 video/subtitle）：**

- 未指定 `--video`：自动使用 manifest 中记录的原始视频（配音模式则使用 `video_with_tts.mp4`）
- 未指定 `--subtitle`：横屏用双语字幕，竖屏用简短混排字幕

**输出产物：**

| 命令 | 输出文件 |
|---|---|
| `render-horizontal` | `horizontal_bilingual.mp4` / `horizontal_dubbed.mp4` |
| `render-vertical` | `vertical_bilingual.mp4` / `vertical_dubbed.mp4` |

**示例：**

```bash
# 横屏双语字幕视频
krillinai render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt

# 竖屏配音视频（带标题）
krillinai render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/video_with_tts.mp4 \
  --subtitle tasks/demo/target_language_srt.srt \
  --dubbed \
  --major-title "今日话题" \
  --minor-title "AI 改变世界"
```

---

### 4. pipeline — 全流程编排

一键串联多个阶段，按序执行。

```bash
krillinai pipeline --outputs <阶段列表> [flags]
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--outputs` | string | 是 | `subtitle` | 逗号分隔的输出阶段列表 |
| `--async` | bool | 否 | `false` | 是否异步执行 |
| `--dry-run` | bool | 否 | `false` | 仅校验，不执行 |

**支持的 outputs 值：**

| 值 | 对应阶段 |
|---|---|
| `subtitle` | 字幕生成 |
| `tts` | 语音合成 |
| `horizontal-bilingual` | 横屏双语视频 |
| `horizontal-dubbed` | 横屏配音视频 |
| `vertical-bilingual` | 竖屏双语视频 |
| `vertical-dubbed` | 竖屏配音视频 |
| `cover` | 封面生成 |

**示例：**

```bash
# 字幕 + 配音 + 横屏成品
krillinai pipeline \
  --outputs "subtitle,tts,horizontal-bilingual"

# 仅字幕 + 竖屏配音视频
krillinai pipeline \
  --outputs "subtitle,vertical-dubbed"

# 全链路（字幕 + 配音 + 封面）
krillinai pipeline \
  --outputs "subtitle,tts,horizontal-dubbed,cover"
```

---

### 5. cover — 封面生成

基于视频内容和翻译信息，生成 AI 封面图。

```bash
krillinai cover [flags]
```

> 该命令参数和细节由 manifest 驱动，与 pipeline 中的 `cover` 阶段一致。

---

### 6. status — 状态查询

查询任务的当前状态和进度。

```bash
krillinai status
```

---

## CLI 与 Manifest 的协作模式

KrillinAI CLI 的命令设计为**可独立执行**：每个命令可以单独运行，也可以串联使用。串联时，后续命令通过读取前一步生成的 `krillinai_manifest.json` 获取输入文件路径，实现无缝衔接。

**典型工作流：**

```bash
# 第一步：生成字幕（输出 manifest.json 供后续使用）
krillinai subtitle "https://youtube.com/watch?v=abc" \
  --origin-lang en --target-lang zh_cn --workdir tasks/demo

# 第二步：在字幕基础上生成配音（自动从 manifest 读取 SRT）
krillinai tts \
  --workdir tasks/demo \
  --input-srt tasks/demo/target_language_srt.srt

# 第三步：合成横屏视频
krillinai render-horizontal --workdir tasks/demo

# 等价于一次性 pipeline：
krillinai pipeline --outputs "subtitle,tts,horizontal-bilingual"
```

## Agent 集成指南

AI Agent 调用 KrillinAI CLI 时，应遵循以下约定：

1. **输出解析**：优先解析 stdout 的 JSON 行，不要依赖日志输出
2. **错误处理**：根据 `error.kind` 字段决定是否重试（`retryable` → 重试，`usage` → 修正参数，`dependency` → 引导用户安装依赖）
3. **进度感知**：读取 `krillinai_manifest.json` 了解各阶段完成状态
4. **产物定位**：`outputs` 字段中记录了所有产物的绝对或相对路径
5. **Dry-Run 先行**：复杂任务建议先 `--dry-run` 校验参数合法性
