import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyEnglishReleaseNotes } from '../scripts/verify-release-notes.mjs';

describe('English release notes verification', () => {
  it('accepts English updates with Unicode punctuation and product names', () => {
    expect(() => verifyEnglishReleaseNotes('## What’s New\n\n- Improved OpenCreator’s SRT translation — including bilingual subtitles.')).not.toThrow();
  });

  it.each([
    '',
    ' \n ',
    '# OpenCreator v3.2.7',
    '## 更新内容\n\n- Improved video downloads.',
    '## What\'s New\n\n- Improved 视频 downloads.',
    '## What\'s New\n\n- Added support for \u{20000}.'
  ])('rejects empty, incomplete, or Chinese release materials: %j', notes => {
    expect(() => verifyEnglishReleaseNotes(notes, 'Published Release')).toThrow(/Published Release.*English/);
  });

  it('checks every supplied file and exits unsuccessfully on missing or Chinese notes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'opencreator-check-notes-'));
    try {
      const english = join(directory, 'english.md');
      const chinese = join(directory, 'chinese.md');
      const missing = join(directory, 'missing.md');
      writeFileSync(english, '## What\'s New\n\n- Improved video downloads.');
      writeFileSync(chinese, '## 更新内容\n\n- Improved video downloads.');
      const run = paths => spawnSync(process.execPath, [resolve(process.cwd(), 'scripts/verify-release-notes.mjs'), ...paths], { encoding: 'utf8' });
      expect(run([english]).status).toBe(0);
      expect(run([english, chinese]).status).toBe(1);
      expect(run([english, missing]).status).toBe(1);
      expect(run([]).status).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
