import { describe, expect, it } from 'vitest';
import { findSubtitleMatches, replaceSubtitleMatches } from './subtitle-search.js';

const cues = [
  { id: 1, start: '00:00:00,000', end: '00:00:04,000', text: 'Hello hello [.*] 👋 你好', sourceText: 'HELLO 你好' },
  { id: 2, start: '00:00:05,000', end: '00:00:08,000', text: 'hello again' }
];

describe('subtitle search and replacement', () => {
  it('finds literal, non-overlapping occurrences with case and field scopes', () => {
    expect(findSubtitleMatches(cues, '', 'all', false)).toEqual([]);
    expect(findSubtitleMatches(cues, 'hello', 'all', false)).toHaveLength(4);
    expect(findSubtitleMatches(cues, 'hello', 'text', true)).toHaveLength(2);
    expect(findSubtitleMatches(cues, 'hello', 'sourceText', false)).toHaveLength(1);
    expect(findSubtitleMatches(cues, '[.*]', 'all', false)).toMatchObject([{ cueId: 1, field: 'text', start: 12, end: 16 }]);
    expect(findSubtitleMatches([{ ...cues[0]!, text: 'aaa' }], 'aa', 'text', true)).toHaveLength(1);
  });

  it('replaces once or all with literal replacement text without changing timing or untouched fields', () => {
    const matches = findSubtitleMatches(cues, 'hello', 'text', false);
    const once = replaceSubtitleMatches(cues, [matches[1]!], '$&');
    expect(once[0]).toEqual({ ...cues[0], text: 'Hello $& [.*] 👋 你好' });
    expect(once[1]).toBe(cues[1]);
    const all = replaceSubtitleMatches(cues, matches, 'a longer replacement');
    expect(all[0]).toEqual({ ...cues[0], text: 'a longer replacement a longer replacement [.*] 👋 你好' });
    expect(all[1]).toEqual({ ...cues[1], text: 'a longer replacement again' });
    expect(cues[0]!.text).toBe('Hello hello [.*] 👋 你好');
  });

  it('handles Unicode offsets and deletes matches across both fields while preserving absent source text', () => {
    expect(replaceSubtitleMatches(cues, findSubtitleMatches(cues, '👋', 'text', false), 'Hi')[0]!.text).toBe('Hello hello [.*] Hi 你好');
    const result = replaceSubtitleMatches(cues, findSubtitleMatches(cues, '你好', 'all', true), '');
    expect(result[0]).toEqual({ ...cues[0], text: 'Hello hello [.*] 👋 ', sourceText: 'HELLO ' });
    expect(result[1]).not.toHaveProperty('sourceText');
  });
});
