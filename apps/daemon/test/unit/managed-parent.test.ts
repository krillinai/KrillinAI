import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installManagedParentWatch,
  parseManagedParentPid
} from '../../src/managed-parent.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('managed parent watch', () => {
  it('parses only a positive parent PID different from the daemon', () => {
    expect(parseManagedParentPid(undefined, 50)).toBeUndefined();
    expect(parseManagedParentPid(' 42 ', 50)).toBe(42);
    expect(() => parseManagedParentPid('0', 50)).toThrow();
    expect(() => parseManagedParentPid('50', 50)).toThrow();
    expect(() => parseManagedParentPid('invalid', 50)).toThrow();
  });

  it('closes and exits after the managed parent disappears', async () => {
    vi.useFakeTimers();
    let parentAlive = true;
    const close = vi.fn(async () => undefined);
    const exit = vi.fn();
    const onError = vi.fn();
    const stop = installManagedParentWatch({
      parentPid: 42,
      close,
      exit,
      onError,
      intervalMs: 10,
      isAlive: () => parentAlive
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(close).not.toHaveBeenCalled();

    parentAlive = false;
    await vi.advanceTimersByTimeAsync(10);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('reports close failures before exiting', async () => {
    vi.useFakeTimers();
    const error = new Error('close failed');
    const exit = vi.fn();
    const onError = vi.fn();
    installManagedParentWatch({
      parentPid: 42,
      close: async () => {
        throw error;
      },
      exit,
      onError,
      intervalMs: 10,
      isAlive: () => false
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledWith(error);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
