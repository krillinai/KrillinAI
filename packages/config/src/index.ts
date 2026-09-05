import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from '@iarna/toml';
import type {
  OpenCreatorUiSettings,
  UpdateOpenCreatorUiSettingsRequest
} from '@opencreator/protocol';

export type OpenCreatorPaths = {
  root: string;
  configFile: string;
  credentialsFile: string;
  dataDir: string;
  runtimeDir: string;
  codexHome: string;
  creatorCodexHome: string;
  creatorDir: string;
  logsDir: string;
};

export type OpenCreatorRuntimeChannel = 'production' | 'development';

export type OpenCreatorDesktopConfig = {
  closeBehavior: 'hide' | 'quit';
  notificationsEnabled: boolean;
  codexBin?: string;
  successfulCodexBin?: string;
  importedRuntimeSource?: string;
  window?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    maximized?: boolean;
  };
};

export type OpenCreatorRuntimeConfig = {
  codexMode: 'bundled' | 'external';
  externalCodexBin?: string;
};

export type OpenCreatorConfigDocument = {
  version: number;
  ui?: OpenCreatorUiSettings;
  desktop?: OpenCreatorDesktopConfig;
  runtime?: OpenCreatorRuntimeConfig;
  creatorServices?: Record<string, unknown>;
};

export type OpenCreatorConfigSnapshot = {
  document: OpenCreatorConfigDocument;
  configured: {
    ui: boolean;
    desktop: boolean;
    runtime: boolean;
    creatorServices: boolean;
  };
};

export type DirectoryMigrationResult =
  | { migrated: true; source: string; target: string }
  | { migrated: false; reason: 'SOURCE_MISSING' | 'TARGET_EXISTS' };

const defaultUiSettings: OpenCreatorUiSettings = {
  language: 'system',
  colorMode: 'dark',
  accentColor: 'red',
  customAccentColor: '#3b82f6',
  defaultPermission: 'danger-full-access'
};

const defaultDesktopConfig: OpenCreatorDesktopConfig = {
  closeBehavior: 'hide',
  notificationsEnabled: true
};

const defaultRuntimeConfig: OpenCreatorRuntimeConfig = {
  codexMode: 'bundled'
};

export function resolveOpenCreatorPaths(input: {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  runtimeChannel?: OpenCreatorRuntimeChannel;
} = {}): OpenCreatorPaths {
  const env = input.env ?? process.env;
  const productRoot = join(input.homeDir ?? homedir(), '.opencreator');
  const defaultRoot = input.runtimeChannel === 'development'
    ? join(productRoot, 'development')
    : productRoot;
  const root = resolve(env.OPENCREATOR_HOME?.trim() || defaultRoot);
  const runtimeDir = join(root, 'runtime');
  return {
    root,
    configFile: join(root, 'config.toml'),
    credentialsFile: join(root, 'credentials.json'),
    dataDir: join(root, 'data'),
    runtimeDir,
    codexHome: join(runtimeDir, 'codex'),
    creatorCodexHome: join(runtimeDir, 'creator-codex'),
    creatorDir: join(root, 'creator'),
    logsDir: join(root, 'logs')
  };
}

