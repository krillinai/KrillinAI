---
name: krillinai-render-vertical
description: Use when rendering portrait videos with KrillinAI CLI, including converting source video to vertical format, adding short bilingual subtitles, rendering dubbed vertical videos, and checking vertical subtitle readability.
---

# KrillinAI Render Vertical

Use this skill for `render-vertical`.

## Bilingual Short-Subtitle Video

```bash
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt \
  --major-title "今日话题" \
  --minor-title "AI Video"
```

## Dubbed Vertical Video

```bash
./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/video_with_tts.mp4 \
  --subtitle tasks/demo/target_language_srt.srt \
  --dubbed \
  --major-title "今日话题" \
  --minor-title "AI Video"
```

## Subtitle Behavior

The Go renderer follows the good behavior from `vertical_srt.py`:

- Chinese uses word segmentation before line decisions.
- Display width is used for line splitting: Chinese counts as width 2, other text as width 1.
- Long Chinese subtitles are split across time into multiple `Dialogue` entries instead of stacked with `\N`.
- The goal is to keep the screen to one English line plus one Chinese line when possible.

## Outputs

- `transferred_vertical_video.mp4`: source converted to portrait format.
- `vertical_bilingual.mp4`: final vertical video with subtitles.

## Verification

Use text and visual checks:

```bash
rg -n -F '\\N' tasks/demo/formatted_vertical_bilingual.ass
ffmpeg -y -ss 00:00:01 -i tasks/demo/vertical_bilingual.mp4 -frames:v 1 tasks/demo/vertical_preview_%03d.jpg
```

Check that moderate Chinese subtitles do not become two stacked Chinese lines and that titles are not garbled.

