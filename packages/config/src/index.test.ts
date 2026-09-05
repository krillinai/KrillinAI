import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readOpenCreatorConfig,
  migrateDirectoryIfEmpty,
  resolveOpenCreatorPaths,
  resolveUiSettings,
  updateOpenCreatorUiSettings
} from './index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const path of tempDirs.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe('OpenCreator config', () => {
  it('resolves the product-owned directory layout', () => {
    expect(resolveOpenCreatorPaths({ homeDir: '/Users/demo', env: {} })).toMatchObject({
      root: '/Users/demo/.opencreator',
      configFile: '/Users/demo/.opencreator/config.toml',
      dataDir: '/Users/demo/.opencreator/data',
      codexHome: '/Users/demo/.opencreator/runtime/codex',
      creatorCodexHome: '/Users/demo/.opencreator/runtime/creator-codex'
    });
  });

  it('isolates development state below the product directory', () => {
    expect(resolveOpenCreatorPaths({
      homeDir: '/Users/demo',
      env: {},
      runtimeChannel: 'development'
    })).toMatchObject({
      root: '/Users/demo/.opencreator/development',
      configFile: '/Users/demo/.opencreator/development/config.toml',
      dataDir: '/Users/demo/.opencreator/development/data',
      codexHome: '/Users/demo/.opencreator/development/runtime/codex'
    });
  });

  it('keeps an explicit product home authoritative in development', () => {
    expect(resolveOpenCreatorPaths({
      homeDir: '/Users/demo',
      env: { OPENCREATOR_HOME: '/tmp/opencreator-explicit' },
      runtimeChannel: 'development'
    }).root).toBe('/tmp/opencreator-explicit');
  });

  it('archives a Clawee config before writing OpenCreator settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'opencreator-config-'));
    tempDirs.push(root);
    const path = join(root, 'config.toml');
    writeFileSync(path, 'gateway = "https://legacy.example"\nagent_id = "legacy"\n');

    expect(resolveUiSettings(readOpenCreatorConfig(path)).accentColor).toBe('red');
    expect(existsSync(join(root, 'legacy', 'clawee-config.toml'))).toBe(true);
    expect(existsSync(path)).toBe(false);

    updateOpenCreatorUiSettings(path, { colorMode: 'light' });

    const source = readFileSync(path, 'utf8');
    expect(source).toContain('[ui]');
    expect(source).toContain('color_mode = "light"');
    expect(source).not.toContain('agent_id');
  });

  it('copies a legacy directory only when the target is empty', () => {
    const root = mkdtempSync(join(tmpdir(), 'opencreator-config-'));
    tempDirs.push(root);
    const source = join(root, 'legacy');
    const target = join(root, 'next');
    mkdirSync(source);
    writeFileSync(join(source, 'state.json'), '{"ok":true}\n');

    expect(migrateDirectoryIfEmpty(source, target)).toMatchObject({
      migrated: true,
      source,
      target
    });
    expect(readFileSync(join(target, 'state.json'), 'utf8')).toContain('"ok":true');
    expect(migrateDirectoryIfEmpty(source, target)).toEqual({
      migrated: false,
      reason: 'TARGET_EXISTS'
    });
  });
});
