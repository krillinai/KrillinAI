# Contributing writing templates

Writing templates are reviewed, declarative capability packages. They are not executable plugins.

## Add a community template

1. Create `templates/community/<slug>/`.
2. Add `template.json`, the Markdown resources declared by `skill.stageResources`, and the upstream `LICENSE`.
3. Use an id beginning with `community.` and a semantic version.
4. Give the template a `sortOrder`; community templates should normally start at 100 or later.
5. Pin GitHub sources to a full commit SHA. Do not point at a moving branch.
6. Provide complete `zh-CN` and `en-US` localized metadata. Keep `name` as the canonical upstream name for attribution.
7. Run `pnpm --filter @opencreator/writing-templates test`.

Only `verified` and `featured` templates are published in the application. New pull requests should normally use `submitted`; maintainers change the status after license, content, safety, and generation-quality review.

## Package rules

- Allowed files: JSON manifests, Markdown/text resources, `LICENSE`, `NOTICE`, and `README.md`.
- Scripts, binaries, executable files, symbolic links, remote runtime imports, and tool instructions are rejected.
- A package may contain at most 32 files and 256 KiB. Each prompt resource may contain at most 64 KiB.
- Keep quoted third-party material out of prompt resources unless redistribution rights are explicit.
- Describe writing techniques instead of promising an exact imitation of a living author or public figure.

The manifest contract is documented by `schema/writing-template.schema.json`. The generated catalog is build output and must not be edited by hand.
