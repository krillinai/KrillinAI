import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, RuntimeClient } from '../runtime/client.js';
import { createConnectionService } from './connection-service.js';

describe('ConnectionService', () => {
  afterEach(() => vi.useRealTimers());

  it.each([true, false])('bounds stalled health/Codex reads without timing out business requests (health=%s)', async healthy => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url: string | URL | Request, options?: RequestInit) => {
      if (healthy && String(url).endsWith('/healthz')) return Promise.resolve(new Response('{}'));
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
      });
    });
    const client = new RuntimeClient({ baseUrl: 'http://runtime.test', fetchImpl });
    const result = createConnectionService(client).check();
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await result).status).toBe(healthy ? 'connected' : 'disconnected');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps a healthy Runtime connected when Codex status is unavailable', async () => {
    const get = vi.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('Codex unavailable'));
    const service = createConnectionService({ get, post: vi.fn(), patch: vi.fn() });
    await expect(service.check()).resolves.toEqual({ status: 'connected', codexStatusError: 'Codex unavailable' });
    expect(get.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps authentication errors distinct even when health is successful', async () => {
    const get = vi.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(
      new ApiClientError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' })
    );
    const service = createConnectionService({ get, post: vi.fn(), patch: vi.fn() });
    await expect(service.check()).resolves.toEqual({ status: 'invalid_token', message: 'Unauthorized' });
  });
  it('returns invalid_token for unauthorized Runtime responses', async () => {
    const client = {
      async get<T>(): Promise<T> {
        throw new ApiClientError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      },
      async post<T>(): Promise<T> {
        throw new ApiClientError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      },
      async patch<T>(): Promise<T> {
        throw new ApiClientError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' });
      }
    } satisfies Pick<RuntimeClient, 'get' | 'post' | 'patch'>;
    const service = createConnectionService(client);

    await expect(service.check()).resolves.toEqual({ status: 'invalid_token', message: 'Unauthorized' });
  });

  it('returns disconnected for network errors', async () => {
    const client = {
      async get<T>(): Promise<T> {
        throw new TypeError('fetch failed');
      },
      async post<T>(): Promise<T> {
        throw new TypeError('fetch failed');
      },
      async patch<T>(): Promise<T> {
        throw new TypeError('fetch failed');
      }
    } satisfies Pick<RuntimeClient, 'get' | 'post' | 'patch'>;
    const service = createConnectionService(client);

    await expect(service.check()).resolves.toEqual({ status: 'disconnected', message: 'fetch failed' });
  });

  it('uses dedicated Codex readiness and account routes', async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const client = {
      async get<T>(path: string): Promise<T> {
        calls.push({ method: 'GET', path });
        return { state: 'ready' } as T;
      },
      async post<T>(path: string, body?: unknown): Promise<T> {
        calls.push({ method: 'POST', path, body });
        return { ok: true } as T;
      },
      async patch<T>(path: string, body: unknown): Promise<T> {
        calls.push({ method: 'PATCH', path, body });
        return { ok: true } as T;
      }
    } satisfies Pick<RuntimeClient, 'get' | 'post' | 'patch'>;
    const service = createConnectionService(client);

    await service.getCodexReadiness();
    await service.getCodexProvider();
    await service.updateCodexProvider({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'secret',
      model: 'gpt-test'
    });
    await service.readCodexAccount();
    await service.startCodexLogin({ loginType: 'device_code' });
    await service.cancelCodexLogin('login_1');
    await service.logoutCodex();

    expect(calls).toEqual([
      { method: 'GET', path: '/codex/readiness' },
      { method: 'GET', path: '/codex/provider' },
      {
        method: 'PATCH',
        path: '/codex/provider',
        body: {
          baseUrl: 'https://api.example.test/v1',
          apiKey: 'secret',
          model: 'gpt-test'
        }
      },
      { method: 'GET', path: '/codex/account' },
      { method: 'POST', path: '/codex/account/login/start', body: { loginType: 'device_code' } },
      { method: 'POST', path: '/codex/account/login/cancel', body: { loginId: 'login_1' } },
      { method: 'POST', path: '/codex/account/logout', body: undefined }
    ]);
  });
});
