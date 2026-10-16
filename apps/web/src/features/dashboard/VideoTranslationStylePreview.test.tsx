import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorSubtitlePreviewRequest } from '@opencreator/protocol';
import { LanguageProvider } from '../../i18n/LanguageProvider.js';
import VideoTranslationStylePreview from './VideoTranslationStylePreview.js';

const input: CreatorSubtitlePreviewRequest = {
  width: 960, height: 540, bilingual: true, subtitlePosition: 'bottom',
  subtitleStyle: { fontPreset: 'serif', primaryColor: '#123456' },
  translationText: 'Translation', originalText: 'Original'
};
const createObjectURL = vi.fn(() => 'blob:rendered-subtitles');
const revokeObjectURL = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  class PreviewURL extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal('URL', PreviewURL);
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const png = () => new Response(new Blob(['png'], { type: 'image/png' }), { headers: { 'content-type': 'image/png' } });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(201); });

describe('rendered subtitle style preview', () => {
  it('renders the returned image and cancels outdated requests when style changes', async () => {
    const renderPreview = vi.fn(async () => png());
    const view = render(<LanguageProvider initialPreference="en-US"><VideoTranslationStylePreview input={input} render={renderPreview} /></LanguageProvider>);
    await tick();
    expect(renderPreview).toHaveBeenCalledExactlyOnceWith(input, { signal: expect.any(AbortSignal) });
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:rendered-subtitles');
    const signal = (renderPreview.mock.calls[0] as unknown as [unknown, { signal: AbortSignal }])[1].signal;
    const updated = { ...input, subtitleStyle: { ...input.subtitleStyle, fontPreset: 'rounded' } };
    view.rerender(<LanguageProvider initialPreference="en-US"><VideoTranslationStylePreview input={updated} render={renderPreview} /></LanguageProvider>);
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rendered-subtitles');
    await tick();
    expect(renderPreview).toHaveBeenLastCalledWith(updated, { signal: expect.any(AbortSignal) });
  });

  it('offers a working retry after rendering fails', async () => {
    const renderPreview = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(png());
    render(<LanguageProvider initialPreference="en-US"><VideoTranslationStylePreview input={input} render={renderPreview} /></LanguageProvider>);
    await tick();
    expect(screen.getByText('Subtitle preview failed')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry subtitle preview' }));
    await tick();
    expect(screen.getByRole('img')).toBeVisible();
    expect(renderPreview).toHaveBeenCalledTimes(2);
  });
});
