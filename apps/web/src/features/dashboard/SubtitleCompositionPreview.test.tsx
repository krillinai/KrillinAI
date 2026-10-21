import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorSubtitleRenderBundle, CreatorSubtitleRenderRequest } from '@opencreator/protocol';
import SubtitleCompositionPreview from './SubtitleCompositionPreview.js';

const mocks = vi.hoisted(() => ({ create: vi.fn(), draw: vi.fn(), track: vi.fn(), fonts: vi.fn(), resize: vi.fn(), destroy: vi.fn() }));
vi.mock('./subtitle-renderer.js', () => ({ createSubtitleRenderer: mocks.create }));
const input: CreatorSubtitleRenderRequest = { width: 640, height: 360, horizontal: true, bilingual: true, subtitlePosition: 'top', subtitleStyle: {},
  cues: [{ startMs: 0, endMs: 1000, text: 'First\nManual line', sourceText: 'Source '.repeat(30) }, { startMs: 500, endMs: 1500, text: 'Overlap' }] };
const bundle = (ass: string): CreatorSubtitleRenderBundle => ({ schemaVersion: 1, contentHash: ass, ass, width: 640, height: 360, fonts: [] });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(100); });
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.create.mockImplementation(async canvas => ({ manualRender: mocks.draw, resize: mocks.resize, renderer: { setTrack: mocks.track, addFonts: mocks.fonts }, destroy: () => { canvas.remove(); mocks.destroy(); return Promise.resolve(); } }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared subtitle composition', () => {
  it('loads the entire track once, redraws at a new time without compilation, and releases the worker', async () => {
    const prepare = vi.fn(async () => bundle('first'));
    const openFont = vi.fn();
    const view = render(<SubtitleCompositionPreview input={input} prepare={prepare} openFont={openFont} time={0.25} />);
    await tick();
    expect(prepare).toHaveBeenCalledExactlyOnceWith(input);
    expect(mocks.draw).toHaveBeenLastCalledWith(expect.objectContaining({ mediaTime: 0.25, width: 640, height: 360 }), true);
    view.rerender(<SubtitleCompositionPreview input={input} prepare={prepare} openFont={openFont} time={0.75} />);
    await tick();
    expect(prepare).toHaveBeenCalledOnce();
    expect(mocks.draw).toHaveBeenLastCalledWith(expect.objectContaining({ mediaTime: 0.75 }), true);
    view.unmount();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('ignores stale compilation responses and retries after a failure', async () => {
    let resolveOld!: (value: CreatorSubtitleRenderBundle) => void;
    const prepare = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(bundle('new'));
    const openFont = vi.fn();
    const view = render(<SubtitleCompositionPreview input={input} prepare={prepare} openFont={openFont} />);
    await tick();
    view.rerender(<SubtitleCompositionPreview input={{ ...input, subtitleStyle: { fontPreset: 'serif' } }} prepare={prepare} openFont={openFont} />);
    await tick();
    fireEvent.click(screen.getByRole('button'));
    await tick();
    await act(async () => resolveOld(bundle('stale')));
    expect(view.container.querySelector('[data-render-hash]')).toHaveAttribute('data-render-hash', 'new');
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});
