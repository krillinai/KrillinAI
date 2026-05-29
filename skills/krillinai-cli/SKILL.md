---
name: krillinai-cli
description: Use when an agent needs to operate KrillinAI through its CLI, choose the right stage command, inspect CLI outputs, or run subtitle, TTS, landscape render, and portrait render tasks from a YouTube/local video input.
---

# KrillinAI CLI

Use this as the top-level routing skill for KrillinAI command-line work.

## Quick Start

Prefer the repo-local binary:

```bash
./build/krillinai-cli <command> [flags]
```

If it does not exist, build it first:

```bash
go build -o build/krillinai-cli ./cmd/cli
```

For common JSON, manifest, outputs, and error semantics, read:

```text
skills/krillinai-cli/references/cli-contract.md
```

## Choose The Command

| User intent | Command / skill |
|---|---|
| Generate source, target, bilingual, and short vertical subtitles | `subtitle`; use `krillinai-subtitle` |
| Generate target-language dubbing from subtitles | `tts`; use `krillinai-tts` |
| Create landscape videos | `render-horizontal`; use `krillinai-render-horizontal` |
| Create portrait/short-form videos | `render-vertical`; use `krillinai-render-vertical` |

`pipeline`, `cover`, and `status` are planned/reserved surfaces in the current CLI. Use their skills for planning or dry-run documentation only unless the implementation has been wired in.

## Operating Rules For Agents

- Use a dedicated `--workdir`; do not scatter outputs in the repo root.
- Prefer `--dry-run` when validating command shape or planning a run.
- Parse stdout JSON and `krillinai_manifest.json`; do not parse normal logs.
- Reuse manifest outputs for later stages instead of guessing filenames.
- If a command fails, classify by `error.kind`: `usage`, `retryable`, `dependency`, or `internal`.
- Avoid rerunning expensive stages if the manifest already has valid upstream outputs.

## Minimal Workflow

```bash
./build/krillinai-cli subtitle "https://www.youtube.com/watch?v=VIDEO_ID" \
  --origin-lang en \
  --target-lang zh_cn \
  --workdir tasks/demo \
  --caption-source any

./build/krillinai-cli render-vertical \
  --workdir tasks/demo \
  --video tasks/demo/origin_video.mp4 \
  --subtitle tasks/demo/short_origin_mixed_srt.srt
```
