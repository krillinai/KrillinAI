import type { AppLanguage } from './language.js';
import { swedishInlineCopy } from './swedish-inline-copy.js';

export type LocalizeCopy = (chinese: string, english: string, swedish?: string) => string;

export function createLocalizedCopy(language: AppLanguage): LocalizeCopy {
  return (chinese, english, swedish) => {
    if (language === 'zh-CN') return chinese;
    if (language === 'sv-SE') return swedish ?? swedishInlineCopy[english] ?? english;
    return english;
  };
}
