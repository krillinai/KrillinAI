---
name: krillinai-cover
description: Use when planning or documenting KrillinAI cover generation from an original video cover and prompt templates; the current CLI cover command is a reserved/planned surface unless implementation is wired in.
---

# KrillinAI Cover

Use this skill for cover generation planning. In the current CLI, `cover` is a reserved/planned surface; verify implementation before running it as a real stage.

## Command

```bash
./build/krillinai-cli cover
```

Treat this as planned until execution is wired in. The intended cover stage is manifest-driven and should run from a prepared workdir after upstream stages populate `krillinai_manifest.json`.

## Inputs

- `origin_cover.jpg`
- prompt template / final prompt
- optional translated title or summary from previous stages

## Outputs

- `generated_cover.png`
- `cover_prompt.final.txt`

## Agent Guidance

- Read `krillinai_manifest.json` to locate cover inputs and outputs.
- Preserve the original cover as source material; write generated images to the workdir.
- If the command returns `unsupported_command`, report that cover execution is not yet wired into the CLI.
- If image generation credentials or provider config are missing after cover support is wired in, return a dependency/configuration issue rather than silently skipping.
- For shared CLI response semantics, read `skills/krillinai-cli/references/cli-contract.md`.
