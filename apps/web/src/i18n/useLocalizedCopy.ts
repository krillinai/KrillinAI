import { useMemo } from 'react';
import { useAppLanguage } from './LanguageProvider.js';
import { createLocalizedCopy, type LocalizeCopy } from './localized-copy.js';

export type { LocalizeCopy } from './localized-copy.js';

export function useLocalizedCopy(): LocalizeCopy {
  const { language } = useAppLanguage();
  return useMemo(() => createLocalizedCopy(language), [language]);
}
