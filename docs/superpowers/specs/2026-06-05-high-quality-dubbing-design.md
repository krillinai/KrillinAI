# 高质量配音算法重构设计

## 背景

KrillinAI 当前配音流程集中在 `internal/service/srt2speech.go`：读取 SRT、逐条调用 TTS、按原字幕时长补静音或加速、拼接成 `tts_final_audio.wav`，再替换原视频音轨生成 `video_with_tts.mp4`。这个流程简单，但会带来几个质量问题：

- Web 一键任务可能把双语字幕交给 TTS，导致配错语言。
- 逐句硬对齐会让短句碎、长句语速过快，口播不自然。
- SRT parser 对多行、CRLF、无尾空行不稳。
- TTS 失败可能用静音替代，成片质量不可控。
- ffmpeg 替换音轨失败时只记录日志，可能留下无效输出路径。

本设计参考 VideoLingo 的配音思路：为配音单独生成任务，估算朗读时长，合并短句和相邻句，按 chunk 统一拟合时间轴，并生成新的配音字幕。第一阶段优先解决口播自然度和时间轴质量，不引入人声/背景分离。

## 目标

第一版重构完成后直接替换原配音接口，不保留旧算法切换。

- Web 一键任务仍调用 `s.srtFileToSpeech(...)`。
- CLI `krillinai-cli tts` 仍调用 `pipeline.GenerateTTS(...)`。
- 继续兼容现有 TTS provider：`openai`、`aliyun`、`edge-tts`。
- 最终输出继续保持 `tts_final_audio.wav` 和 `video_with_tts.mp4`。
- 新增调试和质量产物：`dub.srt`、`dubbing_plan.json`、`dubbing_report.json`、分段音频目录。
- 允许 LLM 对超时或生硬文本做口播化改写，目标是自然表达，不要求逐字一致。

## 非目标

第一阶段不做人声分离、背景声保留、多说话人识别、口型同步、情绪曲线控制或逐镜头混音。这些属于第二阶段影视混音能力。

## 总体架构

新增高质量配音流水线，替代当前逐句硬对齐主流程。建议拆成以下模块：

- `DubbingInput`：读取和标准化目标语言 SRT，生成配音专用字幕。
- `DurationEstimator`：估算文本自然朗读时长，返回时长和置信度。
- `SpeechOptimizer`：调用 LLM 对超时或生硬文本做口播化改写。
- `DubbingPlanner`：分析时长、gap、短句和静默边界，生成 chunk 计划。
- `TTSGenerator`：调用现有 `types.Ttser` 生成原始音频片段。
- `TimelineFitter`：按 chunk 级别计算调速因子和新时间轴。
- `AudioAssembler`：插入静音、拼接 fitted 片段，生成最终音轨和 `dub.srt`。
- `VideoMuxer`：把配音音轨合入原视频，生成 `video_with_tts.mp4`。

这些模块都应通过结构化数据交互，避免继续把解析、规划、TTS、ffmpeg 和状态更新堆在一个函数中。

## 输入选择

Web 全流程中，`splitSrt` 已经生成 `target_language_srt.srt`，配音输入必须指向目标语言单语字幕，而不是 `bilingual_srt.srt`。如果目标语言字幕不存在，应返回明确错误，不再隐式读取双语字幕第一行。

CLI 中，`--input-srt` 仍保留。若 `--line-mode` 是双语模式，则继续先抽取目标语言行；若是 `target-only`，直接使用输入文件。

## 输出产物

新增中间目录：

```text
tasks/<task>/dubbing/
  dubbing_input.srt
  dubbing_plan.json
  dubbing_report.json
  dub.srt
  segments/
    raw/<id>.wav
    fitted/<id>.wav
```

最终产物保持现有路径：

```text
tasks/<task>/tts_final_audio.wav
tasks/<task>/video_with_tts.mp4
```

`dubbing_plan.json` 记录每句原时间、清理后文本、改写后文本、估算时长、真实时长、chunk ID、调速因子和新时间轴。`dubbing_report.json` 记录 warning、失败重试、最大调速、溢出、低置信度估时和改写次数。

## SRT 解析和配音字幕

SRT parser 必须按块解析，支持：

- 多行字幕文本。
- CRLF 和 LF。
- 文件末尾无空行。
- 空文本块。
- 双语输入显式抽取目标行。

配音专用文本会清理：

- 括号内音效说明和无关提示。
- 重复空格。
- 容易导致 TTS 异常的符号。
- 空文本或单字符无意义文本。

清理不能删除核心语义。若需要改变语义或缩短内容，必须走 `SpeechOptimizer` 并记录改写。

## DurationEstimator

新增接口：

```go
type DurationEstimator interface {
    Estimate(text string, language types.StandardLanguageCode) (seconds float64, confidence float64, err error)
}
```

第一版采用高级估时器优先、启发式兜底：

### StatisticalSpeechEstimator

默认 estimator，包含：

- 按语言维护基础语速参数，例如中文字符/秒、英文词/分钟、日文字符/秒。
- 按标点增加停顿，例如逗号、句号、问号、换行。
- 对数字、英文缩写、符号读法加入惩罚项。
- 根据当前任务内真实 TTS 结果动态校准 provider/language 系数。
- 返回 confidence；低置信度会让 planner 更保守地分 chunk。

### HeuristicEstimator

兜底 estimator，仅在统计估时器缺少语言参数或异常时使用。它必须简单可解释，保证配音流程不会因为估时失败中断。

