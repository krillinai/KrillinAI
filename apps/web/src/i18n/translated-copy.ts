import type { AppLanguage } from './language.js';

type LanguageCatalog = Readonly<Record<string, string>>;
const catalogs: Partial<Record<AppLanguage, LanguageCatalog>> = {};
export const additionalLanguageCatalogs: Readonly<typeof catalogs> = catalogs;

const catalogLoaders = {
  'ja-JP': () => import('./locales/ja-JP.json'),
  'sv-SE': () => import('./locales/sv-SE.json'),
  'ko-KR': () => import('./locales/ko-KR.json'),
  'es-ES': () => import('./locales/es-ES.json'),
  'fr-FR': () => import('./locales/fr-FR.json'),
  'de-DE': () => import('./locales/de-DE.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  'zh-TW': () => import('./locales/zh-TW.json'),
  'it-IT': () => import('./locales/it-IT.json'),
  'ru-RU': () => import('./locales/ru-RU.json'),
  'tr-TR': () => import('./locales/tr-TR.json'),
  'id-ID': () => import('./locales/id-ID.json'),
  'vi-VN': () => import('./locales/vi-VN.json'),
  'th-TH': () => import('./locales/th-TH.json'),
  'fil-PH': () => import('./locales/fil-PH.json'),
  'hi-IN': () => import('./locales/hi-IN.json'),
  'bn-BD': () => import('./locales/bn-BD.json'),
  'pl-PL': () => import('./locales/pl-PL.json'),
  'uk-UA': () => import('./locales/uk-UA.json'),
  'nl-NL': () => import('./locales/nl-NL.json'),
  'ms-MY': () => import('./locales/ms-MY.json'),
  'da-DK': () => import('./locales/da-DK.json'),
  'nb-NO': () => import('./locales/nb-NO.json'),
  'fi-FI': () => import('./locales/fi-FI.json'),
  'cs-CZ': () => import('./locales/cs-CZ.json'),
  'ro-RO': () => import('./locales/ro-RO.json'),
  'hu-HU': () => import('./locales/hu-HU.json'),
  'el-GR': () => import('./locales/el-GR.json'),
  'ta-IN': () => import('./locales/ta-IN.json'),
  'te-IN': () => import('./locales/te-IN.json'),
  'bg-BG': () => import('./locales/bg-BG.json'),
  'sk-SK': () => import('./locales/sk-SK.json'),
  'hr-HR': () => import('./locales/hr-HR.json'),
  'sr-RS': () => import('./locales/sr-RS.json'),
  'ar-SA': () => import('./locales/ar-SA.json'),
  'fa-IR': () => import('./locales/fa-IR.json'),
  'ur-PK': () => import('./locales/ur-PK.json'),
  'he-IL': () => import('./locales/he-IL.json'),
  'mr-IN': () => import('./locales/mr-IN.json'),
  'gu-IN': () => import('./locales/gu-IN.json'),
  'pa-IN': () => import('./locales/pa-IN.json')
};
const pendingCatalogs = new Map<AppLanguage, Promise<void>>();

export function hasLanguageCatalog(language: AppLanguage): boolean {
  return !Object.hasOwn(catalogLoaders, language) || catalogs[language] !== undefined;
}

export function loadLanguageCatalog(language: AppLanguage): Promise<void> {
  if (hasLanguageCatalog(language)) return Promise.resolve();
  const pending = pendingCatalogs.get(language);
  if (pending !== undefined) return pending;
  const load = catalogLoaders[language as keyof typeof catalogLoaders]().then(module => {
    catalogs[language] = module.default;
  }).finally(() => {
    pendingCatalogs.delete(language);
  });
  pendingCatalogs.set(language, load);
  return load;
}

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
