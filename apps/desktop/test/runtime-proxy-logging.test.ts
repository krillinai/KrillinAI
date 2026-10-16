import { afterEach, describe, expect, it, vi } from 'vitest';
import { net, protocol } from 'electron';
import type { DesktopLogger } from '../src/main/logger.js';
import { installProtocolHandler } from '../src/main/protocol-handler.js';

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn()
  }
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(protocol.handle).mockClear();
  vi.mocked(net.fetch).mockReset();
});

describe('Desktop Runtime proxy logging', () => {
  it('rate-limits logs while the daemon connection is unavailable', async () => {
    const logger = fakeLogger();
    await installProtocolHandler({
      webRoot: '',
      bootstrapRoot: '',
      getConnection: () => undefined,
      logger
    });

    const handler = vi.mocked(protocol.handle).mock.calls[0]![1];
    const response = await handler(new Request(
      'opencreator-app://app/.opencreator/runtime/tasks?token=private-value'
    ));

    expect(response.status).toBe(503);
    expect(logger.warnRateLimited).toHaveBeenCalledWith(
      'runtime-proxy-unavailable',
      'Runtime proxy connection unavailable',
      { method: 'GET', path: '/.opencreator/runtime/tasks' },
      5_000
    );
  });

  it('logs the transport error chain without exposing query strings or messages', async () => {
    const cause = Object.assign(new Error('private-value'), {
      code: 'ECONNREFUSED',
      errno: -4078,
      syscall: 'connect'
    });
    vi.mocked(net.fetch).mockRejectedValue(new TypeError('fetch failed', { cause }));
    const logger = fakeLogger();
    const onTransportFailure = vi.fn();
    await installProtocolHandler({
      webRoot: '',
      bootstrapRoot: '',
      getConnection: () => ({ address: 'http://127.0.0.1:60764', token: 'private-value' }),
      onTransportFailure,
      logger
    });

    const handler = vi.mocked(protocol.handle).mock.calls[0]![1];
    const response = await handler(new Request(
      'opencreator-app://app/.opencreator/runtime/healthz?token=private-value'
    ));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: { code: 'RUNTIME_PROXY_FAILED', message: 'Runtime request failed' }
    });
    expect(logger.warn).toHaveBeenCalledWith('Runtime proxy request failed', {
      method: 'GET',
      path: '/.opencreator/runtime/healthz',
      phase: 'fetch',
      durationMs: expect.any(Number),
      daemonPort: '60764',
      errors: [
        { name: 'TypeError' },
        { name: 'Error', code: 'ECONNREFUSED', errno: -4078, syscall: 'connect' }
      ]
    });
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('private-value');
    expect(onTransportFailure).toHaveBeenCalledTimes(1);
  });

  it('does not restart for an upstream application error', async () => {
    vi.mocked(net.fetch).mockResolvedValue(new Response('error', { status: 500 }));
    const onTransportFailure = vi.fn();
    await installProtocolHandler({
      webRoot: '',
      bootstrapRoot: '',
      getConnection: () => ({ address: 'http://127.0.0.1:60764', token: 'test' }),
      onTransportFailure,
      logger: fakeLogger()
    });

    const handler = vi.mocked(protocol.handle).mock.calls[0]![1];
    const response = await handler(new Request('opencreator-app://app/.opencreator/runtime/tasks'));
    expect(response.status).toBe(500);
    expect(onTransportFailure).not.toHaveBeenCalled();
  });
});

function fakeLogger(): DesktopLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    warnRateLimited: vi.fn(),
    flush: vi.fn(async () => undefined)
  };
}
