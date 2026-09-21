# Contributing to OpenCreator

> English | [简体中文](./docs/zh/CONTRIBUTING.md)

Thanks for thinking about contributing. OpenCreator is a local-first creator workspace built on the Codex agent loop, and most of its value lives in focused additions: one Skill folder, one creation template, one well-scoped fix. This guide tells you where each type of contribution lives and what bar a PR has to clear before we merge it.

---

## Contribution map

| If you want to… | You're really adding | Where it lives | Ship size |
|---|---|---|---|
| Fix a bug or improve a workflow | code | `apps/web/`, `apps/daemon/` | one focused PR with tests |
| Add a reusable Agent workflow | a **Skill** | [`skills/<your-skill>/`](skills/) | one folder with `SKILL.md` and optional references → [guide](docs/contributing/skills-contributing.md) |
| Add a reusable image, video, or cover preset | a **Creation template** | [`template/<module>/<id>/<version>/`](template/) | one folder with `template.json` plus assets → [guide](docs/contributing/templates-contributing.md) |
| Contribute illustrations, icons, or UI designs | design assets | agreed asset location | one PR with previews, source files, and license |
| Add an AI or media provider | a **service integration** | relevant Web or Daemon module | one PR with error handling, credential safety, and tests |
| Improve docs or translations | docs | `README.md`, `docs/`, `docs/<locale>/README.md` | one PR |

If you're not sure which bucket your idea is in, [open an issue first](https://github.com/krillinai/OpenCreator/issues/new) and we'll point you at the right surface.

---

## Local setup

The full setup lives in the [README Quick Start](./README.md#quick-start). The TL;DR for contributors:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable          # selects the pinned pnpm from packageManager
pnpm install
pnpm web:dev             # web + local daemon on demand
pnpm typecheck           # TypeScript checks across the repository
pnpm test                # workspace unit and integration tests
```

Node.js 22+ and a Codex CLI executable are required. Open `http://127.0.0.1:19861/` after `pnpm web:dev`; the Runtime prepares a default project on first launch and the composer is ready as soon as the connection completes.

---

## How to contribute

1. Describe the problem, use case, and expected behavior in an [issue](https://github.com/krillinai/OpenCreator/issues).
2. Create a focused feature or fix branch from the latest development branch.
3. Follow the existing architecture: implement general product capabilities **once** in Web and Daemon, and isolate native Desktop differences behind explicit capabilities (for example `canSelectDirectory`).
4. Add appropriate unit, integration, or E2E coverage for behavior changes, and list both completed and skipped verification in the PR.
5. Never commit `.runtime/`, local credentials, Codex sessions, build caches, or other user data.

## What reviewers check

- **Single implementation for shared behavior.** The same feature must not be implemented separately for Browser Bridge and Desktop Bridge.
- **Capability gating, not silent stubs.** A platform-specific entry must be hidden when the capability is unavailable — never show a button that silently does nothing.
- **Tests match the change risk.** Small copy or style tweaks need only targeted checks; shared state, persistence, or Runtime contract changes need module tests and typecheck at minimum.
- **Docs updated with behavior.** If your change alters a user-visible workflow, update the README or the relevant doc in `docs/` in the same PR.

## Common reasons PRs get sent back

- The same logic was added separately to Web and Desktop paths instead of the shared service layer.
- A platform-unsupported button is visible but its handler silently returns.
- Behavior changed without any test or verification note.
- The PR mixes an unrelated refactor or fix into a feature change.
- Generated files, `.runtime/` data, or credentials were committed.

---

OpenCreator · Create locally, work continuously.
