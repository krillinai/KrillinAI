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
  consolidateLegacyConfigData,
  migrateLegacyDaemonProductData
} from '../../src/config/product-data-migration.js';

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('Daemon legacy product data migration', () => {
  it('moves legacy runtime data out of data after an atomic copy succeeds', () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-daemon-product-migration-'));
    const dataDir = join(root, 'data');
    const runtimeDir = join(root, 'runtime');
    const creatorDir = join(root, 'creator');
    const fixtures = [
      join(dataDir, 'creator-runtime', 'codex-home', 'auth.json'),
      join(dataDir, 'creator-runtime', 'yt-dlp', 'state.json'),
      join(
        dataDir,
        'creator-runtime',
        'dependencies',
        'krillinai',
        'manifest.json'
      ),
      join(dataDir, 'creator', 'jobs', 'job-1', 'job.json')
    ];
    for (const path of fixtures) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `${path}\n`);
    }

    const result = migrateLegacyDaemonProductData({
      dataDir,
      runtimeDir,
      creatorDir
    });

    expect(result.every(item => item.result.migrated && item.legacyRemoved)).toBe(true);
    expect(readFileSync(join(runtimeDir, 'creator-codex', 'auth.json'), 'utf8'))
      .toContain('creator-runtime/codex-home/auth.json');
    expect(readFileSync(join(runtimeDir, 'yt-dlp', 'state.json'), 'utf8'))
      .toContain('creator-runtime/yt-dlp/state.json');
    expect(readFileSync(join(creatorDir, 'jobs', 'job-1', 'job.json'), 'utf8'))
      .toContain('creator/jobs/job-1/job.json');
    expect(existsSync(join(dataDir, 'creator-runtime'))).toBe(false);
    expect(existsSync(join(dataDir, 'creator'))).toBe(false);
  });

  it('keeps a legacy source when an existing target prevents migration', () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-daemon-product-migration-'));
    const dataDir = join(root, 'data');
    const runtimeDir = join(root, 'runtime');
    const source = join(dataDir, 'creator-runtime', 'yt-dlp', 'state.json');
    const target = join(runtimeDir, 'yt-dlp', 'state.json');
    mkdirSync(join(source, '..'), { recursive: true });
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(source, 'legacy\n');
    writeFileSync(target, 'current\n');

    const result = migrateLegacyDaemonProductData({
      dataDir,
      runtimeDir,
      creatorDir: join(root, 'creator')
    });

    expect(result.find(item => item.name === 'yt-dlp')).toMatchObject({
      result: { migrated: false, reason: 'TARGET_EXISTS' },
      legacyRemoved: false
    });
    expect(readFileSync(source, 'utf8')).toBe('legacy\n');
    expect(readFileSync(target, 'utf8')).toBe('current\n');
  });

  it('moves distinct Clawee archives to the product legacy directory', () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-daemon-product-migration-'));
    const appHome = join(root, '.opencreator');
    const dataDir = join(appHome, 'data');
    const rootLegacy = join(appHome, 'legacy', 'clawee-config.toml');
    const dataLegacy = join(dataDir, 'legacy', 'clawee-config.toml');
    mkdirSync(join(rootLegacy, '..'), { recursive: true });
    mkdirSync(join(dataLegacy, '..'), { recursive: true });
    mkdirSync(join(dataDir, 'config'), { recursive: true });
    writeFileSync(rootLegacy, 'gateway = "root"\n');
    writeFileSync(dataLegacy, 'gateway = "data"\n');

    consolidateLegacyConfigData({ dataDir, appHome });

    expect(readFileSync(rootLegacy, 'utf8')).toBe('gateway = "root"\n');
    expect(readFileSync(
      join(appHome, 'legacy', 'clawee-config-2.toml'),
      'utf8'
    )).toBe('gateway = "data"\n');
    expect(existsSync(join(dataDir, 'legacy'))).toBe(false);
    expect(existsSync(join(dataDir, 'config'))).toBe(false);
  });
});
