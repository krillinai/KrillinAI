# KrillinAI CLI 化设计

日期：2026-05-28

## 背景

KrillinAI 现有能力主要通过 Web/桌面入口触发，核心流程集中在 `StartSubtitleTask` 的后台 goroutine 中：链接转本地音视频、字幕生成、TTS、视频嵌字幕、结果上传。用户希望把这些能力 CLI 化，让 Agent 可以稳定、可组合地调用，并能在失败后基于已生成产物继续执行。

现有任务目录已经形成了一套有效产物约定，例如 `origin_video.mp4`、`origin_audio.mp3`、`origin_language_srt.srt`、`target_language_srt.srt`、`bilingual_srt.srt`、`short_origin_mixed_srt.srt`。CLI 设计应复用这些约定，同时补齐机器可读输出、阶段化调用和真实回退语义。

## 目标

1. 提供阶段化 CLI，方便 Agent 单独调用字幕、TTS、横屏视频、竖屏视频、封面生成能力。
2. 提供 `pipeline` 命令，把阶段串成完整流水线。
3. 支持 YouTube、Bilibili 链接和本地文件。
4. 字幕阶段优先使用平台已有字幕，找不到或处理失败时按策略回退到 Whisper/现有转录 provider。
5. 每个命令默认同步执行，输出稳定 JSON，并维护 `krillinai_manifest.json`。
6. 复用现有 service 能力，避免重新实现一套视频处理业务逻辑。

## 非目标

1. 第一版不重写 server/desktop UI。
2. 第一版不要求完全移除现有 `StartSubtitleTask` 异步任务。
3. 第一版不把 CLI 做成仅调用本地 HTTP server 的包装器。
4. 封面生成可以先落接口和配置契约；如 image provider 接入成本过高，可排到第二阶段实现。

## 推荐方案

采用“阶段化命令 + pipeline 编排 + 本地 Pipeline Core”。

新增 CLI 入口，命令直接调用本地 Pipeline Core，而不是强依赖已启动的 HTTP server。Pipeline Core 从现有 `internal/service` 中抽出同步阶段函数，供 CLI 调用；server/desktop 后续可逐步迁移到同一层。

备选方案比较：

1. HTTP API 包装型 CLI：改动小，但依赖 server 进程，任务状态在内存中，阶段化能力受限。
2. 本地 Pipeline Core：更适合 Agent，可同步、可恢复、产物路径稳定。推荐采用。
3. 独立新流水线：边界最干净，但会复制大量下载、字幕、TTS 和渲染逻辑，维护风险高。

## CLI 命令结构

推荐命令形态：

```bash
krillinai subtitle <url-or-local-file> --origin-lang en --target-lang zh_cn --workdir tasks/foo
krillinai tts --workdir tasks/foo --input-srt target_language_srt.srt --line-mode target-only
krillinai render-horizontal --workdir tasks/foo --video origin_video.mp4 --subtitle bilingual_srt.srt
krillinai render-horizontal --workdir tasks/foo --video origin_video.mp4 --audio tts_final_audio.wav --subtitle target_language_srt.srt
krillinai render-vertical --workdir tasks/foo --video origin_video.mp4 --subtitle short_origin_mixed_srt.srt
krillinai render-vertical --workdir tasks/foo --video origin_video.mp4 --audio tts_final_audio.wav --subtitle target_language_srt.srt
krillinai cover --workdir tasks/foo --input-cover origin_cover.jpg --prompt-template prompts/bilibili-cover.md
krillinai pipeline <url-or-local-file> --origin-lang en --target-lang zh_cn --outputs subtitle,tts,horizontal-bilingual,horizontal-dubbed,vertical-bilingual,vertical-dubbed,cover
```

阶段命令默认同步执行。`pipeline` 默认同步，支持 `--async`；异步模式返回 `task_id`，并通过 `krillinai status <task_id>` 查询状态。

## 工作目录与产物契约

CLI 支持两种工作目录模式：

1. 不传 `--workdir`：沿用 `./tasks/<task_id>/`。
2. 传 `--workdir`：所有阶段在该目录读写，推荐 Agent 使用。

字幕阶段核心产物：

```text
origin_video.mp4
origin_audio.mp3
origin_language_srt.srt
target_language_srt.srt
bilingual_srt.srt
short_origin_srt.srt
short_origin_mixed_srt.srt
output/origin_language.txt
output/target_language.txt
```

