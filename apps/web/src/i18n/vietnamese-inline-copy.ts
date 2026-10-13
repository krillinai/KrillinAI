// VI-1 Vietnamese inline-copy backfill map.
//
// Analogous to swedish-inline-copy.ts: keyed by the canonical English copy of
// an l(chinese, english[, swedish[, vietnamese]]) call site, valued with the
// Vietnamese translation. Lookup order under vi-VN is:
//   explicit 4th argument → vietnameseInlineCopy[english] → english.
// Chinese is never a Vietnamese fallback.
//
// VI-1 ships this map EMPTY on purpose: every inline site deterministically
// renders English until VI-2 translates it. Do not add entries casually.
//
// Collision constraint (audited 2026-10-09, see
// apps/web/src/i18n/vietnamese-locale.test.ts "english key collision audit"):
// the same English string is reused with materially different meanings at
// ~65 keys / ~263 sites (e.g. 'Provider' → 供应商/图像服务/服务商/视频服务,
// 'Voice' → 音色/声音/基础音色/配音服务, 'Prompt' → 封面描述/画面描述/提示词/
// 视频描述, 'Settings' → 封面设置/任务设置/生成设置, 'Back' → 返回/上一步).
// A single EN→VI entry CANNOT correctly translate those sites. Rules:
//   1. Never add a divergent English key to this map (the collision test fails).
//   2. Divergent sites must be fixed in VI-2 with explicit 4th arguments or by
//      migrating to key-based t() copy — not via this map.
//   3. Only add English keys proven unique (single meaning across all sites).
export const vietnameseInlineCopy: Record<string, string> = {};
