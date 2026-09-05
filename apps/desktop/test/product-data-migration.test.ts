import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveOpenCreatorPaths } from '@opencreator/config';
import { migrateProductData } from '../src/main/product-data-migration.js';

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

describe('OpenCreator product data migration', () => {
  it('moves the legacy Desktop Codex HOME under .opencreator', () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-product-migration-'));
    const electronUserData = join(root, 'Library', 'OpenCreator');
    const paths = resolveOpenCreatorPaths({
      homeDir: join(root, 'home'),
      env: {}
    });
    const config = join(
      electronUserData,
      'runtime',
      'codex',
      'home',
      'config.toml'
    );
    mkdirSync(join(config, '..'), { recursive: true });
    writeFileSync(config, `${config}\n`);

    const result = migrateProductData({
      paths,
      legacyElectronUserData: electronUserData
    });

    expect(result.every(item => item.result.migrated)).toBe(true);
    expect(readFileSync(join(paths.codexHome, 'config.toml'), 'utf8')).toContain(
      'runtime/codex/home/config.toml'
    );
  });
});
