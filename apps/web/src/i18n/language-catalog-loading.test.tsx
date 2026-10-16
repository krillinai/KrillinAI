import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('./translated-copy.js');
  vi.doUnmock('./locales/ja-JP.json');
});

describe('cold language catalog loading', () => {
  it('loads only the requested language and shares concurrent requests', async () => {
    vi.resetModules();
    const copy = await import('./translated-copy.js');
    expect(Object.keys(copy.additionalLanguageCatalogs)).toEqual([]);
    await copy.loadLanguageCatalog('zh-CN');
    await copy.loadLanguageCatalog('en-US');
    expect(Object.keys(copy.additionalLanguageCatalogs)).toEqual([]);
    expect(copy.translateEnglishCopy('ja-JP', 'Fetch')).toBe('Fetch');
    const first = copy.loadLanguageCatalog('ja-JP');
    expect(copy.loadLanguageCatalog('ja-JP')).toBe(first);
    await first;
    expect(Object.keys(copy.additionalLanguageCatalogs)).toEqual(['ja-JP']);
    expect(copy.translateEnglishCopy('ja-JP', 'Fetch')).toBe('取得');
  });

  it('allows retry after a failed catalog load', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('./locales/ja-JP.json', () => ({
      get default() {
        if (attempts++ === 0) throw new Error('Temporary catalog failure');
        return { Fetch: '取得' };
      }
    }));
    const copy = await import('./translated-copy.js');
    await expect(copy.loadLanguageCatalog('ja-JP')).rejects.toThrow('Temporary catalog failure');
    expect(copy.hasLanguageCatalog('ja-JP')).toBe(false);
    expect(copy.translateEnglishCopy('ja-JP', 'Fetch')).toBe('Fetch');
    await copy.loadLanguageCatalog('ja-JP');
    expect(copy.translateEnglishCopy('ja-JP', 'Fetch')).toBe('取得');
  });

  it('refreshes memoized copy without losing drafts or applying an outdated language', async () => {
    vi.resetModules();
    const ready = new Set<string>();
    const completions = new Map<string, () => void>();
    vi.doMock('./translated-copy.js', () => ({
      hasLanguageCatalog: (language: string) => language === 'zh-CN' || language === 'en-US' || ready.has(language),
      loadLanguageCatalog: (language: string) => new Promise<void>(resolve => {
        completions.set(language, () => { ready.add(language); resolve(); });
      }),
      translateEnglishCopy: (language: string, source: string) => ready.has(language) ? `${language}: ${source}` : source
    }));
    const { LanguageProvider, useAppLanguage } = await import('./LanguageProvider.js');
    const { useLocalizedCopy } = await import('./useLocalizedCopy.js');
    function Probe() {
      const { setPreference, t } = useAppLanguage();
      const localize = useLocalizedCopy();
      const label = useMemo(() => localize('获取', 'Fetch'), [localize]);
      const [draft, setDraft] = useState('');
      return <>
        <button onClick={() => setPreference('ja-JP')}>Japanese</button>
        <button onClick={() => setPreference('fr-FR')}>French</button>
        <input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} />
        <span>{label}</span><span>{t('settings.language')}</span>
      </>;
    }
    render(<LanguageProvider initialPreference="zh-CN"><Probe /></LanguageProvider>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Japanese' }));
    expect(screen.getByText('Fetch')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'French' }));
    await act(async () => { completions.get('fr-FR')!(); });
    expect(screen.getByText('fr-FR: Fetch')).toBeVisible();
    expect(screen.getByText('fr-FR: Display language')).toBeVisible();
    await act(async () => { completions.get('ja-JP')!(); });
    expect(screen.getByText('fr-FR: Fetch')).toBeVisible();
    expect(document.documentElement.lang).toBe('fr-FR');
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep this draft');
  });
});