TTS 阶段产物：

```text
tts_final_audio.wav
video_with_tts.mp4
audio_duration_details.txt
```

视频阶段产物：

```text
horizontal_bilingual.mp4
horizontal_dubbed.mp4
vertical_bilingual.mp4
vertical_dubbed.mp4
transferred_vertical_video.mp4
```

封面阶段产物：

```text
origin_cover.jpg
origin_cover.png
generated_cover.png
cover_prompt.final.txt
```

每个阶段更新 `krillinai_manifest.json`，记录输入 URL、语言、字幕来源、provider、产物路径、警告、阶段状态和可恢复信息。

## 字幕生成流程

`krillinai subtitle` 从链接或本地视频生成原语言、目标语言、双语字幕。输入支持 YouTube、Bilibili、`local:<path>` 和普通本地路径。

字幕来源通过参数控制：

```bash
--caption-source any
--caption-source manual
--caption-source auto
--caption-source whisper
```

默认 `any`，语义为：人工字幕、自动字幕、Whisper/转录 provider。`manual` 和 `auto` 表示禁止回退到转录，找不到或处理失败即失败。

YouTube 流程：

1. 用 `yt-dlp` 查询并下载匹配 `--origin-lang` 的人工或自动字幕，支持 `.srt` 和 `.vtt`。
2. VTT 继续复用现有 word-level/block-level 处理逻辑生成标准 SRT。
3. 生成目标语言字幕和双语字幕。
4. 如果平台字幕不可用且策略允许，则下载音频并进入转录流程。

Bilibili 流程：

1. 优先尝试平台字幕。
2. 字幕不可用且策略允许时，下载音频并进入转录流程。

本地文件流程：

1. 默认抽取音频并转录。
2. 如果用户传 `--input-srt`，跳过转录，只做翻译和双语合成。

需要修正现有行为：当前 YouTube VTT 下载或处理失败时日志写了 fallback，但代码实际把任务置失败。Pipeline Core 中应按 `caption-source` 策略真正回退到转录。

字幕命令 stdout 示例：

```json
{
  "ok": true,
  "stage": "subtitle",
  "caption_source": "youtube_auto_vtt",
  "outputs": {
    "origin_srt": "tasks/foo/origin_language_srt.srt",
    "target_srt": "tasks/foo/target_language_srt.srt",
    "bilingual_srt": "tasks/foo/bilingual_srt.srt"
  },
  "warnings": ["人工字幕未找到，使用自动字幕"]
}
```

## TTS 设计

`krillinai tts` 把目标语言字幕变成配音。命令要求显式传 `--input-srt`，并用 `--line-mode` 描述文本提取方式：

```bash
--line-mode target-only
--line-mode bilingual-target-top
--line-mode bilingual-target-bottom
```

默认输入为 `target_language_srt.srt`，默认 `line-mode` 为 `target-only`。输出 `tts_final_audio.wav`。如果 `--video` 存在，或 workdir 中存在 `origin_video.mp4`，额外生成 `video_with_tts.mp4`。

TTS provider 复用现有配置中的 `openai`、`aliyun`、`edge-tts`。CLI 支持 `--voice` 和 `--voice-clone-source` 覆盖配置。

失败策略沿用现有思路：少量字幕失败时允许继续，超过一半失败则整体失败。stdout 和 manifest 必须列出失败字幕 index，方便 Agent 重试或人工处理。

## 横屏与竖屏视频生成

视频生成拆成两个命令：

```bash
krillinai render-horizontal --subtitle bilingual_srt.srt
krillinai render-horizontal --audio tts_final_audio.wav --subtitle target_language_srt.srt
krillinai render-vertical --subtitle short_origin_mixed_srt.srt
krillinai render-vertical --audio tts_final_audio.wav --subtitle target_language_srt.srt
```

没有 `--audio` 时表示“原视频 + 字幕”。有 `--audio` 时表示“替换为 TTS 配音 + 字幕”。

横屏输出：

```text
horizontal_bilingual.mp4
horizontal_dubbed.mp4
```

竖屏输出：

```text
vertical_bilingual.mp4
vertical_dubbed.mp4
```

竖屏命令会把横屏源视频转换为竖屏中间产物 `transferred_vertical_video.mp4`。双语竖屏默认使用 `short_origin_mixed_srt.srt`，TTS 竖屏默认使用 `target_language_srt.srt`。

