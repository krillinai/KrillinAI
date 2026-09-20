import { describe, expect, it } from 'vitest';
import {
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
});
