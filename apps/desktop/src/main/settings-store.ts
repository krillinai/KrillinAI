import {
  readFileSync
} from 'node:fs';
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
  readLegacy(path: string): string;
};

export function createSettingsStore(
  path: string,
  persistence: SettingsPersistence = fileSettingsPersistence,
  legacyPath?: string
): SettingsStore {
  let current = readSettings(path, persistence, legacyPath);
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
          ...(current.importedRuntimeSource === undefined
            ? {}
            : { importedRuntimeSource: current.importedRuntimeSource }),
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
  persistence: SettingsPersistence,
  legacyPath?: string
): DesktopSettings {
  try {
    const snapshot = persistence.read(path);
    if (!snapshot.configured.desktop && !snapshot.configured.runtime) {
      let legacy = structuredClone(defaultSettings);
      if (legacyPath !== undefined) {
        try {
          legacy = normalizeSettings(JSON.parse(persistence.readLegacy(legacyPath)) as unknown);
        } catch {
          // Persist current OpenCreator defaults when there is no legacy Desktop file.
        }
      }
      persistence.update(path, document => ({
        ...document,
        desktop: {
          closeBehavior: legacy.closeBehavior,
          notificationsEnabled: legacy.notificationsEnabled,
          ...(legacy.codexBin === undefined ? {} : { codexBin: legacy.codexBin }),
          ...(legacy.successfulCodexBin === undefined
            ? {}
            : { successfulCodexBin: legacy.successfulCodexBin }),
          ...(legacy.importedRuntimeSource === undefined
            ? {}
            : { importedRuntimeSource: legacy.importedRuntimeSource }),
          ...(legacy.window === undefined ? {} : { window: legacy.window })
        },
        runtime: {
          codexMode: legacy.codexRuntimeMode ?? 'bundled',
          ...(legacy.externalCodexBin === undefined
            ? {}
            : { externalCodexBin: legacy.externalCodexBin })
        }
      }));
      return legacy;
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
  if (typeof value.importedRuntimeSource === 'string' && value.importedRuntimeSource.length > 0) {
    settings.importedRuntimeSource = value.importedRuntimeSource;
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
  update: updateOpenCreatorConfig,
  readLegacy: path => readFileSync(path, 'utf8')
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
