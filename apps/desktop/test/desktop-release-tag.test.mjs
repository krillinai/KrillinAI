import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDesktopReleaseTag } from '../scripts/verify-desktop-release-tag.mjs';

describe('Desktop release tag', () => {
  it('accepts a tag matching the Desktop package version', () => {
    expect(verifyDesktopReleaseTag('v1.2.3', '1.2.3')).toEqual({
      skipped: false,
      packageVersion: '1.2.3',
      tag: 'v1.2.3'
    });
  });

  it('rejects malformed and mismatched tags', () => {
    expect(() => verifyDesktopReleaseTag('desktop-v1.2.3', '1.2.3')).toThrow(
      /v<version>/
    );
    expect(() => verifyDesktopReleaseTag('v1.2.4', '1.2.3')).toThrow(
      /does not match/
    );
  });

  it('allows manual workflow runs without a tag', () => {
    expect(verifyDesktopReleaseTag('', '1.2.3')).toEqual({
      skipped: true,
      packageVersion: '1.2.3'
    });
  });

  it('blocks a matching tag when its source notes are missing or not entirely English', () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'opencreator-tag-notes-')));
    try {
      mkdirSync(join(directory, 'scripts'));
      mkdirSync(join(directory, 'release-notes'));
      writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: '1.2.3' }));
      for (const script of ['verify-desktop-release-tag.mjs', 'verify-release-notes.mjs']) {
        copyFileSync(new URL(`../scripts/${script}`, import.meta.url), join(directory, 'scripts', script));
      }
      const run = () => spawnSync(process.execPath, [join(directory, 'scripts/verify-desktop-release-tag.mjs'), 'v1.2.3'], { encoding: 'utf8' });
      expect(run().status).toBe(1);
      for (const notes of ['', '## 更新内容\n\n- Improved downloads.', '## What\'s New\n\n- Improved 下载.']) {
        writeFileSync(join(directory, 'release-notes/v1.2.3.md'), notes);
        const result = run();
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/English/);
      }
      writeFileSync(join(directory, 'release-notes/v1.2.3.md'), '## What\'s New\n\n- Improved downloads.');
      const result = run();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, tag: 'v1.2.3' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
