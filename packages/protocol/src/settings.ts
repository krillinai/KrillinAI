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
export const openCreatorLanguages = ['zh-CN', 'en-US', 'sv-SE', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR'] as const;
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
