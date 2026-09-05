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
export type OpenCreatorLanguagePreference = 'system' | 'zh-CN' | 'en-US';
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
