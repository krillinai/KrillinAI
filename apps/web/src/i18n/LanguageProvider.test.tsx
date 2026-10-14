import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useAppLanguage } from './LanguageProvider.js';

describe('LanguageProvider', () => {
  afterEach(() => {
    setNavigatorLanguages(['zh-CN']);
  });

  it('updates the display language when the system language changes', () => {
    setNavigatorLanguages(['zh-CN']);
    render(
      <LanguageProvider initialPreference="system">
        <LanguageProbe />
      </LanguageProvider>
    );

    expect(screen.getByText('zh-CN')).toBeInTheDocument();

    setNavigatorLanguages(['en-US']);
    act(() => window.dispatchEvent(new Event('languagechange')));

    expect(screen.getByText('en-US')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
  });

  it.each([
    ['ja-JP', '表示言語', 'システムに合わせる（日本語）'],
    ['ko-KR', '표시 언어', '시스템 설정 사용 (日本語)'],
    ['es-ES', 'Idioma de visualización', 'Idioma del sistema (日本語)'],
    ['fr-FR', "Langue d'affichage", 'Langue du système (日本語)'],
    ['de-DE', 'Anzeigesprache', 'Systemsprache (日本語)'],
    ['pt-BR', 'Idioma de exibição', 'Idioma do sistema (日本語)']
  ] as const)('translates keyed text and named variables in %s', (language, label, systemLabel) => {
    function TranslatedProbe() {
      const { t } = useAppLanguage();
      return <><span>{t('settings.language')}</span><span>{t('settings.language.system', { language: '日本語' })}</span></>;
    }
    render(<LanguageProvider initialPreference={language}><TranslatedProbe /></LanguageProvider>);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(systemLabel)).toBeVisible();
  });
});

function LanguageProbe() {
  const { language } = useAppLanguage();
  return <span>{language}</span>;
}

function setNavigatorLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: languages[0] ?? 'en-US'
  });
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: languages
  });
}