## 口播化改写

`SpeechOptimizer` 使用现有 LLM 客户端。触发条件：

- 估算时长明显超过可用时长。
- TTS 后真实时长超过 `speed_max` 可接受范围。
- 文本存在明显字幕腔、重复词或不适合口播的结构。

改写要求：

- 保留核心含义。
- 使用目标语言自然口语表达。
- 优先缩短冗余结构。
- 不添加新事实。
- 输出单行纯文本。

每条文本最多改写 `rewrite_max_attempts` 次。改写前后文本、触发原因和使用次数写入计划和报告。

## Chunk 规划

Chunk 规划参考 VideoLingo，但保持 Go 项目轻量实现：

- 字幕短于 `min_subtitle_duration` 时，优先与后一句合并。
- 相邻句 gap 小于阈值时，可进入同一个 chunk。
- 明显静默边界不跨越，默认以 `gap_tolerance` 判断。
- 每个 chunk 最多合并 `max_chunk_size` 条。
- chunk 起点固定为第一句起点。
- chunk 终点允许吃掉后续 gap，但不允许造成全片明显漂移。

Planner 先用估算时长规划，再在 TTS 生成真实时长后允许一次二次拟合。

## TTS 生成

`TTSGenerator` 继续调用现有 `types.Ttser.Text2Speech(text, voice, outputFile)`。保留当前三类 provider，不在第一阶段引入 provider 专属接口。

失败策略：

- 每条文本最多重试 3 次。
- 最后一次重试前可先让 LLM 清理或改写文本。
- 只有空文本、音效说明或无意义单字符可生成短静音。
- 正常文本最终失败时，整个配音失败，不再静默替代。

## 时间轴拟合

每个 chunk 在获得真实音频时长后统一计算 `speed_factor`。默认配置：

```toml
speed_min = 0.95
speed_accept = 1.15
speed_max = 1.30
```

原则：

- 不主动加速；能自然放下就保持原速。
- 在 `speed_accept` 以内可以直接调速。
- 超过 `speed_accept` 但不超过 `speed_max` 时记录 warning。
- 超过 `speed_max` 时先二次改写并重新 TTS。
- 改写后仍超时，允许小幅溢出并记录 warning，避免硬拉成怪异语速。

调速后必须重新测量输出文件时长，并校验与预期差异。过大差异直接报错。

## 音频合成

`AudioAssembler` 根据新时间轴插入前置静音和段间静音。第一版所有片段合成前统一标准化为 `pcm_s16le`、单声道、44100Hz，和当前 TTS wav 及静音生成逻辑保持一致。

最终输出：

- `dub.srt`：与配音音轨一致的新字幕时间轴。
- `tts_final_audio.wav`：最终配音音轨。

生成的时间轴必须单调递增，不能重叠。若局部溢出，需要在 `dubbing_report.json` 记录。

## 视频合成

第一阶段仍用配音音轨替换原视频音轨，生成 `video_with_tts.mp4`。与当前实现不同，ffmpeg 失败必须返回错误，且输出文件必须校验存在且非空。

后续渲染字幕时，若开启配音，继续使用 `VideoWithTtsFilePath` 作为输入视频。

## 配置

新增 `[dubbing]` 配置段：

```toml
[dubbing]
min_subtitle_duration = 2.5
max_chunk_size = 5
gap_tolerance = 1.5
speed_min = 0.95
speed_accept = 1.15
speed_max = 1.30
enable_text_rewrite = true
rewrite_max_attempts = 2
estimator = "statistical"
```

这些配置应有默认值。缺省配置文件也必须能运行。

## 测试策略

必须新增单元测试覆盖：

- SRT parser：多行、CRLF、无尾空行、空文本、双语目标行抽取。
- Web 配音输入选择：必须使用目标语言单语 SRT。
- estimator：不同语言、标点停顿、低置信度、动态校准。
- SpeechOptimizer：触发条件、改写次数限制、失败回退。
- chunk planner：短句合并、gap 吸收、chunk 上限、静默边界。
- timeline fitter：调速边界、二次改写触发、时间轴单调递增。
- audio assembler：前置静音、段间静音、最终时长。
- TTS 失败路径：重试、改写后重试、正常文本最终失败。
- video muxer：ffmpeg 失败必须返回错误，输出文件校验。
- CLI/API 兼容：`tts_final_audio.wav` 和 `video_with_tts.mp4` 仍写入 manifest 或 stepParam。

集成测试可用 fake TTS 生成固定长度 wav，避免依赖外部服务。

## 实施顺序建议

1. 建立新配音数据模型、配置和块级 SRT parser。
2. 修正 Web 配音输入为目标语言单语 SRT。
3. 实现 estimator、planner、timeline fitter，并用 fake 音频测试。
4. 接入现有 TTS provider，生成 raw/fitted 片段。
5. 实现 audio assembler 和 `dub.srt` 输出。
6. 替换 `srtFileToSpeech` 主流程。
7. 收紧错误处理和 ffmpeg 输出校验。
8. 跑单元测试和一个端到端手工样例。

## 第二阶段方向

第二阶段可加入：

- Demucs 或等价方案分离人声/背景声。
- 背景声与新配音混音，而不是替换整条音轨。
- 多说话人识别和音色映射。
- provider-specific 语速、风格、情绪参数。
- 质量评分和自动重试策略升级。
