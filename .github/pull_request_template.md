## Summary

<!-- What does this PR change, and why? Link the related issue if one exists. -->

## Change risk level

<!-- Pick the level that matches this change. Verification must match the risk and actual blast radius — do not escalate a small, local, low-risk change to full test suites, production builds, or Desktop packaging by default. See AGENTS.md for the full policy. -->

- [ ] **P0 — Low risk**: copy, style tweaks, defaults, local display conditions, test assertions. No Runtime/API/persistence contract changes.
- [ ] **P1 — Medium risk**: shared state, business logic, persistence, cross-component interaction, Runtime request parameters, shared components.
- [ ] **P2 — High risk**: Daemon/Runtime, protocol, database migration, process management, service configuration, build/packaging, release pipeline, or Web/Desktop parity changes.

## Verification

<!-- List what you actually ran. Report only the verification you performed — do not imply overall regression safety from checks you skipped. -->

- [ ] Targeted checks for the changed files / closest tests
- [ ] `pnpm typecheck` for affected packages (TypeScript changes)
- [ ] Module tests for affected areas (P1+)
- [ ] Production build (only when touching compile boundaries, lazy loading, assets, or build config)
- [ ] Service restart + health check (P2 daemon/runtime changes)
- [ ] Web/Desktop parity checks (shared UI, Bridge, or packaging changes)

**Actually ran:**

<!-- e.g. `pnpm --filter @opencreator/web typecheck`, `pnpm test -- skills` -->

**Intentionally skipped, and why:**

<!-- e.g. Desktop packaging — no Desktop-facing changes -->

## Web / Desktop parity

<!-- Required when touching apps/web pages, state, services, Host Bridge, daemon project logic, Desktop preload, window logic, protocol proxy, or packaging scripts. -->

- [ ] This change does not affect Web/Desktop parity
- [ ] General capability implemented once in shared Web/Daemon code (no per-bridge forks)
- [ ] Platform-specific entries are hidden when the capability is unavailable (no silent no-op buttons)
- [ ] The same flow was checked on the other platform, not only the one where the issue was reported

## Checklist

- [ ] Focused change — no unrelated refactors or fixes mixed in
- [ ] Docs updated in the same PR if user-visible behavior changed
- [ ] No `.runtime/`, credentials, Codex sessions, build caches, or user data committed
