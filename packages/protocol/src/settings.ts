export const openCreatorAccentColors = [
  'neutral',
  'blue',
  'cyan',
  'purple',
  'orange',
  'red',
  'custom'
] as const;

export type OpenCreatorAccentColor = typeof openCreatorAccentColors[number];
export const openCreatorLanguages = ['zh-CN', 'zh-TW', 'en-US', 'sv-SE', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT', 'ru-RU', 'tr-TR', 'id-ID', 'vi-VN', 'hi-IN', 'th-TH', 'fil-PH', 'bn-BD', 'pl-PL', 'uk-UA', 'nl-NL', 'ms-MY', 'da-DK', 'nb-NO', 'fi-FI', 'cs-CZ', 'ro-RO', 'hu-HU', 'el-GR', 'ta-IN', 'te-IN', 'bg-BG', 'sk-SK', 'hr-HR', 'sr-RS', 'ar-SA', 'fa-IR', 'ur-PK', 'he-IL', 'mr-IN', 'gu-IN', 'pa-IN', 'uz-UZ', 'kk-KZ', 'az-AZ', 'km-KH', 'my-MM', 'ne-NP', 'si-LK', 'sw-KE', 'lt-LT', 'lv-LV', 'et-EE', 'sl-SI', 'ka-GE', 'hy-AM', 'mn-MN', 'lo-LA', 'am-ET', 'ha-NG', 'yo-NG', 'ig-NG', 'zu-ZA', 'af-ZA', 'so-SO', 'rw-RW', 'mg-MG', 'kn-IN', 'ml-IN', 'or-IN', 'as-IN', 'sq-AL', 'ca-ES', 'eu-ES', 'gl-ES', 'is-IS', 'bs-BA', 'mk-MK', 'be-BY', 'ky-KG', 'tg-TJ', 'tk-TM', 'ps-AF', 'ku-TR'] as const;
export type OpenCreatorLanguage = typeof openCreatorLanguages[number];
export const openCreatorLanguagePreferences = ['system', ...openCreatorLanguages] as const;
export type OpenCreatorLanguagePreference = typeof openCreatorLanguagePreferences[number];
export type OpenCreatorColorMode = 'light' | 'dark';
export type OpenCreatorDefaultPermission =
  | 'follow-project'
  | 'follow-global'
  | 'workspace-write'
  | 'danger-full-access';

export type OpenCreatorUiSettings = {
  language: OpenCreatorLanguagePreference;
  colorMode: OpenCreatorColorMode;
  accentColor: OpenCreatorAccentColor;
  customAccentColor: string;
  defaultPermission: OpenCreatorDefaultPermission;
};

export type OpenCreatorUiSettingsResponse = {
  settings: OpenCreatorUiSettings;
  configured: boolean;
};

export type UpdateOpenCreatorUiSettingsRequest = Partial<OpenCreatorUiSettings>;

export type OpenCreatorStorageSettings = {
  defaultProjectRoot: string;
  outputRoot: string;
};

export type OpenCreatorStorageSettingsResponse = {
  settings: OpenCreatorStorageSettings;
  configured: boolean;
};

export type UpdateOpenCreatorStorageSettingsRequest = Partial<OpenCreatorStorageSettings>;
