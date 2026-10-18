import type { CreatorTtsProvider } from './creator-services.js';

export type DictionaryEntry = {
  source: string;
  targetLanguage: string;
  translation: string;
  preserveOriginal: boolean;
  note: string;
};
export type SubtitleStyleAssetData = {
  subtitleFont: 'system' | 'sans' | 'serif' | 'rounded';
  subtitleWeight: 'regular' | 'medium' | 'bold';
  subtitleSize: 'small' | 'medium' | 'large';
  subtitleColor: string;
  subtitleSecondaryColor: string;
  subtitleOutlineColor: string;
  subtitleOutlineWidth: number;
  subtitleShadowEnabled: boolean;
  subtitleShadowColor: string;
  subtitleShadowOpacity: number;
  subtitleShadowOffsetX: number;
  subtitleShadowOffsetY: number;
  subtitleShadowBlur: number;
};
export type VoiceAssetData = {
  provider: CreatorTtsProvider;
  model: string;
  voiceId: string;
  language: string;
};
export type PersonalAssetInput = { name: string } & (
  | { kind: 'dictionary'; data: { entries: DictionaryEntry[] } }
  | { kind: 'voice'; data: VoiceAssetData }
  | { kind: 'subtitle-style'; data: SubtitleStyleAssetData }
);
export type PersonalAsset = PersonalAssetInput & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type PersonalAssetKind = PersonalAsset['kind'];
export type DictionaryAsset = Extract<PersonalAsset, { kind: 'dictionary' }>;
export type PersonalAssetBundle = {
  format: 'opencreator-assets';
  version: 1;
  assets: PersonalAssetInput[];
};

export const defaultSubtitleStyleAsset: SubtitleStyleAssetData = {
  subtitleFont: 'sans',
  subtitleWeight: 'bold',
  subtitleSize: 'medium',
  subtitleColor: '#FFFFFF',
  subtitleSecondaryColor: '#D1D5DB',
  subtitleOutlineColor: '#000000',
  subtitleOutlineWidth: 2.5,
  subtitleShadowEnabled: true,
  subtitleShadowColor: '#000000',
  subtitleShadowOpacity: 0.6,
  subtitleShadowOffsetX: 1.5,
  subtitleShadowOffsetY: 1.5,
  subtitleShadowBlur: 0.5
};

/** First selected dictionary wins. Keep conflicts visible before starting a task. */
export function resolveTranslationDictionaries(
  assets: DictionaryAsset[],
  targetLanguage: string
) {
  const terms = new Map<string, DictionaryEntry>();
  const conflicts = new Set<string>();
  const normalizeLanguage = (value: string) =>
    value
      .toLowerCase()
      .replaceAll('_', '-')
      .replace(/^zh-(cn|hans)$/, 'zh-cn')
      .replace(/^zh-(tw|hant)$/, 'zh-tw');
  for (const asset of assets)
    for (const entry of asset.data.entries) {
      if (
        entry.targetLanguage !== '*' &&
        normalizeLanguage(entry.targetLanguage) !==
          normalizeLanguage(targetLanguage)
      )
        continue;
      const key = entry.source.trim().toLocaleLowerCase();
      const previous = terms.get(key);
      if (
        previous &&
        (previous.preserveOriginal ? previous.source : previous.translation) !==
          (entry.preserveOriginal ? entry.source : entry.translation)
      )
        conflicts.add(entry.source);
      if (!previous) terms.set(key, entry);
    }
  return { entries: [...terms.values()], conflicts: [...conflicts] };
}
