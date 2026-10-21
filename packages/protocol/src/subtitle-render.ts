export type SubtitleRenderCueInput = { start: string; end: string; text: string; sourceText?: string };
export type SubtitleRenderCue = { startMs: number; endMs: number; text: string; sourceText?: string };

function milliseconds(value: string): number {
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!match) throw new TypeError('Invalid subtitle timestamp');
  return Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3]) * 1000 + Number(match[4]);
}

/** Adapt legacy paired SRT and overlapping source events using explicit target
 * timelines. No language or character-script heuristic decides a text's role. */
export function normalizeSubtitleRenderCues(input: {
  cues: SubtitleRenderCueInput[];
  legacyMixed?: boolean;
  targetPosition?: 'top' | 'bottom';
  targetCues?: SubtitleRenderCueInput[];
}): SubtitleRenderCue[] {
  const cues = input.cues.map(cue => ({ startMs: milliseconds(cue.start), endMs: milliseconds(cue.end), text: cue.text, sourceText: cue.sourceText }));
  if (!input.legacyMixed) return cues;
  const targets = new Set((input.targetCues ?? []).map(cue => `${milliseconds(cue.start)}:${milliseconds(cue.end)}`));
  const seen = new Set<string>();
  const sources = cues.map(cue => {
    if (cue.sourceText !== undefined || cue.text.includes('\n')) return false;
    const key = `${cue.startMs}:${cue.endMs}`;
    if (targets.has(key) && !seen.has(key)) { seen.add(key); return false; }
    return targets.size > 0;
  });
  const result: SubtitleRenderCue[] = [];
  const emit = (cue: SubtitleRenderCue) => { if (cue.endMs > cue.startMs) result.push(cue); };
  for (let i = 0; i < cues.length;) {
    const cue = cues[i]!;
    if (sources[i]) throw new TypeError('Source subtitle has no matching translation timeline');
    i++;
    if (cue.sourceText !== undefined) { emit(cue); continue; }
    const lines = cue.text.split('\n');
    if (lines.length > 1) {
      emit({ ...cue, text: input.targetPosition === 'bottom' ? lines.slice(1).join('\n') : lines[0]!,
        sourceText: input.targetPosition === 'bottom' ? lines[0]! : lines.slice(1).join('\n') });
      continue;
    }
    let cursor = cue.startMs;
    while (i < cues.length && sources[i]) {
      const source = cues[i++]!;
      if (source.endMs <= cue.startMs || source.startMs >= cue.endMs) throw new TypeError('Source subtitle does not overlap its translation');
      const startMs = Math.max(cursor, source.startMs), endMs = Math.min(cue.endMs, source.endMs);
      emit({ ...cue, startMs: cursor, endMs: startMs });
      emit({ ...cue, startMs, endMs, sourceText: source.text });
      cursor = Math.max(cursor, endMs);
    }
    emit({ ...cue, startMs: cursor });
  }
  return result;
}
