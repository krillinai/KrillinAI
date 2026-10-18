import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { appLanguageOptions } from '../../i18n/language.js';
import LanguageSelect from './LanguageSelect.js';

function setup() {
  const change = vi.fn();
  render(<LanguageProvider initialPreference="en-US">
    <LanguageSelect id="language" label="Display language" value="en-US" systemLabel="System (English)" onChange={change} />
  </LanguageProvider>);
  const input = screen.getByRole('combobox', { name: 'Display language' });
  return { change, input };
}

describe('LanguageSelect', () => {
  it('keeps system first, languages in stable English A–Z order, and native names visible', () => {
    const { input } = setup();
    fireEvent.focus(input);
    const options = screen.getAllByRole('option');
    expect(options.map(option => option.dataset.value)).toEqual(['system', ...appLanguageOptions.map(option => option.value)]);
    expect(appLanguageOptions[0]!.englishName).toBe('Afrikaans');
    expect(appLanguageOptions.at(-1)!.englishName).toBe('Zulu');
    expect(screen.getByRole('option', { name: '日本語 Japanese' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'العربية Arabic' })).toBeInTheDocument();
  });

  it.each(['Japanese', '日本語', '日语', 'ja', 'ja-JP'])('finds Japanese using %s without changing the preference', async query => {
    const { input, change } = setup();
    await userEvent.click(input);
    fireEvent.change(input, { target: { value: query } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: '日本語 Japanese' })).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it.each([
    ['မြန်မာ', 'my-MM'], ['Khmer', 'km-KH'], ['አማርኛ', 'am-ET'],
    ['卡纳达语', 'kn-IN'], ['Kinyarwanda', 'rw-RW'], ['as-IN', 'as-IN'],
    ['Odia', 'or-IN'], ['Uzbek', 'uz-UZ'],
    ['Català', 'ca-ES'], ['Euskara', 'eu-ES'], ['Galician', 'gl-ES'], ['Íslenska', 'is-IS'],
    ['Bosanski', 'bs-BA'], ['Македонски', 'mk-MK'], ['Беларуская', 'be-BY'],
    ['Кыргызча', 'ky-KG'], ['Тоҷикӣ', 'tg-TJ'], ['Türkmençe', 'tk-TM'],
    ['پښتو', 'ps-AF'], ['Kurdî', 'ku-TR'], ['库尔德语', 'ku-TR']
  ])('finds an added language using %s and applies it on confirmation', (query, locale) => {
    const { input, change } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: query } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').dataset.value).toBe(locale);
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledExactlyOnceWith(locale);
  });

  it('uses a single letter to locate an English-name section and commits only with Enter', async () => {
    const { input, change } = setup();
    await userEvent.click(input);
    await userEvent.type(input, 'b');
    expect(screen.getAllByRole('option').map(option => option.dataset.value)).toEqual(['eu-ES', 'be-BY', 'bn-BD', 'bs-BA', 'bg-BG', 'my-MM']);
    await userEvent.keyboard('{ArrowDown}');
    expect(change).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(change).toHaveBeenCalledExactlyOnceWith('be-BY');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('shows a localized empty result and restores the selected value on Escape', async () => {
    const { input, change } = setup();
    await userEvent.click(input);
    await userEvent.type(input, 'unmatched-language');
    expect(screen.getByRole('status')).toHaveTextContent('No matching languages');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    await userEvent.keyboard('{Enter}{Escape}');
    expect(change).not.toHaveBeenCalled();
    expect(input).toHaveValue('English');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not select a language while an IME confirms composition', () => {
    const { input, change } = setup();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '日语' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('ja-JP');
  });

  it('discards an uncommitted search when clicking outside or tabbing away', async () => {
    const { input, change } = setup();
    await userEvent.click(input);
    await userEvent.type(input, 'French');
    fireEvent.pointerDown(document.body);
    expect(input).toHaveValue('English');
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(input);
    await userEvent.keyboard('{Tab}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('starts a fresh initial-letter search after confirming a selection', async () => {
    const { input } = setup();
    await userEvent.click(input);
    await userEvent.type(input, 'j{Enter}b');
    expect(input).toHaveValue('b');
    expect(screen.getAllByRole('option').map(option => option.dataset.value)).toEqual(['eu-ES', 'be-BY', 'bn-BD', 'bs-BA', 'bg-BG', 'my-MM']);
  });
});
