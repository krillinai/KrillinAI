import type { VideoMetadataResponse } from '@opencreator/protocol';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import { LanguageSwitchControls } from '../../test/LanguageSwitchControls.js';
import { BilibiliPartSelector } from './BilibiliPartSelector.js';

describe('Bilibili part selector localization', () => {
  it('switches loading copy without selecting a part', () => {
    const onSelect = vi.fn();
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><BilibiliPartSelector onSelect={onSelect} /></LanguageProvider>);
    expect(screen.getByText('正在读取 B 站分集信息，请稍候…')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'en-US' }));
    expect(screen.getByText('Loading Bilibili parts, please wait…')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByText('Läser in Bilibili-delar, vänta en stund…')).toBeVisible();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('preserves the selected part and original titles across all UI languages', () => {
    const parts = [{ index: 1, title: '原视频第一集' }, { index: 2, title: '原视频第二集' }, { index: 3, title: '原视频第三集' }];
    const metadata: VideoMetadataResponse = { platform: 'bilibili', title: '用户的合集', parts, selectedPart: parts[2] };
    const onSelect = vi.fn();
    render(<LanguageProvider initialPreference="zh-CN"><LanguageSwitchControls /><BilibiliPartSelector metadata={metadata} onSelect={onSelect} /></LanguageProvider>);
    for (const [language, label, count] of [
      ['zh-CN', '选择要翻译的分集', '共 3 个分 P'],
      ['en-US', 'Choose a part to translate', '3 parts.'],
      ['sv-SE', 'Välj en del att översätta', '3 delar.']
    ]) {
      fireEvent.click(screen.getByRole('button', { name: language }));
      expect(screen.getByRole('combobox', { name: label })).toHaveValue('3');
      expect(screen.getByRole('option', { name: 'P3 · 原视频第三集' })).toBeInTheDocument();
      expect(screen.getByText(text => text.startsWith(count!))).toBeVisible();
    }
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('localizes retry guidance while keeping the upstream error in collapsed diagnostics', () => {
    const raw = '分 P 参数错误，后台解析失败';
    const onRetry = vi.fn();
    render(<LanguageProvider initialPreference="en-US"><LanguageSwitchControls /><BilibiliPartSelector error={raw} onRetry={onRetry} onSelect={vi.fn()} /></LanguageProvider>);
    expect(screen.getByText(/Could not load or verify Bilibili parts/)).toBeVisible();
    expect(screen.getByText(raw)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'sv-SE' }));
    expect(screen.getByText(/Det gick inte att läsa in eller verifiera Bilibili-delar/)).toBeVisible();
    expect(screen.getByText(raw)).not.toBeVisible();
    fireEvent.click(screen.getByText('Visa ursprunglig diagnostik'));
    expect(screen.getByText(raw)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Försök läsa in delarna igen' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
