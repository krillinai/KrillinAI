# KrillinAI CLI Contract

## Binary

Build from repo root:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

Run with:

```bash
./build/krillinai-cli <command> [flags]
```

## Commands

| Command | Purpose |
|---|---|
| `subtitle` | Generate source-language, target-language, bilingual, and short vertical subtitles |
| `tts` | Generate TTS audio and optional dubbed video |
| `render-horizontal` | Render landscape subtitle/dubbed videos |
| `render-vertical` | Render portrait subtitle/dubbed videos |
| `pipeline` | Planned orchestration surface; currently safe for planning/dry-run only unless execution is wired in |
| `cover` | Planned cover generation surface; currently manifest/output schema is reserved |
| `status` | Reserved status query |

## Manifest

Every working directory should contain:

```text
krillinai_manifest.json
```

Read this file to locate stage outputs. Important default paths:

| Output key | Default path |
|---|---|
| `origin_video` | `<workdir>/origin_video.mp4` |
| `origin_audio` | `<workdir>/origin_audio.mp3` |
| `origin_srt` | `<workdir>/origin_language_srt.srt` |
| `target_srt` | `<workdir>/target_language_srt.srt` |
| `bilingual_srt` | `<workdir>/bilingual_srt.srt` |
| `short_origin_mixed_srt` | `<workdir>/short_origin_mixed_srt.srt` |
| `tts_audio` | `<workdir>/tts_final_audio.wav` |
| `video_with_tts` | `<workdir>/video_with_tts.mp4` |
| `horizontal_video` | `<workdir>/horizontal_bilingual.mp4` |
| `vertical_video` | `<workdir>/vertical_bilingual.mp4` |
| `transferred_vertical_video` | `<workdir>/transferred_vertical_video.mp4` |
| `origin_cover` | `<workdir>/origin_cover.jpg` |
| `generated_cover` | `<workdir>/generated_cover.png` |
| `cover_prompt` | `<workdir>/cover_prompt.final.txt` |

## JSON Output

Commands print normal logs and one JSON response. Agents should parse the JSON response and manifest, not logs.

Success shape:

```json
{
  "ok": true,
  "stage": "subtitle",
  "workdir": "tasks/demo",
  "task_id": "demo",
  "outputs": {}
}
```

Failure shape:

```json
{
  "ok": false,
  "error": {
    "kind": "retryable",
    "code": "audio_transcription_failed",
    "message": "connection timeout",
    "retryable": true
  }
}
```

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Usage error |
| `2` | Retryable error |
| `3` | Dependency error |

## Error Handling

- `usage`: fix flags or missing input.
- `retryable`: retry after delay or switch provider/source.
- `dependency`: install or expose `ffmpeg`, `ffprobe`, or `yt-dlp`.
- `internal`: inspect logs and generated files.

## Verification

For command-shape checks:

```bash
./build/krillinai-cli subtitle local:demo.mp4 --origin-lang en --target-lang zh_cn --workdir /tmp/krillinai-check --dry-run
```

For rendered media, inspect the output file and optionally extract preview frames with `ffmpeg`.
