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
    ['pt-BR', 'Idioma de exibição', 'Idioma do sistema (日本語)'],
    ['th-TH', 'ภาษาที่แสดง', 'ตามระบบ (日本語)'],
    ['fil-PH', 'Wika ng interface', 'Sundin ang sistema (日本語)'],
    ['hi-IN', 'प्रदर्शन भाषा', 'सिस्टम के अनुसार (日本語)'],
    ['bn-BD', 'প্রদর্শনের ভাষা', 'সিস্টেম অনুসরণ করুন (日本語)'],
    ['pl-PL', 'Język interfejsu', 'Język systemu (日本語)'],
    ['uk-UA', 'Мова інтерфейсу', 'Мова системи (日本語)'],
    ['nl-NL', 'Weergavetaal', 'Systeemtaal (日本語)'],
    ['ms-MY', 'Bahasa paparan', 'Ikut sistem (日本語)'],
    ['da-DK', 'Visningssprog', 'Følg systemet (日本語)'],
    ['nb-NO', 'Visningsspråk', 'Følg systemet (日本語)'],
    ['fi-FI', 'Näyttökieli', 'Järjestelmän mukaan (日本語)'],
    ['cs-CZ', 'Jazyk rozhraní', 'Podle systému (日本語)'],
    ['ro-RO', 'Limba interfeței', 'Urmează sistemul (日本語)'],
    ['hu-HU', 'Megjelenítési nyelv', 'Rendszer követése (日本語)'],
    ['el-GR', 'Γλώσσα εμφάνισης', 'Γλώσσα συστήματος (日本語)'],
    ['ta-IN', 'காட்சி மொழி', 'கணினி மொழி (日本語)'],
    ['te-IN', 'ప్రదర్శన భాష', 'సిస్టమ్ భాష (日本語)'],
    ['bg-BG', 'Език на интерфейса', 'Системен език (日本語)'],
    ['sk-SK', 'Jazyk rozhrania', 'Podľa systému (日本語)'],
    ['hr-HR', 'Jezik sučelja', 'Jezik sustava (日本語)'],
    ['sr-RS', 'Језик интерфејса', 'Системски језик (日本語)']
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
