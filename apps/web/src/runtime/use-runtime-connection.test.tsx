import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge } from '../host/bridge.js';
import type { ConnectionConfig } from './types.js';
import { useRuntimeConnection } from './use-runtime-connection.js';

afterEach(() => vi.useRealTimers());

function fixture() {
  let online = true;
  let codexAvailable = true;
  let listener: ((config: ConnectionConfig | null) => void) | undefined;
  const config = { baseUrl: 'http://runtime.test', token: 'test-token' };
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (!online) throw new TypeError('offline');
    if (String(url).endsWith('/codex/status') && !codexAvailable) throw new Error('Codex unavailable');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const host = {
    kind: 'browser',
    readConnectionConfig: vi.fn(async () => online ? { ...config } : null),
    subscribeConnectionConfig(callback: typeof listener) {
      listener = callback;
      return () => { listener = undefined; };
    },
    openExternal: vi.fn(), revealPath: vi.fn(), notify: vi.fn(), configureBackgroundNotifications: vi.fn()
  } satisfies HostBridge;
  return { host, fetchImpl, setOnline(value: boolean) { online = value; }, setCodex(value: boolean) { codexAvailable = value; }, emit: () => listener?.(online ? config : null) };
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

describe('Runtime connection recovery', () => {
  it('retries an initial failure and recovers without recreating the connection config', async () => {
    vi.useFakeTimers();
    const input = fixture();
    input.setOnline(false);
    const { result, unmount } = renderHook(() => useRuntimeConnection(input.host, input.fetchImpl));
    await settle();
    expect(result.current.recovery.phase).toBe('reconnecting');
    input.setOnline(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.state.status).toBe('connected');
    const config = result.current.config;
    await act(async () => { await result.current.recovery.retry(); });
    expect(result.current.config).toBe(config);
    unmount();
  });

  it('retains services during null host config and periodically recovers after a later outage', async () => {
    vi.useFakeTimers();
    const input = fixture();
    const { result, unmount } = renderHook(() => useRuntimeConnection(input.host, input.fetchImpl));
    await settle();
    const config = result.current.config;
    const epoch = result.current.recovery.epoch;
    input.setOnline(false);
    await act(async () => { input.emit(); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.config).toBe(config);
    expect(result.current.recovery.phase).toBe('reconnecting');
    input.setOnline(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.recovery.epoch).toBe(epoch + 1);
    expect(result.current.config).toBe(config);
    input.setOnline(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.state.status).toBe('disconnected');
    input.setOnline(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.state.status).toBe('connected');
    const calls = input.fetchImpl.mock.calls.length;
    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(input.fetchImpl).toHaveBeenCalledTimes(calls);
  });

  it('keeps Codex errors separate and exposes restart only when supported', async () => {
    vi.useFakeTimers();
    const input = fixture();
    input.setCodex(false);
    const restartRuntime = vi.fn(async () => ({ ok: true as const }));
    const host = { ...input.host, restartRuntime };
    const { result, unmount } = renderHook(() => useRuntimeConnection(host, input.fetchImpl));
    await settle();
    expect(result.current.state.status).toBe('connected');
    expect(result.current.recovery.message).toBeDefined();
    await act(async () => { await result.current.recovery.restart?.(); });
    expect(restartRuntime).toHaveBeenCalledTimes(1);
    unmount();
    const browser = renderHook(() => useRuntimeConnection(input.host, input.fetchImpl));
    expect(browser.result.current.recovery.restart).toBeUndefined();
    browser.unmount();
  });
});
