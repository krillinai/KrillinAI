import { describe, expect, it, vi } from 'vitest';
import {
  applyWindowAction,
  DebouncedWindowStateWriter,
  nativeWindowBackgroundColor,
  nativeWindowChromeOptions
} from '../src/main/window-manager.js';

describe('Window state debounce', () => {
  it('coalesces move and resize bursts and flushes the final state', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = new DebouncedWindowStateWriter(write, 300);

    for (let index = 0; index < 20; index += 1) writer.schedule();
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(write).not.toHaveBeenCalled();
    writer.flush();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(write).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('Native window chrome', () => {
  it('keeps close behavior and toggles native minimize and zoom actions', () => {
    const window = {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(() => false),
      maximize: vi.fn(),
      unmaximize: vi.fn()
    };
    applyWindowAction(window, 'close');
    applyWindowAction(window, 'minimize');
    applyWindowAction(window, 'zoom');
    window.isMaximized.mockReturnValue(true);
    applyWindowAction(window, 'zoom');

    expect(window.close).toHaveBeenCalledOnce();
    expect(window.minimize).toHaveBeenCalledOnce();
    expect(window.maximize).toHaveBeenCalledOnce();
    expect(window.unmaximize).toHaveBeenCalledOnce();
  });

  it('uses an inset native title bar on macOS', () => {
    expect(nativeWindowChromeOptions('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 12 }
    });
  });

  it('keeps the platform title bar outside macOS', () => {
    expect(nativeWindowChromeOptions('win32')).toEqual({});
    expect(nativeWindowChromeOptions('linux')).toEqual({});
  });

  it('matches the native window background to the shared theme', () => {
    expect(nativeWindowBackgroundColor('dark')).toBe('#0a0a0a');
    expect(nativeWindowBackgroundColor('light')).toBe('#e5e5e5');
  });
});
