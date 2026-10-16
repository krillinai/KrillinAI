import { describe, expect, it } from 'vitest';
import { additionalLanguageCatalogs, translateEnglishCopy } from './translated-copy.js';
import type { AppLanguage } from './language.js';

describe('additional language catalogs', () => {
  it('covers subtitle translation and download messages in every additional language', () => {
    expect(Object.keys(additionalLanguageCatalogs)).toHaveLength(7);
    const messages = [
      'Add an SRT file to translate first', 'Add source', 'Add subtitles', 'Automatic captions',
      'Bilingual SRT', 'Manual subtitles', 'Remove subtitles', 'Replace file', 'Save subtitles',
      'Source type', 'Subtitle Translation', 'Subtitles were saved; the project remains V{{0}}.',
      'Translate subtitles', 'Translate video', 'Translated SRT', 'Waiting for subtitles'
    ];
    for (const [language, catalog] of Object.entries(additionalLanguageCatalogs)) {
      for (const message of messages) {
        expect(Object.hasOwn(catalog!, message), `${language}: ${message}`).toBe(true);
        expect(translateEnglishCopy(language as AppLanguage, message)).not.toBe(message);
      }
      expect(translateEnglishCopy(language as AppLanguage, 'Subtitles were saved; the project remains V12.'))
        .toBe(catalog!['Subtitles were saved; the project remains V{{0}}.']!.replace('{{0}}', '12'));
    }
  });

  it.each([
    ['ja-JP', '取得'], ['ko-KR', '가져오기'], ['es-ES', 'Obtener'],
    ['fr-FR', 'Récupérer'], ['de-DE', 'Abrufen'], ['pt-BR', 'Obter']
  ] as const)('translates primary actions in %s', (language, expected) => {
    expect(translateEnglishCopy(language, 'Fetch')).toBe(expected);
    expect(translateEnglishCopy(language, 'Some unknown UI text')).toBe('Some unknown UI text');
    expect(translateEnglishCopy(language, 'toString')).toBe('toString');
  });

  it('preserves all interpolation tokens and covers the same messages in every locale', () => {
    const keys = Object.keys(additionalLanguageCatalogs['ja-JP']!).sort();
    for (const catalog of Object.values(additionalLanguageCatalogs)) {
      expect(Object.keys(catalog!).sort()).toEqual(keys);
      for (const [source, translation] of Object.entries(catalog!)) {
        expect(translation.trim(), source).not.toBe('');
        expect((translation.match(/\{\{[^}]+\}\}/g) ?? []).sort(), source)
          .toEqual((source.match(/\{\{[^}]+\}\}/g) ?? []).sort());
      }
    }
  });

  it('preserves literal values and chooses the specific template', () => {
    for (const language of Object.keys(additionalLanguageCatalogs) as AppLanguage[]) {
      const catalog = additionalLanguageCatalogs[language]!;
      const name = 'Report $& [v2] {{secret}}';
      expect(translateEnglishCopy(language, `Download ${name} document`))
        .toBe(catalog['Download {{0}} document']!.replace('{{0}}', () => name));
      expect(translateEnglishCopy(language, 'Ready · Pinterest · 12 options'))
        .toBe(catalog['Ready · {{0}} · {{1}} options']!.replace('{{0}}', 'Pinterest').replace('{{1}}', '12'));
    }
  });
});
