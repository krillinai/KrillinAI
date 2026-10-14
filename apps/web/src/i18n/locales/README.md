# Additional client languages

These static catalogs cover the keyed UI messages, English inline copy, and interpolated inline templates for Swedish, Japanese, Korean, Spanish, French, German, and Brazilian Portuguese. Explicit Swedish copy and the previously reviewed inline catalog take precedence over the Swedish fallback catalog.

The initial translations were generated from public UI source strings using Google Translate in October 2026. Primary navigation, actions, and terminology are reviewed separately. The client never calls a translation service at runtime.

Keys are the English source messages. Keep `{{name}}` placeholders in keyed messages and `{{0}}`, `{{1}}`, etc. in inline templates intact; translated templates may reorder placeholders. Unknown messages fall back to English.

Product and provider names should retain their official spelling. Display language does not change a project's content language or provider configuration.
