import { describe, expect, it, vi } from 'vitest';
import { retryWindowsFileOperation } from '../scripts/windows-file-retry.mjs';

describe('Windows executable file locks', () => {
  it.each(['EBUSY', 'EPERM', 'EACCES'])('retries a temporary %s lock until the operation succeeds', code => {
    const locked = Object.assign(new Error('file is locked'), { code });
    const operation = vi.fn().mockImplementationOnce(() => { throw locked; })
      .mockImplementationOnce(() => { throw locked; }).mockReturnValue('installed');
    const wait = vi.fn();
    expect(retryWindowsFileOperation(operation, { platform: 'win32', wait })).toBe('installed');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });

  it('stops after bounded retries and retains the original filesystem error', () => {
    const locked = Object.assign(new Error('file remains locked'), { code: 'EBUSY' });
    const operation = vi.fn(() => { throw locked; });
    const wait = vi.fn();
    expect(() => retryWindowsFileOperation(operation, { platform: 'win32', wait })).toThrow(locked);
    expect(operation).toHaveBeenCalledTimes(9);
    expect(wait).toHaveBeenCalledTimes(8);
    expect(wait.mock.calls.reduce((sum, [delay]) => sum + delay, 0)).toBe(3600);
  });

  it.each([
    ['win32', 'ENOSPC'], ['win32', 'EIO'], ['darwin', 'EBUSY'], ['linux', 'EACCES']
  ])('fails immediately for %s / %s', (platform, code) => {
    const error = Object.assign(new Error('filesystem failure'), { code });
    const operation = vi.fn(() => { throw error; });
    const wait = vi.fn();
    expect(() => retryWindowsFileOperation(operation, { platform, wait })).toThrow(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
