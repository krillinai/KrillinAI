import { openCreatorLanguagePreferences, openCreatorLanguages, type OpenCreatorLanguage, type OpenCreatorLanguagePreference } from '@opencreator/protocol';

export type AppLanguagePreference = OpenCreatorLanguagePreference;
export type AppLanguage = OpenCreatorLanguage;

export const appLanguageOptions: ReadonlyArray<{ value: AppLanguage; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'sv-SE', label: 'Svenska' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'pt-BR', label: 'Português (Brasil)' }
];

export const languagePreferenceStorageKey = 'opencreator.preferences.language';
export const defaultLanguagePreference: AppLanguagePreference = 'system';

export function readLanguagePreference(): AppLanguagePreference {
  try {
    const value = window.localStorage.getItem(languagePreferenceStorageKey);
    return isLanguagePreference(value) ? value : defaultLanguagePreference;
  } catch {
    return defaultLanguagePreference;
  }
}

export function writeLanguagePreference(preference: AppLanguagePreference): void {
  try {
    window.localStorage.setItem(languagePreferenceStorageKey, preference);
  } catch {
    return;
  }
}

export function resolveSystemLanguage(languages?: readonly string[]): AppLanguage {
  const candidates = languages ?? readBrowserLanguages();
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    const language = openCreatorLanguages.find(locale => locale.split('-')[0] === base);
    if (language) return language;
  }
  return 'en-US';
}

export function resolveAppLanguage(
  preference: AppLanguagePreference,
  languages?: readonly string[]
): AppLanguage {
  return preference === 'system' ? resolveSystemLanguage(languages) : preference;
}

export function applyAppLanguage(language: AppLanguage): void {
  document.documentElement.lang = language;
  document.documentElement.dataset.locale = language;
}

function readBrowserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en-US'];
  if (navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : ['en-US'];
}

function isLanguagePreference(value: string | null): value is AppLanguagePreference {
  return openCreatorLanguagePreferences.includes(value as AppLanguagePreference);
}
