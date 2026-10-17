import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as fontkit from 'fontkit';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../../assets/creator-subtitle-fonts');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const entries = [...manifest.fonts, ...(manifest.fallbackFonts ?? [])];

describe('packaged multilingual subtitle fonts', () => {
  it('preserves nine presets and validates fallback coverage, shaping, hashes and licenses', () => {
    expect(manifest.version).toBe(2);
    expect(manifest.fonts).toHaveLength(9);
    expect(manifest.fallbackFonts).toHaveLength(23);
    for (const entry of entries) {
      for (const kind of ['desktop', 'web']) {
        const path = resolve(root, entry[`${kind}File`]);
        expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(entry[`${kind}Sha256`]);
        const font = fontkit.openSync(path);
        expect(font.familyName).toBe(entry.family);
        expect(font.fullName).toBe(entry.fullName);
        expect(font['OS/2'].usWeightClass).toBe(entry.weightValue);
        if (entry.scripts) {
          for (const character of entry.sample) if (character.trim()) expect(font.hasGlyphForCodePoint(character.codePointAt(0)), `${entry.family}: ${character}`).toBe(true);
          if (!entry.scripts.includes('Hang')) { expect(font.GSUB).toBeTruthy(); expect(font.GPOS).toBeTruthy(); }
        }
      }
      expect(manifest.licenses.some(item => item.file === entry.license)).toBe(true);
    }
    for (const license of manifest.licenses) {
      expect(createHash('sha256').update(readFileSync(resolve(root, license.file))).digest('hex')).toBe(license.sha256);
    }
  });
  it('covers the native names of every selectable source with bundled resources', () => {
    const languages = JSON.parse(readFileSync(resolve(root, '../creator-languages/catalog.json'), 'utf8')).languages;
    const fonts = entries.map(entry => fontkit.openSync(resolve(root, entry.desktopFile)));
    for (const language of languages.filter(item => item.speech)) {
      for (const character of language.nativeName) if (character.trim()) expect(fonts.some(font => font.hasGlyphForCodePoint(character.codePointAt(0))), `${language.code}: ${character}`).toBe(true);
    }
  });
});
