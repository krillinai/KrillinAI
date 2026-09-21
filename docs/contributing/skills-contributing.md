# Contributing a Skill

> English | [简体中文](../zh/contributing/skills-contributing.md)

A Skill is a folder under [`skills/`](../../skills/) with a `SKILL.md` at its root, following the [`SKILL.md` convention](https://agentskills.io). It packages a reusable Agent workflow: when to use it, what commands or tools to call, and how to interpret outputs. This guide walks through adding one.

---

## What a Skill IS / IS NOT

**A Skill IS:**
- A repeatable workflow the Agent can follow, described in natural language plus commands.
- Domain knowledge that doesn't belong in core code: how to invoke a CLI stage, how to structure a prompt for a media provider, how to validate a plan.
- Small. One folder, one `SKILL.md`, optional `references/` for longer material the Agent reads on demand.

**A Skill IS NOT:**
- A product feature. UI changes, new Runtime endpoints, and new workspace behavior are code contributions (`apps/web/`, `apps/daemon/`).
- A copy of an existing Skill with tweaked wording. If your change improves an existing workflow, edit that Skill instead.
- A wrapper around credentials or a specific user's local paths. Skills must work from a clean checkout.

## Quick start

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<your-skill>   # start from the closest existing Skill
# edit skills/<your-skill>/SKILL.md
pnpm web:dev                                     # verify the Agent picks it up in a conversation
```

The fastest path is copying the Skill closest to your idea and rewriting it — the existing `krillinai-*` Skills show the expected structure and tone.

## Skill anatomy

```
skills/<your-skill>/
├── SKILL.md            # required: frontmatter + instructions
└── references/         # optional: long docs the SKILL.md points to
    └── cli-contract.md
```

`SKILL.md` starts with YAML frontmatter:

```yaml
---
name: your-skill
description: Use when <trigger condition>, including <main capabilities>.
---
```

Two rules reviewers enforce:

- **`name` must match the folder name.** Lowercase, hyphenated.
- **`description` is the discovery surface.** It is what the Agent reads to decide whether this Skill applies. Write it as "Use when …", name the trigger and the outcome, and keep it to one or two sentences. Vague descriptions ("helps with video") get sent back.

The body should cover, in order:

1. **When to use** — one paragraph.
2. **Commands** — fenced code blocks with the exact invocation, including required environment variables or working directories.
3. **Inputs and flags** — a table for anything non-obvious; mark required vs optional.
4. **Outputs** — where results land and how to read them (for example, "read paths from the manifest").
5. **Failure modes** — known errors and what to do about them.

Keep `SKILL.md` scannable. Move long contracts, full flag lists, or background material into `references/` and link to them with a relative path — the Agent reads references only when needed.

## Running locally

After `pnpm web:dev`, start a conversation and describe a task that should trigger your Skill. Verify:

- The Agent selects the Skill for the right requests — and does not select it for unrelated ones.
- Commands in the Skill run from a clean checkout without manual fixes.
- Output paths and error handling match what the Skill documents.

## Merge bar

A reviewer will check every item below — paste this into your PR and tick them off:

- [ ] Folder name and `name` frontmatter match; lowercase-hyphenated.
- [ ] `description` names the trigger condition and the outcome ("Use when …").
- [ ] Commands run from a clean checkout; no absolute local paths or credentials.
- [ ] Inputs, outputs, and failure modes are documented.
- [ ] Long reference material lives in `references/`, not inline.
- [ ] Verified in a real conversation: the Skill triggers when it should and only then.
- [ ] If the Skill overlaps an existing one, the PR explains why a separate Skill is warranted.

## Common rejection patterns

- **Duplicate of an existing Skill** with only cosmetic wording changes — improve the existing one instead.
- **A feature in disguise** — the Skill only works if paired with code changes to the Runtime or UI; submit the code change as its own PR.
- **Untested commands** — flags that don't exist, outputs that don't match the documented paths.
- **Undocumented prerequisites** — the Skill silently assumes a provider config, a binary, or a network service.

---

Questions? [Open an issue](https://github.com/krillinai/OpenCreator/issues/new) with the `skill` topic and we'll help you scope it.
