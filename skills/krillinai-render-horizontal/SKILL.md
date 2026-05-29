---
name: krillinai-render-horizontal
description: Use when rendering landscape videos with KrillinAI CLI, including original video plus bilingual subtitles or dubbed video plus target-language subtitles.
---

# KrillinAI Render Horizontal

Use this skill for `render-horizontal`.

## Bilingual Subtitle Video

```bash
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/bilingual_srt.srt
```

## Dubbed Video

```bash
./build/krillinai-cli render-horizontal \
  --workdir tasks/demo \
  --video tasks/demo/video_with_tts.mp4 \
  --subtitle tasks/demo/target_language_srt.srt \
  --dubbed
```

## Inputs

- `--video`: source video, or omit when manifest has the correct input.
- `--subtitle`: usually `bilingual_srt.srt` for bilingual, `target_language_srt.srt` for dubbed.
- `--workdir`: directory containing `krillinai_manifest.json`.

## Outputs

- `horizontal_bilingual.mp4`
- Future/variant dubbed outputs may also be listed in manifest.

## Verification

- Confirm stdout JSON is successful.
- Confirm output video exists and has video/audio streams.
- Extract a preview frame when checking subtitle placement.
- For manifest and error handling, read `skills/krillinai-cli/references/cli-contract.md`.

