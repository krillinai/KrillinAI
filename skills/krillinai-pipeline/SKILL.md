---
name: krillinai-pipeline
description: Use when planning multi-stage KrillinAI CLI workflows such as subtitle plus TTS plus horizontal or vertical render; current pipeline execution is a reserved/planned surface unless implementation is wired in.
---

# KrillinAI Pipeline

Use this skill for end-to-end or multi-stage planning. In the current CLI, `pipeline` has output planning support but execution may not be wired in; prefer individual commands for real work unless verified.

## Command

```bash
./build/krillinai-cli pipeline --outputs "subtitle,tts,vertical-bilingual"
```

## Outputs Values

| Output | Stage |
|---|---|
| `subtitle` | Generate subtitle files |
| `tts` | Generate dubbing |
| `horizontal-bilingual` | Render landscape bilingual video |
| `horizontal-dubbed` | Render landscape dubbed video |
| `vertical-bilingual` | Render portrait bilingual video |
| `vertical-dubbed` | Render portrait dubbed video |
| `cover` | Generate cover |

## When To Use Pipeline

Use pipeline when the user asks for a complete result and the CLI implementation supports executing it. Prefer individual commands now for real runs, debugging, testing, or recovering a failed stage.

## Recovery Strategy

- If `subtitle` succeeds and render fails, rerun only render with the same `--workdir`.
- If TTS fails, keep subtitle outputs and rerun `tts` after fixing provider config.
- Read `krillinai_manifest.json` before rerunning to avoid repeating expensive work.

## Verification

- If the command returns `unsupported_command`, run the stages individually.
- Confirm stdout JSON success when pipeline execution is wired in.
- Confirm manifest stages for requested outputs are marked successful.
- Inspect final requested media/cover files, not only intermediate outputs.
- For shared CLI details, read `skills/krillinai-cli/references/cli-contract.md`.
