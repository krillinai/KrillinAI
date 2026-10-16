import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAppLanguage,
  defaultLanguagePreference,
  languagePreferenceStorageKey,
  readLanguagePreference,
  resolveAppLanguage,
  resolveSystemLanguage,
  writeLanguagePreference
} from './language.js';

describe('display language preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('lang');
    delete document.documentElement.dataset.locale;
  });

  it('follows Chinese system locales and uses English for other system locales', () => {
    expect(resolveSystemLanguage(['zh-Hans-CN', 'en-US'])).toBe('zh-CN');
    expect(resolveSystemLanguage(['en-GB', 'fr-FR'])).toBe('en-US');
    expect(resolveAppLanguage('system', ['zh-TW'])).toBe('zh-CN');
  });

  it('respects browser language preference order', () => {
    expect(resolveSystemLanguage(['en-US', 'sv-SE'])).toBe('en-US');
    expect(resolveSystemLanguage(['sv-SE', 'zh-CN'])).toBe('sv-SE');
  });

  it('defaults to the system and ignores invalid stored values', () => {
    expect(readLanguagePreference()).toBe(defaultLanguagePreference);

    window.localStorage.setItem(languagePreferenceStorageKey, 'xx-XX');
    expect(readLanguagePreference()).toBe('system');
  });

  it('persists explicit choices and applies the resolved document language', () => {
    writeLanguagePreference('en-US');
    const language = resolveAppLanguage(readLanguagePreference(), ['zh-CN']);
    applyAppLanguage(language);

    expect(window.localStorage.getItem(languagePreferenceStorageKey)).toBe('en-US');
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    expect(document.documentElement).toHaveAttribute('data-locale', 'en-US');
  });

  it.each(['ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR'] as const)('resolves and persists %s', language => {
    writeLanguagePreference(language);
    expect(readLanguagePreference()).toBe(language);
    expect(resolveSystemLanguage([language])).toBe(language);
    expect(resolveAppLanguage(language, ['en-US'])).toBe(language);
  });

  it('matches regional variants and skips unsupported languages', () => {
    expect(resolveSystemLanguage(['xx-XX', 'pt-PT', 'fr-FR'])).toBe('pt-BR');
    expect(resolveSystemLanguage(['fr-CA', 'en-US'])).toBe('fr-FR');
    expect(resolveSystemLanguage(['xx-XX'])).toBe('en-US');
  });
});
