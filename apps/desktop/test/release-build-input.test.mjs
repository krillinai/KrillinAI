import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changedPaths,
  changesAreReleaseOnly,
  digestBuildEntries,
  isReleaseOnlyPath,
  parseTreeEntries
} from '../scripts/release-build-input.mjs';

const appEntry = {
  mode: '100644',
  type: 'blob',
  object: '1111111111111111111111111111111111111111',
  path: 'apps/web/src/App.tsx'
};
const releaseEntry = {
  mode: '100644',
  type: 'blob',
  object: '2222222222222222222222222222222222222222',
  path: '.github/workflows/desktop-release.yml'
};

describe('release build input identity', () => {
  it('classifies only explicit release infrastructure as release-only', () => {
    expect(isReleaseOnlyPath(releaseEntry.path)).toBe(true);
    expect(isReleaseOnlyPath('apps/desktop/release-notes/v3.2.2.md')).toBe(true);
    expect(isReleaseOnlyPath(appEntry.path)).toBe(false);
    expect(changesAreReleaseOnly([releaseEntry.path])).toBe(true);
    expect(changesAreReleaseOnly([releaseEntry.path, appEntry.path])).toBe(false);
    expect(changesAreReleaseOnly([])).toBe(false);
    expect(changesAreReleaseOnly(null)).toBe(false);
  });

  it('keeps release-only changes out of the digest and includes product changes', () => {
    const initial = digestBuildEntries([appEntry, releaseEntry]);
    const changedRelease = digestBuildEntries([
      appEntry,
      { ...releaseEntry, object: '3333333333333333333333333333333333333333' }
    ]);
    const changedApp = digestBuildEntries([
      { ...appEntry, object: '4444444444444444444444444444444444444444' },
      releaseEntry
    ]);
    expect(changedRelease).toBe(initial);
    expect(changedApp).not.toBe(initial);
  });

  it('parses null-delimited git tree records', () => {
    expect(parseTreeEntries(
      '100644 blob 1111111111111111111111111111111111111111\tapps/web/src/App.tsx\0'
    )).toEqual([appEntry]);
  });

  it('runs full checks when the successful baseline is missing or no longer an ancestor', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'opencreator-ci-baseline-'));
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const commit = message => git('-c', 'user.name=Release Test', '-c', 'user.email=release@example.test', 'commit', '--allow-empty', '-m', message);
    try {
      git('init', '-q');
      commit('Initial baseline');
      const initial = git('rev-parse', 'HEAD');
      mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
      writeFileSync(join(cwd, '.github', 'workflows', 'ci.yml'), 'name: CI\n');
      git('add', '.');
      commit('Update release infrastructure');
      const releaseHead = git('rev-parse', 'HEAD');
      expect(changedPaths(initial, releaseHead, cwd)).toEqual(['.github/workflows/ci.yml']);
      expect(changesAreReleaseOnly(changedPaths(initial, releaseHead, cwd))).toBe(true);
      expect(changedPaths('9'.repeat(40), releaseHead, cwd)).toBeNull();
      expect(changesAreReleaseOnly(changedPaths('9'.repeat(40), releaseHead, cwd))).toBe(false);
      git('checkout', '-q', '-b', 'alternate', initial);
      commit('Diverged history');
      expect(changedPaths(releaseHead, 'HEAD', cwd)).toBeNull();
      expect(changesAreReleaseOnly(changedPaths(releaseHead, 'HEAD', cwd))).toBe(false);
      expect(() => changedPaths(initial, 'missing-head', cwd)).toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
