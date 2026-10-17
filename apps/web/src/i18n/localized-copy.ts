import type { AppLanguage } from './language.js';
import { swedishInlineCopy } from './swedish-inline-copy.js';
import { translateEnglishCopy, translateTraditionalChinese } from './translated-copy.js';

export type LocalizeCopy = (chinese: string, english: string, swedish?: string) => string;

export function createLocalizedCopy(language: AppLanguage): LocalizeCopy {
  return (chinese, english, swedish) => {
    if (language === 'zh-CN') return chinese;
    // Simplified Chinese is closer to a Traditional reader than English when the catalog misses.
    if (language === 'zh-TW') return translateTraditionalChinese(english) ?? chinese;
    if (language === 'sv-SE') return swedish ?? swedishInlineCopy[english] ?? translateEnglishCopy(language, english);
    return translateEnglishCopy(language, english);
  };
}
