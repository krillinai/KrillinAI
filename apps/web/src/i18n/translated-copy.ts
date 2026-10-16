import type { AppLanguage } from './language.js';

type LanguageCatalog = Readonly<Record<string, string>>;
const catalogs: Partial<Record<AppLanguage, LanguageCatalog>> = {};
export const additionalLanguageCatalogs: Readonly<typeof catalogs> = catalogs;

const catalogLoaders = {
  'sv-SE': () => import('./locales/sv-SE.json'),
  'ja-JP': () => import('./locales/ja-JP.json'),
  'ko-KR': () => import('./locales/ko-KR.json'),
  'es-ES': () => import('./locales/es-ES.json'),
  'fr-FR': () => import('./locales/fr-FR.json'),
  'de-DE': () => import('./locales/de-DE.json'),
  'pt-BR': () => import('./locales/pt-BR.json')
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
