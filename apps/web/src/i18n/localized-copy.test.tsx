import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from './LanguageProvider.js';
import { createLocalizedCopy } from './localized-copy.js';
import { useLocalizedCopy } from './useLocalizedCopy.js';
import { LanguageSwitchControls } from '../test/LanguageSwitchControls.js';

describe('inline multilingual copy', () => {
  it('uses explicit Swedish, then the inline catalog, then English rather than Chinese', () => {
    expect(createLocalizedCopy('sv-SE')('中文', 'English', 'Svenska')).toBe('Svenska');
    expect(createLocalizedCopy('sv-SE')('重试', 'Retry')).toBe('Försök igen');
    expect(createLocalizedCopy('sv-SE')('未翻译的旧文案', 'Untranslated legacy copy')).toBe('Untranslated legacy copy');
    expect(createLocalizedCopy('en-US')('中文', 'English', 'Svenska')).toBe('English');
    expect(createLocalizedCopy('zh-CN')('中文', 'English', 'Svenska')).toBe('中文');
  });

  it('updates already-rendered copy when the language preference changes', () => {
    function Copy() { const localize = useLocalizedCopy(); return <p>{localize('下载原视频并预览', 'Download source video and preview')}</p>; }
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><Copy /></LanguageProvider>);
    expect(screen.getByText('下载原视频并预览')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'en-US' }));
    expect(screen.getByText('Download source video and preview')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByText('Ladda ned originalvideon och förhandsvisa')).toBeVisible();
    expect(document.documentElement.lang).toBe('sv-SE');
  });
});
