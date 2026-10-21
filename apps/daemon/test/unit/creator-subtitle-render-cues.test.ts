import { describe, expect, it } from 'vitest';
import { normalizeSubtitleRenderCues } from '@opencreator/protocol';

const cue = (text: string, start = '00:00:00,000', end = '00:00:04,000') => ({ text, start, end });
describe('shared subtitle role adapter', () => {
  it('retains explicit roles and manual multiline text', () => {
    expect(normalizeSubtitleRenderCues({ cues: [{ ...cue('Manual\nline'), sourceText: 'Original\nline' }] }))
      .toEqual([{ startMs: 0, endMs: 4000, text: 'Manual\nline', sourceText: 'Original\nline' }]);
  });
  it.each(['top', 'bottom'] as const)('decodes paired legacy text using stored %s position', targetPosition => {
    const text = targetPosition === 'top' ? 'Bonjour !\nHello!' : 'Hello!\nBonjour !';
    expect(normalizeSubtitleRenderCues({ cues: [cue(text)], legacyMixed: true, targetPosition }))
      .toEqual([{ startMs: 0, endMs: 4000, text: 'Bonjour !', sourceText: 'Hello!' }]);
  });
  it('pairs independent source timelines, preserves gaps and works without CJK heuristics', () => {
    const target = cue('Bonjour !');
    const actual = normalizeSubtitleRenderCues({ legacyMixed: true, targetCues: [target], cues: [target,
      cue('Hello', '00:00:00,500', '00:00:02,000'), cue('world', '00:00:02,000', '00:00:03,000')] });
    expect(actual).toEqual([
      { startMs: 0, endMs: 500, text: 'Bonjour !', sourceText: undefined },
      { startMs: 500, endMs: 2000, text: 'Bonjour !', sourceText: 'Hello' },
      { startMs: 2000, endMs: 3000, text: 'Bonjour !', sourceText: 'world' },
      { startMs: 3000, endMs: 4000, text: 'Bonjour !', sourceText: undefined }
    ]);
  });
});
