import type { AppLanguage } from './language.js';
import { swedishInlineCopy } from './swedish-inline-copy.js';
import { vietnameseInlineCopy } from './vietnamese-inline-copy.js';

export type LocalizeCopy = (chinese: string, english: string, swedish?: string, vietnamese?: string) => string;

export function createLocalizedCopy(language: AppLanguage): LocalizeCopy {
  return (chinese, english, swedish, vietnamese) => {
    if (language === 'zh-CN') return chinese;
    if (language === 'sv-SE') return swedish ?? swedishInlineCopy[english] ?? english;
    // VI-1: Vietnamese resolves through the explicit argument, then the
    // Vietnamese backfill map, then deterministic English. Chinese is never
    // used as a Vietnamese fallback. Existing call sites are untouched: the
    // fourth argument is optional, so all ~187 l(zh, en[, sv]) calls keep
    // working and render English under vi-VN until VI-2 translates them.
    if (language === 'vi-VN') return vietnamese ?? vietnameseInlineCopy[english] ?? english;
    return english;
  };
}
