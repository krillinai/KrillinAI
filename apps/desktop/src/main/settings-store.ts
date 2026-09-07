import {
  readOpenCreatorConfig,
  resolveDesktopConfig,
  resolveRuntimeConfig,
  updateOpenCreatorConfig,
  type OpenCreatorConfigDocument,
  type OpenCreatorConfigSnapshot
} from '@opencreator/config';
import type { DesktopSettings } from '../shared/types.js';

const defaultSettings: DesktopSettings = {
  closeBehavior: 'hide',
  notificationsEnabled: true
};

export type SettingsStore = {
  read(): DesktopSettings;
  update(patch: Partial<DesktopSettings>): DesktopSettings;
  flush(): void;
};

export type SettingsPersistence = {
  read(path: string): OpenCreatorConfigSnapshot;
  update(
    path: string,
    update: (document: OpenCreatorConfigDocument) => OpenCreatorConfigDocument
  ): OpenCreatorConfigSnapshot;
};

export function createSettingsStore(
  path: string,
  persistence: SettingsPersistence = fileSettingsPersistence
): SettingsStore {
  let current = readSettings(path, persistence);
  return {
    read() {
      return structuredClone(current);
    },
    update(patch) {
      current = normalizeSettings({ ...current, ...patch });
      persistence.update(path, document => ({
        ...document,
        desktop: {
          closeBehavior: current.closeBehavior,
          notificationsEnabled: current.notificationsEnabled,
          ...(current.codexBin === undefined ? {} : { codexBin: current.codexBin }),
          ...(current.successfulCodexBin === undefined
            ? {}
            : { successfulCodexBin: current.successfulCodexBin }),
          ...(current.window === undefined ? {} : { window: current.window })
        },
        runtime: {
          codexMode: current.codexRuntimeMode ?? 'bundled',
          ...(current.externalCodexBin === undefined
            ? {}
            : { externalCodexBin: current.externalCodexBin })
        }
      }));
      return structuredClone(current);
    },
    flush() {}
  };
}

function readSettings(
  path: string,
  persistence: SettingsPersistence
): DesktopSettings {
  try {
    const snapshot = persistence.read(path);
    if (!snapshot.configured.desktop && !snapshot.configured.runtime) {
      persistence.update(path, document => ({
        ...document,
        desktop: {
          closeBehavior: defaultSettings.closeBehavior,
          notificationsEnabled: defaultSettings.notificationsEnabled
        },
        runtime: {
          codexMode: 'bundled'
        }
      }));
      return structuredClone(defaultSettings);
    }
    return normalizeSettings({
      ...resolveDesktopConfig(snapshot),
      codexRuntimeMode: resolveRuntimeConfig(snapshot).codexMode,
      externalCodexBin: resolveRuntimeConfig(snapshot).externalCodexBin
    });
  } catch {
    return structuredClone(defaultSettings);
  }
}

function normalizeSettings(value: unknown): DesktopSettings {
  if (!isRecord(value)) return structuredClone(defaultSettings);
  const closeBehavior = value.closeBehavior === 'quit' ? 'quit' : 'hide';
  const settings: DesktopSettings = {
    closeBehavior,
    notificationsEnabled: value.notificationsEnabled !== false
  };
  if (typeof value.codexBin === 'string' && value.codexBin.length > 0) {
    settings.codexBin = value.codexBin;
  }
  if (typeof value.successfulCodexBin === 'string' && value.successfulCodexBin.length > 0) {
    settings.successfulCodexBin = value.successfulCodexBin;
  }
  settings.codexRuntimeMode = value.codexRuntimeMode === 'external' ? 'external' : 'bundled';
  if (typeof value.externalCodexBin === 'string' && value.externalCodexBin.length > 0) {
    settings.externalCodexBin = value.externalCodexBin;
  }
  if (isRecord(value.window)) {
    const width = numberValue(value.window.width, 1280);
    const height = numberValue(value.window.height, 820);
    settings.window = {
      width,
      height,
      ...(numberOrUndefined(value.window.x) === undefined ? {} : { x: numberOrUndefined(value.window.x) }),
      ...(numberOrUndefined(value.window.y) === undefined ? {} : { y: numberOrUndefined(value.window.y) }),
      ...(value.window.maximized === true ? { maximized: true } : {})
    };
  }
  return settings;
}

const fileSettingsPersistence: SettingsPersistence = {
  read: readOpenCreatorConfig,
  update: updateOpenCreatorConfig
};

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
