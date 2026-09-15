# Creator Preset Video Sources

本目录保存 Creator 模板预览视频的原始 MP4，仅用于重新生成模板目录中的轻量预览片。

- `video-generation/<template-id>/1/example.mp4` 是原始样片。
- `template/video-generation/<template-id>/1/example.mp4` 是安装包实际使用的预览片。
- 原始样片不参与 `templates:compile`，也不会进入 Web 或 Desktop 资源包。
- 预览片由 `node scripts/optimize-creator-preview-videos.mjs` 生成，默认限制为 8 秒、最长边 640 像素、15 fps、H.264 CRF 29。
- 编译器同时限制单个预览片不超过 8 MiB、时长不超过 10 秒，全部模板预览片合计不超过 20 MiB。