现有 `horizontal_embed.mp4` 和 `vertical_embed.mp4` 命名对 Agent 不够明确。CLI 层应输出更具体的 bilingual/dubbed 文件名，避免后续步骤找错文件。

## 封面生成

`krillinai cover` 从原封面和 prompt 模板生成新封面：

```bash
krillinai cover --workdir tasks/foo --input-cover origin_cover.jpg --prompt-template prompts/bilibili-cover.md
krillinai cover --workdir tasks/foo --url "https://youtube.com/..." --prompt-template prompts/bilibili-cover.md
```

如果传 URL，CLI 先用 `yt-dlp` 下载原封面到 `origin_cover.jpg` 或 `origin_cover.png`。

prompt 模板支持变量：

```text
{{title}}
{{description}}
{{origin_language}}
{{target_language}}
{{style_hint}}
```

输出：

```text
cover_prompt.final.txt
generated_cover.png
```

image provider 采用 OpenAI-compatible 配置：

```toml
[image]
provider = "openai-compatible"

[image.openai]
base_url = ""
api_key = ""
model = "gpt-image-1"
```

## JSON 输出与退出码

所有 CLI 命令统一遵守：

1. 成功：退出码 `0`，stdout 输出 JSON，日志走 stderr 或 log 文件。
2. 参数或配置错误：退出码 `1`，stdout 输出 JSON，`retryable:false`。
3. 可恢复失败：退出码 `2`，stdout 输出 JSON，包含 `ok:false`、`stage`、`error.code`、`retryable:true` 和已生成产物。
4. 外部依赖缺失：退出码 `3`，指出缺少 `ffmpeg`、`yt-dlp`、模型或 API key。

Agent 应只依赖退出码、stdout JSON 和 `krillinai_manifest.json`，不解析普通日志。

## 内部架构

新增一层 Pipeline Core，建议包名为 `internal/pipeline`。核心接口：

```go
PrepareMedia(ctx, req) (Manifest, error)
GenerateSubtitles(ctx, req) (Manifest, error)
GenerateSpeech(ctx, req) (Manifest, error)
RenderHorizontal(ctx, req) (Manifest, error)
RenderVertical(ctx, req) (Manifest, error)
GenerateCover(ctx, req) (Manifest, error)
RunPipeline(ctx, req) (Manifest, error)
```

`Manifest` 是阶段之间的稳定接口。CLI 参数优先级高于 manifest，manifest 再补齐默认路径。

第一版可先让 Pipeline Core 包装现有 `internal/service` 的能力，但要把异步 goroutine 流程改造成同步可调用阶段。server/desktop 可暂时保持现状，后续再迁移。

## 测试策略

单元测试：

1. CLI 参数解析。
2. manifest 读写与参数覆盖规则。
3. 字幕来源策略。
4. 双语字幕 `line-mode` 文本抽取。
5. 输出文件命名。

集成测试：

1. 用短样例 SRT 验证 TTS 输入解析和音频拼接逻辑。
2. 用短视频验证横屏/竖屏渲染命令构造和产物存在。
3. 外部 API 使用 fake provider 或 mock client。

冒烟测试：

1. 本地配置可用时，用短 YouTube/Bilibili 链接跑字幕生成。
2. 验证 stdout JSON、manifest 和核心产物存在。
3. 验证平台字幕失败时能按策略回退转录。

## 实施边界

第一阶段实现：

1. `subtitle`
2. `tts`
3. `render-horizontal`
4. `render-vertical`
5. `pipeline`
6. `krillinai_manifest.json`
7. 统一 stdout JSON 与退出码

第二阶段实现或完善：

1. `cover`
2. server/desktop 迁移到 Pipeline Core
3. 更完整的异步任务持久化
4. 更多字幕平台来源策略

## 待确认风险

1. Bilibili 平台字幕获取能力需要在实施前验证现有 `yt-dlp` 行为；如果不可用，应明确回退到转录。
2. 现有 TTS 少量失败继续执行的策略可能生成不完整配音；manifest 必须暴露失败 index。
3. 横屏输入为竖屏时，现有逻辑会跳过横屏生成；CLI 应在 JSON 中返回 warning，而不是静默成功。
4. image provider 的兼容协议可能因供应商差异需要适配层，第一版可先以 OpenAI Images API 形态作为最小实现。
