import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDirectTransport } from '../../src/gateway/direct-transport.js';
import { GatewayError } from '../../src/gateway/client.js';
import Fastify from 'fastify';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { createGatewayCreatorSource } from '../../src/gateway/creator-service-source.js';
import type { GatewayAccountService } from '../../src/gateway/account-service.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture(fetcher: typeof fetch, recover = vi.fn(async (_account: string, _failedKey: string): Promise<string | undefined> => 'new-key')) {
  const root = await mkdtemp(join(tmpdir(), 'oc-credential-recovery-'));
  const transport = createDirectTransport(root, fetcher, recover);
  cleanup.push(() => rm(root, { recursive: true, force: true })); cleanup.push(() => transport.close());
  const request = (resource = 'chat/completions', asyncImage = false) => transport.request({ account: 'a', key: 'old-key', resource, asyncImage, method: resource.startsWith('requests/') ? 'GET' : 'POST', body: { model: 'test/model', prompt: 'test' }, contentType: 'application/json', identity: 'same-operation', fingerprint: 'same-input', signal: new AbortController().signal });
  return { transport, recover, request };
}

it.each(['chat/completions', 'images/generations', 'video/jobs'])('%s 明确拒绝认证后只重试一次，同一请求复用结果', async resource => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({}, { status: 401 })).mockImplementation(async () => Response.json(resource.startsWith('images') ? { data: [{ b64_json: 'aW1hZ2U=' }] } : resource === 'video/jobs' ? { id: 'video-upstream', status: 'pending' } : { choices: [{ message: { content: 'translated' } }] }));
  const f = await fixture(fetcher);
  const asyncImage = resource.startsWith('images');
  const first = await f.request(resource, asyncImage);
  const id = first.headers.get('x-request-id')!;
  if (asyncImage) {
    expect(first.status).toBe(202);
    await vi.waitFor(async () => expect(await (await f.request(`requests/${id}`)).json()).toMatchObject({ state: 'succeeded' }));
    expect(await (await f.request(`requests/${id}/result`)).json()).toMatchObject({ data: [{ b64_json: 'aW1hZ2U=' }] });
  }
  await (await f.request(resource, asyncImage)).text();
  expect(f.recover).toHaveBeenCalledExactlyOnceWith('a', 'old-key');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.map(([, options]) => new Headers(options?.headers).get('authorization'))).toEqual(['Bearer old-key', 'Bearer new-key']);
  expect(fetcher.mock.calls[0]![1]!.body).toEqual(fetcher.mock.calls[1]![1]!.body);
});

it('恢复后的新密钥仍被拒绝时不继续重试', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}, { status: 401 }));
  const f = await fixture(fetcher);
  await expect(f.request()).rejects.toMatchObject({ code: 'model_auth_required', status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2); expect(f.recover).toHaveBeenCalledOnce();
});

it.each([402, 403, 503, 'network'] as const)('上游 %s 不触发密钥恢复或自动重发', async status => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (status === 'network') throw new Error('Network lost');
    return Response.json({}, { status });
  });
  const f = await fixture(fetcher);
  await expect(f.request()).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce(); expect(f.recover).not.toHaveBeenCalled();
  if (status === 503 || status === 'network') {
    await expect(f.request()).rejects.toMatchObject({ code: 'request_outcome_unknown' });
    expect(fetcher).toHaveBeenCalledOnce();
  }
});

it('明确认证拒绝后网关无法恢复时记录为失败，不误记为上游结果未知', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({}, { status: 401 }));
  const recover = vi.fn(async (_account: string, _key: string): Promise<string | undefined> => { throw new GatewayError('gateway_unavailable'); });
  const f = await fixture(fetcher, recover);
  const response = await f.request('images/generations', true);
  const id = response.headers.get('x-request-id')!;
  await vi.waitFor(async () => expect(await (await f.request(`requests/${id}`)).json()).toMatchObject({ state: 'failed', error: { code: 'model_auth_required' } }));
  expect(fetcher).toHaveBeenCalledOnce();
});

it('流已开始后报告错误时保留未知结果，不换密钥重发', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"error":{"code":401,"message":"failed"}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }));
  const f = await fixture(fetcher);
  const response = await f.request();
  await expect(response.text()).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  await expect(f.request()).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(fetcher).toHaveBeenCalledOnce(); expect(f.recover).not.toHaveBeenCalled();
});

it.each(['updated', 'account-changed'] as const)('异步图片在返回 202 后通过共享账号恢复凭据（%s）', async outcome => {
  const root = await mkdtemp(join(tmpdir(), 'oc-source-recovery-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const models = [{ id: 'test/image', modality: 'image' as const, capabilities: [] }];
  const defaults = { image: 'test/image' };
  const credentials = { accountId: 'a', modelKey: 'old-key', keyVersion: '1', bindingVersion: 'a:1', baseUrl: 'https://openrouter.ai/api/v1', transport: 'openrouter-direct' as const, models, defaults };
  const release = vi.fn(async () => undefined);
  const recover = vi.fn(async () => ({ ...credentials, accountId: outcome === 'account-changed' ? 'b' : 'a', modelKey: 'new-key', keyVersion: '2' }));
  const account: Pick<GatewayAccountService, 'peekState' | 'modelCredentials' | 'beginModelUse' | 'recoverModelCredentials'> = {
    peekState: () => ({ source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'a', email: 'a@test', verified: true }, bindingVersion: 'a:1', models, selectedModels: defaults, activationError: null }),
    modelCredentials: async () => credentials, beginModelUse: async () => ({ credentials, release }), recoverModelCredentials: recover
  };
  let resume!: () => void;
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => { await waiting; return Response.json({}, { status: 401 }); }).mockImplementation(async () => Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] }));
  const manual = createDefaultCreatorServicesConfig();
  const source = createGatewayCreatorSource({ account, directRequestsRoot: root, manual: { read: async () => manual, write: async value => value, reset: async () => manual }, getLocalOrigin: () => 'http://127.0.0.1:39999', fetcher });
  const server = Fastify();
  cleanup.push(() => server.close()); cleanup.push(() => source.revoke());
  await source.register(server);
  const config = await source.store.read();
  const headers = { authorization: `Bearer ${config.llm.apiKey}`, prefer: 'respond-async', 'idempotency-key': 'same-image' };
  try {
    const accepted = await server.inject({ method: 'POST', url: '/internal/krillin-llm/gateway/v1/images/generations', headers, payload: { model: 'test/image', prompt: 'test' } });
    expect(accepted.statusCode).toBe(202);
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    resume();
    const url = `/internal/krillin-llm/gateway/v1/requests/${accepted.json().requestId}`;
    await vi.waitFor(async () => expect((await server.inject({ url, headers })).json()).toMatchObject({ state: outcome === 'updated' ? 'succeeded' : 'failed' }));
    expect(recover).toHaveBeenCalledExactlyOnceWith('1');
    expect(fetcher).toHaveBeenCalledTimes(outcome === 'updated' ? 2 : 1);
  } finally { resume(); }
});
