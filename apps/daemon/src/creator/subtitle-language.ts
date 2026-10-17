import { creatorLanguage } from '@opencreator/protocol';
import { francAll } from 'franc-all';
import { Converter, type ConverterFunction } from 'opencc-js/t2cn';

let toSimplified: ConverterFunction | undefined;

function productLanguage(iso6393: string): string | undefined {
  if (iso6393 === 'und') return undefined;
  if (iso6393 === 'zlm') return 'ms';
  const language = new Intl.Locale(iso6393).language;
  if (language === 'nb') return 'no';
  return creatorLanguage(language)?.code;
}

function identifySample(text: string): string | undefined {
  const ranked = francAll(text, { minLength: 40 });
  const first = ranked[0];
  const language = first && productLanguage(first[0]);
  if (!first || !language) return undefined;
  const runnerUp = ranked.find(candidate => {
    const code = productLanguage(candidate[0]);
    return code !== undefined && code !== language;
  });
  // These are relative model distances, not probability estimates. Keep close
  // languages unresolved rather than silently assigning the previous selection.
  if (runnerUp && first[1] - runnerUp[1] < 0.005) return undefined;
  return language;
}

/** Local detection from parsed cue text; filenames, timestamps and prior settings are not evidence. */
export function detectSubtitleLanguage(cues: readonly { text: string }[]): string | undefined {
  const text = cues.map(cue => cue.text).join(' ')
    .replace(/<\/?[a-z][^>]*>/giu, ' ')
    .replace(/\{\\[^}]*\}/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
  if ((text.match(/\p{L}/gu)?.length ?? 0) < 40) return undefined;
  const sampleLength = 2048; // franc's maximum sample length.
  const samples = text.length <= sampleLength ? [text] : [...new Set([
    text.slice(0, sampleLength),
    text.slice(Math.floor((text.length - sampleLength) / 2), Math.floor((text.length + sampleLength) / 2)),
    text.slice(-sampleLength)
  ])];
  const languages = samples.map(identifySample);
  const language = languages[0];
  if (!language || languages.some(value => value !== language)) return undefined;
  if (language !== 'zh_cn') return language;
  toSimplified ??= Converter({ from: 't', to: 'cn' });
  return toSimplified(text) === text ? 'zh_cn' : 'zh_tw';
}
