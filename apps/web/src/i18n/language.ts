import { openCreatorLanguagePreferences, openCreatorLanguages, type OpenCreatorLanguage, type OpenCreatorLanguagePreference } from '@opencreator/protocol';

export type AppLanguagePreference = OpenCreatorLanguagePreference;
export type AppLanguage = OpenCreatorLanguage;

export const appLanguageOptions: ReadonlyArray<{ value: AppLanguage; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
  { value: 'sv-SE', label: 'Svenska' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'tr-TR', label: 'Türkçe' },
  { value: 'id-ID', label: 'Bahasa Indonesia' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'th-TH', label: 'ไทย' },
  { value: 'fil-PH', label: 'Filipino' },
  { value: 'hi-IN', label: 'हिन्दी' },
  { value: 'bn-BD', label: 'বাংলা' },
  { value: 'pl-PL', label: 'Polski' },
  { value: 'uk-UA', label: 'Українська' },
  { value: 'nl-NL', label: 'Nederlands' },
  { value: 'ms-MY', label: 'Bahasa Melayu' },
  { value: 'da-DK', label: 'Dansk' },
  { value: 'nb-NO', label: 'Norsk bokmål' },
  { value: 'fi-FI', label: 'Suomi' },
  { value: 'cs-CZ', label: 'Čeština' },
  { value: 'ro-RO', label: 'Română' },
  { value: 'hu-HU', label: 'Magyar' },
  { value: 'el-GR', label: 'Ελληνικά' },
  { value: 'ta-IN', label: 'தமிழ்' },
  { value: 'te-IN', label: 'తెలుగు' },
  { value: 'bg-BG', label: 'Български' },
  { value: 'sk-SK', label: 'Slovenčina' },
  { value: 'hr-HR', label: 'Hrvatski' },
  { value: 'sr-RS', label: 'Српски' }
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
    const parts = candidate.toLowerCase().split(/[-_]/);
    const base = parts[0];
    if (base === 'zh') return isTraditionalChinese(parts.slice(1)) ? 'zh-TW' : 'zh-CN';
    // Browsers may report Norwegian Bokmål using the generic Norwegian code.
    if (base === 'no') return 'nb-NO';
    // Tagalog is the basis of Filipino and some systems still report it as tl.
    if (base === 'tl') return 'fil-PH';
    const language = openCreatorLanguages.find(locale => locale.split('-')[0] === base);
    if (language) return language;
  }
  return 'en-US';
}

// zh-Hant and the Taiwan, Hong Kong and Macau regions use Traditional characters.
function isTraditionalChinese(subtags: readonly string[]): boolean {
  if (subtags.includes('hans')) return false;
  return subtags.some(tag => tag === 'hant' || tag === 'tw' || tag === 'hk' || tag === 'mo');
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
