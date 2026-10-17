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
    expect(appLanguageOptions[0]!.englishName).toBe('Arabic');
    expect(appLanguageOptions.at(-1)!.englishName).toBe('Vietnamese');
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

  it('uses a single letter to locate an English-name section and commits only with Enter', async () => {
    const { input, change } = setup();
    await userEvent.click(input);
    await userEvent.type(input, 'b');
    expect(screen.getAllByRole('option').map(option => option.dataset.value)).toEqual(['bn-BD', 'bg-BG']);
    await userEvent.keyboard('{ArrowDown}');
    expect(change).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(change).toHaveBeenCalledExactlyOnceWith('bg-BG');
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
    expect(screen.getAllByRole('option').map(option => option.dataset.value)).toEqual(['bn-BD', 'bg-BG']);
  });
});
