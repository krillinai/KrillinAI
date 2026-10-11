import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { treeSize } from '../scripts/package-directory-size.mjs';

const directories = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'opencreator-package-size-'));
  directories.push(path);
  return path;
}

describe('packaged directory size', () => {
  it('counts every file in nested directories', () => {
    const root = fixture();
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'bin', 'node'), Buffer.alloc(1024));
    writeFileSync(join(root, 'manifest.json'), Buffer.alloc(128));
    expect(treeSize(root)).toBe(1152);
  });

  it.skipIf(process.platform === 'win32')('counts Python aliases as links without duplicating interpreter bytes', () => {
    const root = fixture();
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'python3.13'), Buffer.alloc(1024 * 1024));
    const python = join(bin, 'python');
    const python3 = join(bin, 'python3');
    const directoryAlias = join(root, 'bin-alias');
    symlinkSync('python3.13', python);
    symlinkSync('python3.13', python3);
    symlinkSync('bin', directoryAlias);
    expect(treeSize(root)).toBe(1024 * 1024
      + lstatSync(python).size + lstatSync(python3).size + lstatSync(directoryAlias).size);
  });

  it.skipIf(process.platform === 'win32')('rejects a broken link instead of undercounting it', () => {
    const root = fixture();
    symlinkSync('missing', join(root, 'python'));
    expect(() => treeSize(root)).toThrow('broken symbolic link');
  });
});