export function migrateDirectoryIfEmpty(
  sourcePath: string,
  targetPath: string
): DirectoryMigrationResult {
  const source = resolve(sourcePath);
  const target = resolve(targetPath);
  if (!existsSync(source)) return { migrated: false, reason: 'SOURCE_MISSING' };
  if (existsSync(target) && readDirectoryHasEntries(target)) {
    return { migrated: false, reason: 'TARGET_EXISTS' };
  }
  assertPortableDirectory(source);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.migration-${process.pid}`;
  rmSync(temporary, { recursive: true, force: true });
  try {
    cpSync(source, temporary, {
      recursive: true,
      errorOnExist: true,
      force: false
    });
    assertPortableDirectory(temporary);
    rmSync(target, { recursive: true, force: true });
    renameSync(temporary, target);
    return { migrated: true, source, target };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function readOpenCreatorConfig(path: string): OpenCreatorConfigSnapshot {
  return withConfigLock(path, () => readOpenCreatorConfigUnlocked(path));
}

export function updateOpenCreatorConfig(
  path: string,
  update: (document: OpenCreatorConfigDocument) => OpenCreatorConfigDocument
): OpenCreatorConfigSnapshot {
  return withConfigLock(path, () => {
    const current = readOpenCreatorConfigUnlocked(path);
    const next = normalizeDocument(update(structuredClone(current.document)));
    writeConfigFile(path, next);
    return snapshot(next);
  });
}

export function updateOpenCreatorUiSettings(
  path: string,
  patch: UpdateOpenCreatorUiSettingsRequest
): OpenCreatorConfigSnapshot {
  return updateOpenCreatorConfig(path, document => ({
    ...document,
    ui: normalizeUiSettings({ ...document.ui, ...patch })
  }));
}

function readOpenCreatorConfigUnlocked(path: string): OpenCreatorConfigSnapshot {
  if (!existsSync(path)) return snapshot({ version: 1 });
  const source = readFileSync(path, 'utf8');
  const parsed = parse(source) as unknown;
  if (!isRecord(parsed)) throw new Error('OPENCREATOR_CONFIG_INVALID');
  if (isLegacyClaweeConfig(parsed)) {
    archiveLegacyClaweeConfig(path);
    return snapshot({ version: 1 });
  }
  return snapshot(normalizeDocument(parsed));
}

function normalizeDocument(value: unknown): OpenCreatorConfigDocument {
  const source = isRecord(value) ? value : {};
  return {
    version: typeof source.version === 'number' && Number.isInteger(source.version)
      ? source.version
      : 1,
    ...(isRecord(source.ui) ? { ui: normalizeUiSettings(source.ui) } : {}),
    ...(isRecord(source.desktop)
      ? { desktop: normalizeDesktopConfig(source.desktop) }
      : {}),
    ...(isRecord(source.runtime)
      ? { runtime: normalizeRuntimeConfig(source.runtime) }
      : {}),
    ...(isRecord(source.creator_services)
      ? { creatorServices: structuredClone(source.creator_services) }
      : isRecord(source.creatorServices)
        ? { creatorServices: structuredClone(source.creatorServices) }
        : {})
  };
}

function snapshot(document: OpenCreatorConfigDocument): OpenCreatorConfigSnapshot {
  return {
    document: {
      version: document.version,
      ...(document.ui === undefined
        ? {}
        : { ui: normalizeUiSettings(document.ui) }),
      ...(document.desktop === undefined
        ? {}
        : { desktop: normalizeDesktopConfig(document.desktop) }),
      ...(document.runtime === undefined
        ? {}
        : { runtime: normalizeRuntimeConfig(document.runtime) }),
      ...(document.creatorServices === undefined
        ? {}
        : { creatorServices: structuredClone(document.creatorServices) })
    },
    configured: {
      ui: document.ui !== undefined,
      desktop: document.desktop !== undefined,
      runtime: document.runtime !== undefined,
      creatorServices: document.creatorServices !== undefined
    }
  };
}

export function resolveUiSettings(snapshot: OpenCreatorConfigSnapshot): OpenCreatorUiSettings {
  return normalizeUiSettings(snapshot.document.ui ?? defaultUiSettings);
}

export function resolveDesktopConfig(
  snapshot: OpenCreatorConfigSnapshot
): OpenCreatorDesktopConfig {
  return normalizeDesktopConfig(snapshot.document.desktop ?? defaultDesktopConfig);
}

export function resolveRuntimeConfig(
  snapshot: OpenCreatorConfigSnapshot
): OpenCreatorRuntimeConfig {
  return normalizeRuntimeConfig(snapshot.document.runtime ?? defaultRuntimeConfig);
}

function normalizeUiSettings(value: unknown): OpenCreatorUiSettings {
  const source = isRecord(value) ? value : {};
  const customAccentSource = source.customAccentColor ?? source.custom_accent_color;
  const customAccentColor = typeof customAccentSource === 'string'
    && /^#[\da-f]{6}$/i.test(customAccentSource)
    ? customAccentSource.toLowerCase()
    : defaultUiSettings.customAccentColor;
  const colorMode = source.colorMode ?? source.color_mode;
  const accentColor = source.accentColor ?? source.accent_color;
  const defaultPermission = source.defaultPermission ?? source.default_permission;
  return {
    language: source.language === 'zh-CN' || source.language === 'en-US'
      ? source.language
      : 'system',
    colorMode: colorMode === 'light' ? 'light' : 'dark',
    accentColor:
      accentColor === 'neutral'
      || accentColor === 'blue'
      || accentColor === 'cyan'
      || accentColor === 'purple'
      || accentColor === 'orange'
      || accentColor === 'custom'
        ? accentColor
        : 'red',
    customAccentColor,
    defaultPermission:
      defaultPermission === 'follow-project'
      || defaultPermission === 'follow-global'
      || defaultPermission === 'workspace-write'
        ? defaultPermission
        : 'danger-full-access'
  };
}

function normalizeDesktopConfig(value: unknown): OpenCreatorDesktopConfig {
  const source = isRecord(value) ? value : {};
  const window = isRecord(source.window)
    && typeof source.window.width === 'number'
    && Number.isFinite(source.window.width)
    && typeof source.window.height === 'number'
    && Number.isFinite(source.window.height)
    ? {
        width: source.window.width,
        height: source.window.height,
        ...(typeof source.window.x === 'number' && Number.isFinite(source.window.x)
          ? { x: source.window.x }
          : {}),
        ...(typeof source.window.y === 'number' && Number.isFinite(source.window.y)
          ? { y: source.window.y }
          : {}),
        ...(source.window.maximized === true ? { maximized: true } : {})
      }
    : undefined;
  return {
    closeBehavior: (source.closeBehavior ?? source.close_behavior) === 'quit' ? 'quit' : 'hide',
    notificationsEnabled: (source.notificationsEnabled ?? source.notifications_enabled) !== false,
    ...(nonEmptyString(source.codexBin ?? source.codex_bin) === undefined
      ? {}
      : { codexBin: nonEmptyString(source.codexBin ?? source.codex_bin) }),
    ...(nonEmptyString(source.successfulCodexBin ?? source.successful_codex_bin) === undefined
      ? {}
      : {
          successfulCodexBin: nonEmptyString(
            source.successfulCodexBin ?? source.successful_codex_bin
          )
        }),
    ...(nonEmptyString(source.importedRuntimeSource ?? source.imported_runtime_source) === undefined
      ? {}
      : {
          importedRuntimeSource: nonEmptyString(
            source.importedRuntimeSource ?? source.imported_runtime_source
          )
        }),
    ...(window === undefined ? {} : { window })
  };
}

function normalizeRuntimeConfig(value: unknown): OpenCreatorRuntimeConfig {
  const source = isRecord(value) ? value : {};
  const externalCodexSource = source.externalCodexBin ?? source.external_codex_bin;
  const externalCodexBin = typeof externalCodexSource === 'string'
    && externalCodexSource.trim().length > 0
    ? externalCodexSource
    : undefined;
  return {
    codexMode: (source.codexMode ?? source.codex_mode) === 'external'
      ? 'external'
      : 'bundled',
    ...(externalCodexBin === undefined ? {} : { externalCodexBin })
  };
}

function writeConfigFile(path: string, document: OpenCreatorConfigDocument): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') chmodSync(dirname(path), 0o700);
  const serializable = {
    version: document.version,
    ...(document.ui === undefined ? {} : { ui: serializeUi(document.ui) }),
    ...(document.desktop === undefined
      ? {}
      : { desktop: serializeDesktop(document.desktop) }),
    ...(document.runtime === undefined
      ? {}
      : { runtime: serializeRuntime(document.runtime) }),
    ...(document.creatorServices === undefined
      ? {}
      : { creator_services: document.creatorServices })
  };
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, stringify(serializable as any), { mode: 0o600 });
  renameSync(temporary, path);
}

function serializeUi(value: OpenCreatorUiSettings): Record<string, unknown> {
  return {
    language: value.language,
    color_mode: value.colorMode,
    accent_color: value.accentColor,
    custom_accent_color: value.customAccentColor,
    default_permission: value.defaultPermission
  };
}

function serializeDesktop(value: OpenCreatorDesktopConfig): Record<string, unknown> {
  return {
    close_behavior: value.closeBehavior,
    notifications_enabled: value.notificationsEnabled,
    ...(value.codexBin === undefined ? {} : { codex_bin: value.codexBin }),
    ...(value.successfulCodexBin === undefined
      ? {}
      : { successful_codex_bin: value.successfulCodexBin }),
    ...(value.importedRuntimeSource === undefined
      ? {}
      : { imported_runtime_source: value.importedRuntimeSource }),
    ...(value.window === undefined ? {} : { window: value.window })
  };
}

function serializeRuntime(value: OpenCreatorRuntimeConfig): Record<string, unknown> {
  return {
    codex_mode: value.codexMode,
    ...(value.externalCodexBin === undefined
      ? {}
      : { external_codex_bin: value.externalCodexBin })
  };
}

function readDirectoryHasEntries(path: string): boolean {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return true;
  return readFileSystemEntries(path).length > 0;
}

function assertPortableDirectory(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`OPENCREATOR_MIGRATION_SOURCE_INVALID: ${path}`);
  }
  for (const entry of readFileSystemEntries(path)) {
    const child = join(path, entry);
    const childStat = lstatSync(child);
    if (childStat.isSymbolicLink()) {
      throw new Error(`OPENCREATOR_MIGRATION_SYMLINK_REJECTED: ${child}`);
    }
    if (childStat.isDirectory()) assertPortableDirectory(child);
  }
}

function readFileSystemEntries(path: string): string[] {
  return readdirSync(path);
}

function archiveLegacyClaweeConfig(path: string): void {
  const legacyDir = join(dirname(path), 'legacy');
  mkdirSync(legacyDir, { recursive: true, mode: 0o700 });
  let destination = join(legacyDir, 'clawee-config.toml');
  let suffix = 2;
  while (existsSync(destination)) {
    destination = join(legacyDir, `clawee-config-${suffix}.toml`);
    suffix += 1;
  }
  renameSync(path, destination);
}

function isLegacyClaweeConfig(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length > 0
    && keys.every(key => key === 'gateway' || key === 'agent_id')
    && (typeof value.gateway === 'string' || typeof value.agent_id === 'string');
}

function withConfigLock<Result>(path: string, action: () => Result): Result {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') chmodSync(dirname(path), 0o700);
  const lockPath = `${path}.lock`;
  let descriptor: number | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      descriptor = openSync(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if (!isFileExists(error)) throw error;
      if (isStaleLock(lockPath)) {
        rmSync(lockPath, { force: true });
        continue;
      }
      sleep(10);
    }
  }
  if (descriptor === undefined) throw new Error('OPENCREATOR_CONFIG_LOCKED');
  try {
    return action();
  } finally {
    closeSync(descriptor);
    rmSync(lockPath, { force: true });
  }
}

function isStaleLock(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > 30_000;
  } catch {
    return false;
  }
}

function sleep(milliseconds: number): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

function isFileExists(error: unknown): boolean {
  return isRecord(error) && error.code === 'EEXIST';
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
