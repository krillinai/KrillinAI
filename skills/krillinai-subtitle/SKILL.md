---
name: krillinai-subtitle
description: Use when generating subtitles with KrillinAI CLI from a YouTube link, Bilibili/local video, or existing media, including platform caption download, Whisper fallback, translation, bilingual SRT, and short vertical subtitle output.
---

# KrillinAI Subtitle

Use this skill for the `subtitle` stage.

## Command

```bash
./build/krillinai-cli subtitle "<input>" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any
```

Build the CLI first if needed:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

## Inputs

- YouTube URL: prefer `--caption-source any`; platform captions are used first, then Whisper fallback.
- Local file: use `local:/abs/path/video.mp4` or a path accepted by the CLI.
- Bilibili or other yt-dlp supported links: use when media download works; platform caption behavior may differ, so expect transcription fallback.

## Important Flags

| Flag | Use |
|---|---|
| `--origin-lang` | Source language, such as `en`, `zh`, `ja` |
| `--target-lang` | Target language, such as `zh_cn` |
| `--workdir` | Dedicated task directory |
| `--caption-source any` | Prefer platform captions, fallback to transcription |
| `--caption-source whisper` | Force transcription |
| `--bilingual-top=true` | Put target language on top in bilingual SRT |
| `--dry-run` | Validate without downloads or AI calls |

## Outputs

Read paths from `krillinai_manifest.json`. Main files:

- `origin_language_srt.srt`
- `target_language_srt.srt`
- `bilingual_srt.srt`
- `short_origin_mixed_srt.srt`
- `origin_video.mp4`
- `origin_audio.mp3`

## Verification

- Confirm stdout JSON has `"ok": true`.
- Confirm `krillinai_manifest.json` exists under `--workdir`.
- Spot-check `bilingual_srt.srt` ordering and `short_origin_mixed_srt.srt` readability.
- For Agent integration details, read `skills/krillinai-cli/references/cli-contract.md`.

