import type { SubtitleCue } from './VideoTranslationResultWorkspace.js';

export type SubtitleSearchScope = 'text' | 'sourceText' | 'all';
export type SubtitleMatch = { cueId: number; cueIndex: number; field: 'text' | 'sourceText'; start: number; end: number };

export function findSubtitleMatches(cues: SubtitleCue[], query: string, scope: SubtitleSearchScope, matchCase: boolean): SubtitleMatch[] {
  if (!query) return [];
  // Escape user text: punctuation and replacement tokens are always literal.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'gu' : 'giu');
  const fields = scope === 'all' ? ['sourceText', 'text'] as const : [scope];
  return cues.flatMap((cue, cueIndex) => fields.flatMap(field => {
    const text = cue[field];
    if (text === undefined) return [];
    return Array.from(text.matchAll(pattern), match => ({ cueId: cue.id, cueIndex, field,
      start: match.index!, end: match.index! + match[0].length }));
  }));
}

export function replaceSubtitleMatches(cues: SubtitleCue[], matches: SubtitleMatch[], replacement: string): SubtitleCue[] {
  const byCue = new Map<number, SubtitleMatch[]>();
  for (const match of matches) byCue.set(match.cueId, [...(byCue.get(match.cueId) ?? []), match]);
  return cues.map(cue => {
    const found = byCue.get(cue.id);
    if (!found) return cue;
    const next = { ...cue };
    // Work backwards so replacements never invalidate the remaining offsets.
    for (const match of [...found].sort((a, b) => b.start - a.start)) {
      const text = next[match.field]!;
      next[match.field] = text.slice(0, match.start) + replacement + text.slice(match.end);
    }
    return next;
  });
}
