import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { terminateCodexProcess } from '../../src/codex/process.js';

vi.mock('cross-spawn', () => ({ default: Object.assign(vi.fn(), { sync: vi.fn() }) }));

describe('Codex process termination on Windows', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('process', new Proxy(process, {
      get(target, property) {
        return property === 'platform' ? 'win32' : Reflect.get(target, property);
      }
    }));
    vi.mocked(crossSpawn).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function fixture() {
    const child = Object.assign(new EventEmitter(), {
      pid: 123,
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true)
    }) as unknown as ChildProcess;
    const killer = Object.assign(new EventEmitter(), { kill: vi.fn(() => true) }) as unknown as ChildProcess;
    vi.mocked(crossSpawn).mockReturnValue(killer);
    return { child, killer };
  }

  it('forces the whole tree on the first termination attempt', async () => {
    const { child, killer } = fixture();
    const work = terminateCodexProcess(child, 'SIGTERM');
    expect(crossSpawn).toHaveBeenCalledWith('taskkill.exe', ['/PID', '123', '/T', '/F'], {
      stdio: 'ignore', windowsHide: true
    });
    killer.emit('close', 0);
    await work;
    expect(child.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to terminating the child if taskkill exits unsuccessfully', async () => {
    const { child, killer } = fixture();
    const work = terminateCodexProcess(child, 'SIGTERM');
    killer.emit('close', 128);
    await work;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back when taskkill cannot be spawned', async () => {
    const { child, killer } = fixture();
    const work = terminateCodexProcess(child);
    killer.emit('error', new Error('spawn taskkill.exe ENOENT'));
    await work;
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not target a Windows PID after its parent process has exited', async () => {
    const { child } = fixture();
    Object.defineProperty(child, 'exitCode', { value: 1 });
    await terminateCodexProcess(child, 'SIGKILL');
    expect(crossSpawn).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('bounds a hung taskkill and releases its own helper process', async () => {
    const { child, killer } = fixture();
    let finished = false;
    const work = terminateCodexProcess(child).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(finished).toBe(true);
    await work;
    expect(killer.kill).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(vi.getTimerCount()).toBe(0);
  });
});
