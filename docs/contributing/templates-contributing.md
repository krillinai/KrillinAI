# Contributing a Creation Template

> English | [简体中文](../zh/contributing/templates-contributing.md)

A creation template is a folder under [`template/<module>/<id>/<version>/`](../../template/) with a `template.json` and its local assets. Templates power the visual pickers for image generation, video generation, and cover generation — users start from your preset instead of a blank prompt. This guide walks through adding one.

---

## What a creation template IS / IS NOT

**A template IS:**
- A tuned preset: prompt defaults, style hints, ratio/duration/quality settings, plus a cover and preview that show the result.
- Self-contained. Everything the picker shows lives in the template folder.

**A template IS NOT:**
- A new template *type*. The current modules are `image-generation`, `video-generation`, and `cover-generator`. If you need a new module, open an issue to discuss it first — that's a product change, not a template.
- A prompt dump. Templates with an empty or generic prompt and no localized defaults will be sent back; the value is in the tuning.
- Someone else's work without rights. See [Attribution and rights](#attribution-and-rights).

## Quick start

```bash
corepack enable && pnpm install
cp -r template/cover-generator/images-go-hard-thumbnail template/<module>/<your-template-id>
# edit template.json, replace cover/preview assets
pnpm templates:validate     # must pass before opening a PR
```

Template IDs are lowercase-hyphenated and unique within the module. Version starts at `1` — one folder per version, so updates create `<id>/2/` rather than editing `<id>/1/`.

## Folder anatomy

```
template/<module>/<id>/1/
├── template.json        # required: metadata, defaults, localized content
├── cover.jpg            # required: shown in the template picker
├── preview.jpg          # image/cover modules: larger result preview
├── previewVideo         # video module: example clip, e.g. example.mp4
└── author-avatar.jpg    # optional: credited author's avatar
```

## template.json field guide

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | Currently `1`. |
| `id`, `version`, `module` | yes | Must match the folder path `<module>/<id>/<version>/`. |
| `runtimeTemplate` | yes | Maps to the runtime executor, e.g. `{"id": "cover", "version": 2}`. Copy from a template in the same module. |
| `status` | yes | `published` to ship; use `draft` while iterating. |
| `title`, `description` | yes | Both `zh-CN` and `en-US` are required. Other locales are optional. |
| `cover` | yes | Relative path to the picker thumbnail. |
| `preview` / `previewVideo` | module-dependent | `preview` for image and cover modules, `previewVideo` for video. |
| `defaults` | yes | The baseline settings users start from (prompt, ratio, duration, quality…). |
| `defaultsByLocale` | strongly recommended | Localized prompt and style overrides per locale. This is where the real tuning lives — see below. |
| `tags` | recommended | Searchable labels; keep them factual. |
| `author` | if applicable | `name`, `url`, `avatar` for credited external sources. |
| `featured`, `sortOrder` | no | Leave `featured: false`; maintainers decide featuring. |

## The prompt is the product

Reviewers spend most of their time on `defaults` and `defaultsByLocale`:

- **Both locales must be real prompts**, not translations that lost the tuning. The `zh-CN` and `en-US` prompts should produce equivalent results with their respective phrasing strengths.
- **Parametrize what's meant to change.** If the headline text or subject is user-editable, say so explicitly in the prompt (existing templates use markers like "Customizable text: …").
- **State constraints.** "No watermark, no extra text, no extra people" — negative constraints matter as much as the description for reproducible output.
- **Match the module's defaults shape.** Image templates carry ratio/candidateCount/quality; video templates carry size/duration; cover templates carry headline, text language, and style fields. Copy the shape from an existing template in your module.

## Assets

- Generate the `cover.jpg` and preview **with the template itself** — a stock image or unrelated artwork will be rejected.
- Keep file sizes reasonable; these ship with the app and load in the picker.
- The preview should represent a *typical* result, not a best-of-fifty cherry-pick.

## Attribution and rights

If your template adapts someone else's published prompt or style:

- You must have the right to redistribute it.
- Fill in the `author` field with `name` and `url` (and `author-avatar.jpg` if available), as existing templates do.
- When in doubt, open an issue and ask before doing the work.

## Merge bar

- [ ] Folder path matches `id`/`version`/`module`; ID is unique within the module.
- [ ] `pnpm templates:validate` passes.
- [ ] `title` and `description` provided in both `zh-CN` and `en-US`.
- [ ] `defaultsByLocale` contains tuned prompts for both locales.
- [ ] Cover and preview assets were generated by the template itself.
- [ ] `author` attribution included when adapting external work.
- [ ] `featured: false`, `status: "published"` (or `draft` with a note in the PR).

## Common rejection patterns

- **Generic prompt** — the template adds nothing over a blank prompt; the picker doesn't need it.
- **Missing locale** — only one language tuned, or a machine-translated prompt that lost the style constraints.
- **Mismatched assets** — cover doesn't match what the prompt actually generates.
- **Rights unclear** — adapted from someone's work without attribution or permission.
- **New version edited in place** — bump the version folder instead of rewriting history on `<id>/1/`.

---

Questions? [Open an issue](https://github.com/krillinai/OpenCreator/issues/new) with your template idea and a sample output, and we'll help you scope it.
