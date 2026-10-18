import { openCreatorLanguagePreferences, openCreatorLanguages, type OpenCreatorLanguage, type OpenCreatorLanguagePreference } from '@opencreator/protocol';

export type AppLanguagePreference = OpenCreatorLanguagePreference;
export type AppLanguage = OpenCreatorLanguage;

export type AppLanguageOption = { value: AppLanguage; label: string; englishName: string };

export const appLanguageOptions: ReadonlyArray<AppLanguageOption> = ([
  { value: 'zh-CN', label: '简体中文', englishName: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: '繁體中文', englishName: 'Chinese (Traditional)' },
  { value: 'en-US', label: 'English', englishName: 'English' },
  { value: 'sv-SE', label: 'Svenska', englishName: 'Swedish' },
  { value: 'ja-JP', label: '日本語', englishName: 'Japanese' },
  { value: 'ko-KR', label: '한국어', englishName: 'Korean' },
  { value: 'es-ES', label: 'Español', englishName: 'Spanish' },
  { value: 'fr-FR', label: 'Français', englishName: 'French' },
  { value: 'de-DE', label: 'Deutsch', englishName: 'German' },
  { value: 'pt-BR', label: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { value: 'it-IT', label: 'Italiano', englishName: 'Italian' },
  { value: 'ru-RU', label: 'Русский', englishName: 'Russian' },
  { value: 'tr-TR', label: 'Türkçe', englishName: 'Turkish' },
  { value: 'id-ID', label: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { value: 'vi-VN', label: 'Tiếng Việt', englishName: 'Vietnamese' },
  { value: 'th-TH', label: 'ไทย', englishName: 'Thai' },
  { value: 'fil-PH', label: 'Filipino', englishName: 'Filipino' },
  { value: 'hi-IN', label: 'हिन्दी', englishName: 'Hindi' },
  { value: 'bn-BD', label: 'বাংলা', englishName: 'Bengali' },
  { value: 'pl-PL', label: 'Polski', englishName: 'Polish' },
  { value: 'uk-UA', label: 'Українська', englishName: 'Ukrainian' },
  { value: 'nl-NL', label: 'Nederlands', englishName: 'Dutch' },
  { value: 'ms-MY', label: 'Bahasa Melayu', englishName: 'Malay' },
  { value: 'da-DK', label: 'Dansk', englishName: 'Danish' },
  { value: 'nb-NO', label: 'Norsk bokmål', englishName: 'Norwegian Bokmål' },
  { value: 'fi-FI', label: 'Suomi', englishName: 'Finnish' },
  { value: 'cs-CZ', label: 'Čeština', englishName: 'Czech' },
  { value: 'ro-RO', label: 'Română', englishName: 'Romanian' },
  { value: 'hu-HU', label: 'Magyar', englishName: 'Hungarian' },
  { value: 'el-GR', label: 'Ελληνικά', englishName: 'Greek' },
  { value: 'ta-IN', label: 'தமிழ்', englishName: 'Tamil' },
  { value: 'te-IN', label: 'తెలుగు', englishName: 'Telugu' },
  { value: 'bg-BG', label: 'Български', englishName: 'Bulgarian' },
  { value: 'sk-SK', label: 'Slovenčina', englishName: 'Slovak' },
  { value: 'hr-HR', label: 'Hrvatski', englishName: 'Croatian' },
  { value: 'sr-RS', label: 'Српски', englishName: 'Serbian' },
  { value: 'ar-SA', label: 'العربية', englishName: 'Arabic' },
  { value: 'fa-IR', label: 'فارسی', englishName: 'Persian' },
  { value: 'ur-PK', label: 'اردو', englishName: 'Urdu' },
  { value: 'he-IL', label: 'עברית', englishName: 'Hebrew' },
  { value: 'mr-IN', label: 'मराठी', englishName: 'Marathi' },
  { value: 'gu-IN', label: 'ગુજરાતી', englishName: 'Gujarati' },
  { value: 'pa-IN', label: 'ਪੰਜਾਬੀ', englishName: 'Punjabi' },
  { value: 'uz-UZ', label: 'Oʻzbekcha', englishName: 'Uzbek' },
  { value: 'kk-KZ', label: 'Қазақша', englishName: 'Kazakh' },
  { value: 'az-AZ', label: 'Azərbaycanca', englishName: 'Azerbaijani' },
  { value: 'km-KH', label: 'ខ្មែរ', englishName: 'Khmer' },
  { value: 'my-MM', label: 'မြန်မာ', englishName: 'Burmese' },
  { value: 'ne-NP', label: 'नेपाली', englishName: 'Nepali' },
  { value: 'si-LK', label: 'සිංහල', englishName: 'Sinhala' },
  { value: 'sw-KE', label: 'Kiswahili', englishName: 'Swahili' },
  { value: 'lt-LT', label: 'Lietuvių', englishName: 'Lithuanian' },
  { value: 'lv-LV', label: 'Latviešu', englishName: 'Latvian' },
  { value: 'et-EE', label: 'Eesti', englishName: 'Estonian' },
  { value: 'sl-SI', label: 'Slovenščina', englishName: 'Slovenian' },
  { value: 'ka-GE', label: 'ქართული', englishName: 'Georgian' },
  { value: 'hy-AM', label: 'Հայերեն', englishName: 'Armenian' },
  { value: 'mn-MN', label: 'Монгол', englishName: 'Mongolian' },
  { value: 'lo-LA', label: 'ລາວ', englishName: 'Lao' },
  { value: 'am-ET', label: 'አማርኛ', englishName: 'Amharic' },
  { value: 'ha-NG', label: 'Hausa', englishName: 'Hausa' },
  { value: 'yo-NG', label: 'Yorùbá', englishName: 'Yoruba' },
  { value: 'ig-NG', label: 'Igbo', englishName: 'Igbo' },
  { value: 'zu-ZA', label: 'IsiZulu', englishName: 'Zulu' },
  { value: 'af-ZA', label: 'Afrikaans', englishName: 'Afrikaans' },
  { value: 'so-SO', label: 'Soomaali', englishName: 'Somali' },
  { value: 'rw-RW', label: 'Ikinyarwanda', englishName: 'Kinyarwanda' },
  { value: 'mg-MG', label: 'Malagasy', englishName: 'Malagasy' },
  { value: 'kn-IN', label: 'ಕನ್ನಡ', englishName: 'Kannada' },
  { value: 'ml-IN', label: 'മലയാളം', englishName: 'Malayalam' },
  { value: 'or-IN', label: 'ଓଡ଼ିଆ', englishName: 'Odia' },
  { value: 'as-IN', label: 'অসমীয়া', englishName: 'Assamese' },
  { value: 'sq-AL', label: 'Shqip', englishName: 'Albanian' },
  { value: 'ca-ES', label: 'Català', englishName: 'Catalan' },
  { value: 'eu-ES', label: 'Euskara', englishName: 'Basque' },
  { value: 'gl-ES', label: 'Galego', englishName: 'Galician' },
  { value: 'is-IS', label: 'Íslenska', englishName: 'Icelandic' },
  { value: 'bs-BA', label: 'Bosanski', englishName: 'Bosnian' },
  { value: 'mk-MK', label: 'Македонски', englishName: 'Macedonian' },
  { value: 'be-BY', label: 'Беларуская', englishName: 'Belarusian' },
  { value: 'ky-KG', label: 'Кыргызча', englishName: 'Kyrgyz' },
  { value: 'tg-TJ', label: 'Тоҷикӣ', englishName: 'Tajik' },
  { value: 'tk-TM', label: 'Türkmençe', englishName: 'Turkmen' },
  { value: 'ps-AF', label: 'پښتو', englishName: 'Pashto' },
  { value: 'ku-TR', label: 'Kurdî (Kurmancî)', englishName: 'Kurdish (Kurmanji)' }
] satisfies AppLanguageOption[]).sort((a, b) => a.englishName.localeCompare(b.englishName, 'en'));

export const languagePreferenceStorageKey = 'opencreator.preferences.language';
export const defaultLanguagePreference: AppLanguagePreference = 'system';

const unsupportedSystemScripts: Partial<Record<string, readonly string[]>> = {
  uz: ['cyrl', 'arab'], az: ['cyrl', 'arab'], kk: ['latn', 'arab'],
  mn: ['mong'], ha: ['arab'],
  be: ['latn'], bs: ['cyrl', 'arab'], mk: ['latn'],
  ky: ['latn', 'arab'], tg: ['latn', 'arab'], tk: ['cyrl', 'arab'],
  ku: ['arab', 'cyrl'], ps: ['latn']
};

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
    // Older browsers still use the legacy Hebrew language code.
    if (base === 'iw') return 'he-IL';
    // This Punjabi catalog uses Gurmukhi, not Pakistan's Shahmukhi script.
    if (base === 'pa' && (parts.includes('arab') || parts.includes('pk'))) continue;
    // The Kurdish catalog is Latin Kurmanji; do not substitute it for Arabic-script Kurdish.
    if (base === 'ku' && !parts.includes('latn') && (parts.includes('iq') || parts.includes('ir'))) continue;
    // These catalogs use one script; do not silently substitute a different one.
    if (unsupportedSystemScripts[base ?? '']?.some(script => parts.includes(script))) continue;
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
  document.documentElement.dir = ['ar-SA', 'fa-IR', 'ur-PK', 'he-IL', 'ps-AF'].includes(language) ? 'rtl' : 'ltr';
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
