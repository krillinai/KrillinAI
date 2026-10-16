import japanese from './locales/ja-JP.json' with { type: 'json' };
import swedish from './locales/sv-SE.json' with { type: 'json' };
import korean from './locales/ko-KR.json' with { type: 'json' };
import spanish from './locales/es-ES.json' with { type: 'json' };
import french from './locales/fr-FR.json' with { type: 'json' };
import german from './locales/de-DE.json' with { type: 'json' };
import portuguese from './locales/pt-BR.json' with { type: 'json' };
import traditionalChinese from './locales/zh-TW.json' with { type: 'json' };
import italian from './locales/it-IT.json' with { type: 'json' };
import russian from './locales/ru-RU.json' with { type: 'json' };
import turkish from './locales/tr-TR.json' with { type: 'json' };
import indonesian from './locales/id-ID.json' with { type: 'json' };
import vietnamese from './locales/vi-VN.json' with { type: 'json' };
import type { AppLanguage } from './language.js';

export const additionalLanguageCatalogs: Readonly<Partial<Record<AppLanguage, Readonly<Record<string, string>>>>> = {
  'sv-SE': swedish,
  'ja-JP': japanese,
  'ko-KR': korean,
  'es-ES': spanish,
  'fr-FR': french,
  'de-DE': german,
  'pt-BR': portuguese,
  'zh-TW': traditionalChinese,
  'it-IT': italian,
  'ru-RU': russian,
  'tr-TR': turkish,
  'id-ID': indonesian,
  'vi-VN': vietnamese
};

type TemplateMatcher = { pattern: RegExp; slots: string[]; translation: string };
const templateMatchers = new Map<AppLanguage, TemplateMatcher[]>();

export function translateTraditionalChinese(english: string): string | undefined {
  const translated = translateEnglishCopy('zh-TW', english);
  return translated === english ? undefined : translated;
}

export function translateEnglishCopy(language: AppLanguage, english: string): string {
  const catalog = additionalLanguageCatalogs[language];
  if (!catalog) return english;
  if (Object.hasOwn(catalog, english)) return catalog[english]!;

  let matchers = templateMatchers.get(language);
  if (!matchers) {
    matchers = Object.entries(catalog).filter(([source]) => /\{\{\d+\}\}/.test(source))
      // Prefer specific phrases over a broader template such as "Download {{0}}".
      .sort(([a], [b]) => b.replace(/\{\{\d+\}\}/g, '').length - a.replace(/\{\{\d+\}\}/g, '').length)
      .map(([source, translation]) => {
      const slots: string[] = [];
      // Keep interpolated values intact while allowing translations to reorder them.
      const pattern = source.split(/(\{\{\d+\}\})/).map(part => {
        if (/^\{\{\d+\}\}$/.test(part)) { slots.push(part); return '([\\s\\S]*?)'; }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('');
      return { pattern: new RegExp(`^${pattern}$`), slots, translation };
    });
    templateMatchers.set(language, matchers);
  }

  for (const { pattern, slots, translation } of matchers) {
    const match = pattern.exec(english);
    if (!match) continue;
    return translation.replace(/\{\{\d+\}\}/g, slot => match[slots.indexOf(slot) + 1] ?? slot);
  }
  return english;
}
