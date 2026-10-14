import { expect, it, vi } from 'vitest';
import { createDirectRuntime } from '../../src/gateway/direct-runtime.js';
import { GatewayError } from '../../src/gateway/client.js';

it('uses the current coordinated supplier key for each request in the same Runtime', async () => {
  let key = 'first-user-key'; let busy = 0;
  const keys: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://openrouter.ai/api/v1/responses');
    expect(busy).toBe(1);
    keys.push(new Headers(init?.headers).get('Authorization')!);
    return Response.json({ output: [] });
  }) as typeof fetch;
  const runtime = await createDirectRuntime('stale-cached-key', fetcher, async () => {
    busy++; return { key, async release() { busy--; } };
  });
  try {
    for (const next of ['first-user-key', 'replacement-user-key']) {
      key = next;
      const response = await fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'test/text', input: 'test' }) });
      expect(response.status).toBe(200); await response.json();
      await vi.waitFor(() => expect(busy).toBe(0));
    }
    expect(keys).toEqual(['Bearer first-user-key', 'Bearer replacement-user-key']);
  } finally { await runtime.close(); }
});

it('does not submit a supplier request when coordination denies admission', async () => {
  const fetcher = vi.fn() as typeof fetch;
  const runtime = await createDirectRuntime('user-key', fetcher, async () => { throw new Error('Coordination unavailable'); });
  try {
    const response = await fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'test' }) });
    expect(response.status).toBe(503); await response.json();
    expect(fetcher).not.toHaveBeenCalled();
  } finally { await runtime.close(); }
});

it.each(['success', 'rejected', 'unchanged', 'offline'] as const)('Runtime 的认证恢复为 %s 时最多提交两次', async outcome => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => fetcher.mock.calls.length === 1 || outcome === 'rejected' ? Response.json({}, { status: 401 }) : Response.json({ output: [] }));
  const release = vi.fn(async () => undefined);
  const recover = vi.fn(async () => {
    if (outcome === 'offline') throw new GatewayError('gateway_unavailable');
    return { key: outcome === 'unchanged' ? 'old-key' : 'new-key', keyVersion: outcome === 'unchanged' ? '1' : '2' };
  });
  const runtime = await createDirectRuntime('old-key', fetcher, async () => ({ key: 'old-key', keyVersion: '1', release }), recover);
  try {
    const response = await fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'test/text', input: 'test' }) });
    expect(response.status).toBe(outcome === 'success' ? 200 : 401); await response.json();
    expect(recover).toHaveBeenCalledExactlyOnceWith('1');
    expect(fetcher).toHaveBeenCalledTimes(['success', 'rejected'].includes(outcome) ? 2 : 1);
    expect(new Headers(fetcher.mock.calls[0]![1]!.headers).get('authorization')).toBe('Bearer old-key');
    if (fetcher.mock.calls.length === 2) {
      expect(new Headers(fetcher.mock.calls[1]![1]!.headers).get('authorization')).toBe('Bearer new-key');
      expect(fetcher.mock.calls[1]![1]!.body).toEqual(fetcher.mock.calls[0]![1]!.body);
    }
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  } finally { await runtime.close(); }
});

it.each([402, 403, 503])('Runtime 遇到 %s 时不进行认证恢复', async status => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}, { status }));
  const recover = vi.fn(async () => ({ key: 'new-key', keyVersion: '2' }));
  const runtime = await createDirectRuntime('old-key', fetcher, async () => ({ key: 'old-key', keyVersion: '1', release: async () => undefined }), recover);
  try {
    const response = await fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: '{}' });
    await response.json();
    expect(fetcher).toHaveBeenCalledOnce(); expect(recover).not.toHaveBeenCalled();
  } finally { await runtime.close(); }
});

it('Runtime 关闭期间迟到的认证恢复不会再次提交', async () => {
  let resume!: () => void;
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => { signal = options?.signal ?? undefined; return Response.json({}, { status: 401 }); });
  const recover = vi.fn(async () => { await waiting; return { key: 'new-key', keyVersion: '2' }; });
  const runtime = await createDirectRuntime('old-key', fetcher, async () => ({ key: 'old-key', keyVersion: '1', release: async () => undefined }), recover);
  const request = fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined);
  try {
    await vi.waitFor(() => expect(recover).toHaveBeenCalledOnce());
    const closing = runtime.close();
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    resume(); await closing; await request;
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { resume(); await runtime.close(); await request; }
});
it('rejects a hidden model before inference and reports both HTTP and streamed access failures', async () => {
  const onModelFailure = vi.fn(async () => undefined);
  const fetcher = vi.fn(async () => Response.json({ error: { code: 403, message: 'Model unavailable in this country' } }, { status: 403 }));
  const runtime = await createDirectRuntime('user-key', fetcher, async () => ({
    key: 'user-key', release: async () => undefined, onModelFailure,
    models: [{ id: 'vendor/allowed', modality: 'text', capabilities: ['responses'] }]
  }));
  const submit = (model: string) => fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: 'test', stream: true }) });
  try {
    expect((await submit('vendor/hidden')).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    const failure = await submit('vendor/allowed'); await failure.text();
    expect(onModelFailure).toHaveBeenLastCalledWith('vendor/allowed', 'text', expect.objectContaining({ httpStatus: 403, upstreamMessage: 'Model unavailable in this country' }));
    fetcher.mockImplementation(async () => new Response('data: {"type":"response.failed","response":{"error":{"code":403,"message":"Model unavailable in this country"}}}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    const streamed = await submit('vendor/allowed');
    expect(await streamed.text()).not.toContain('this country');
    expect(onModelFailure).toHaveBeenLastCalledWith('vendor/allowed', 'text', expect.objectContaining({ upstreamCode: '403', upstreamMessage: 'Model unavailable in this country' }));
    expect(onModelFailure).toHaveBeenCalledTimes(2);
  } finally { await runtime.close(); }
});
