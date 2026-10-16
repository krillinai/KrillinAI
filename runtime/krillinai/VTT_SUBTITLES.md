# YouTube 字幕格式兼容性

HTTP Server 和 CLI 共用字幕处理入口。处理 VTT 前始终识别字幕格式：

- 含行内单词时间戳的字幕沿用逐词处理。
- 只有字幕块时间戳的整句字幕直接保留每个字幕块的完整正文和时间轴。
- 格式检测失败时返回错误，不默认猜测为逐词格式。

旧配置字段 enable_block_vtt_batch 保留读取兼容性，但不再决定是否检测字幕格式。关闭该开关也能正确处理整句字幕。

仅原文模式不执行翻译。双语模式生成原文 SRT、译文 SRT、双语 SRT，以及 output/origin_language.txt 和 output/target_language.txt。空字幕、无效时间区间、缺少原文或译文、必需文本产物写入失败时，不报告处理完成。

定向验证命令：

    go test ./internal/service -run 'TestProcessYouTubeSubtitle|TestDetectVttFormat|TestValidateYouTubeSubtitleBlocks' -count=1

设置 KRILLIN_VTT_TASKS_DIR 为保存线上失败字幕的 tasks 目录后，会额外使用三个原始失败输入运行回归测试；测试只读取原始文件，并在临时目录生成产物。
