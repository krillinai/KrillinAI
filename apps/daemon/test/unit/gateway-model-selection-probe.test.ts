import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import { createModelSelectionProbe } from '../../src/gateway/model-selection-probe.js';
import { modelProbeAudio } from '../../src/gateway/model-probe-audio.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const scope = { accountId: 'customer', modelKey: 'customer-model-key', keyVersion: '1', accessContext: 'exit-a',
  baseUrl: 'https://openrouter.ai/api/v1', transport: 'openrouter-direct' as const };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'model-selection-probe-'));
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).png().toBuffer();
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/responses')) return Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'model_probe', arguments: '{"ok":true}' }] });
    if (path.endsWith('/chat/completions')) return Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] });
    if (path.endsWith('/images')) return Response.json({ data: [{ b64_json: png.toString('base64') }] });
    if (path.endsWith('/audio/speech')) return new Response(new Uint8Array(modelProbeAudio()), { headers: { 'Content-Type': 'audio/wav' } });
    if (path.endsWith('/audio/transcriptions')) {
      const request = new Request('http://localhost', { method: 'POST', headers: options?.headers, body: options?.body });
      const form = await request.formData();
      expect(form.get('model')).toBe('test/transcription');
      expect(Buffer.from(await (form.get('file') as File).arrayBuffer()).subarray(0, 4).toString()).toBe('RIFF');
      return Response.json({ text: 'Hello.' });
    }
    if (path.endsWith('/videos')) return Response.json({ id: 'video-1', status: 'pending' });
    if (path.endsWith('/videos/video-1')) return Response.json({ id: 'video-1', status: 'completed' });
    if (path.endsWith('/videos/video-1/content')) return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { headers: { 'Content-Type': 'video/mp4' } });
    throw new Error(`Unexpected probe resource: ${path}`);
  });
  let proxy = '';
  const service = createModelSelectionProbe({ dataDir: root, fetcher, readProxy: async () => proxy, pollMs: 1, timeoutMs: 1000 });
  cleanup.push(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  return { service, fetcher, setProxy(value: string) { proxy = value; } };
}

it.each(['text', 'image', 'video', 'speech', 'transcription'] as const)('probes %s directly through OpenRouter with the same inference key', async modality => {
  const f = await fixture();
  const model: GatewayModel = { id: `test/${modality}`, modality, capabilities: ['responses'], durations: [4], sizes: ['1280x720'] };
  await f.service.probe(model, scope);
  expect(f.fetcher).toHaveBeenCalled();
  for (const [url, request] of f.fetcher.mock.calls) {
    expect(String(url)).toMatch(/^https:\/\/openrouter\.ai\/api\/v1\//);
    expect(new Headers(request?.headers).get('authorization')).toBe(`Bearer ${scope.modelKey}`);
  }
});

it.each([
  { ...scope, modelKey: '' },
  { ...scope, baseUrl: 'https://gateway.example/untrusted', transport: 'gateway' as const }
])('refuses invalid or non-direct credentials without calling another transport', async invalidScope => {
  const f = await fixture();
  await expect(f.service.probe({ id: 'test/text', modality: 'text', capabilities: ['responses'] }, invalidScope)).rejects.toMatchObject({ code: 'model_probe_unavailable' });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it('charges a gateway probe through the authenticated gateway endpoint', async () => {
  const f = await fixture();
  await f.service.probe({ id: 'gpt-4o-mini', modality: 'text', capabilities: ['responses'] }, { ...scope, transport: 'gateway', baseUrl: 'https://gateway.example/v1' });
  expect(f.fetcher).toHaveBeenCalledOnce();
  expect(f.fetcher.mock.calls[0]?.[0]).toBe('https://gateway.example/v1/responses');
  const headers = new Headers(f.fetcher.mock.calls[0]?.[1]?.headers);
  expect(headers.get('authorization')).toBe(`Bearer ${scope.modelKey}`);
  expect(headers.get('idempotency-key')).toBeTruthy();
});

it.each([401, 403, 402, 429, 500])('reports OpenRouter %s without retrying inference', async status => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(Response.json({ error: { code: status, message: 'Provider denied the request.' } }, { status }));
  const code = status === 401 ? 'model_probe_auth_required' : status === 402 ? 'model_probe_credits_insufficient' : status === 429 ? 'model_probe_unavailable' : 'model_probe_inconclusive';
  await expect(f.service.probe({ id: 'test/text', modality: 'text', capabilities: ['responses'] }, scope)).rejects.toMatchObject({ code, status: 503 });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it.each([400, 402, 404, 422, 429, 502])('keeps gateway probe error facts for HTTP %s without retrying inference', async status => {
  const f = await fixture();
  f.fetcher.mockResolvedValue(Response.json({ error: { code: 'upstream_rejected', upstreamCode: 'invalid_parameter',
    message: `Invalid temperature; ${scope.modelKey}`, requestId: 'ocreq_probe' } }, { status }));
  await expect(f.service.probe({ id: 'test/text', modality: 'text', capabilities: ['responses'] },
    { ...scope, transport: 'gateway', baseUrl: 'https://gateway.example/v1' })).rejects.toMatchObject({
      publicFacts: { httpStatus: status, upstreamCode: 'invalid_parameter', requestId: 'ocreq_probe', upstreamMessage: 'Invalid temperature; [redacted]' }
    });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('shares simultaneous checks and only reuses success for the same account, key, model, and proxy', async () => {
  const f = await fixture(); const model: GatewayModel = { id: 'test/text', modality: 'text', capabilities: ['responses'] };
  await Promise.all([f.service.probe(model, scope), f.service.probe(model, scope)]);
  expect(f.fetcher).toHaveBeenCalledOnce();
  await f.service.probe(model, scope); expect(f.fetcher).toHaveBeenCalledOnce();
  await f.service.probe(model, scope, true); expect(f.fetcher).toHaveBeenCalledTimes(2);
  f.setProxy('https://other-exit'); await f.service.probe(model, scope); expect(f.fetcher).toHaveBeenCalledTimes(3);
  await f.service.probe(model, { ...scope, keyVersion: '2' }); expect(f.fetcher).toHaveBeenCalledTimes(4);
  await f.service.probe(model, { ...scope, modelKey: 'replacement-key' }); expect(f.fetcher).toHaveBeenCalledTimes(5);
  await f.service.probe(model, { ...scope, accountId: 'other-account' }); expect(f.fetcher).toHaveBeenCalledTimes(6);
  await f.service.probe(model, { ...scope, accessContext: 'exit-b' }); expect(f.fetcher).toHaveBeenCalledTimes(7);
});

it('checks only the requested text interface and keeps their cached evidence separate', async () => {
  const f = await fixture(); const model: GatewayModel = { id: 'test/text', modality: 'text', capabilities: ['responses'] };
  await f.service.probe(model, scope);
  await f.service.probe(model, scope, false, { textApi: 'chat/completions' });
  expect(f.fetcher.mock.calls.map(([url]) => url)).toEqual([
    'https://openrouter.ai/api/v1/responses', 'https://openrouter.ai/api/v1/chat/completions'
  ]);
  await f.service.probe(model, scope, false, { textApi: 'chat/completions' });
  expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it('allows a reasoning model enough output budget to finish a Chat probe', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    return Response.json({ choices: [{ message: { content: body.max_tokens >= 256 ? 'OK' : '' },
      finish_reason: body.max_tokens >= 256 ? 'stop' : 'length' }] });
  });
  await expect(f.service.probe({ id: 'deepseek-v4.1-flash', modality: 'text', capabilities: ['responses', 'chat'] },
    { ...scope, transport: 'gateway', baseUrl: 'https://gateway.example/v1' }, false, { textApi: 'chat/completions' })).resolves.toBeUndefined();
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it.each([
  { status: 403, message: 'Provider Terms Of Service restriction', code: 'model_probe_failed' },
  { status: 429, message: 'Rate limit exceeded', code: 'model_probe_inconclusive' },
  { status: 500, message: 'Provider temporarily unavailable', code: 'model_probe_inconclusive' },
  { status: 403, message: 'Key limit exceeded', code: 'model_probe_inconclusive' }
])('classifies a failed video ($status, $message) without resubmitting its generation', async ({ status, message, code }) => {
  const f = await fixture();
  f.fetcher.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/videos')) return Response.json({ id: 'video-1', status: 'pending' });
    expect(options?.method).toBe('GET');
    return Response.json({ id: 'video-1', status: 'failed', error: { code: status, message } });
  });
  await expect(f.service.probe({ id: 'test/video', modality: 'video', capabilities: [], durations: [4], sizes: ['1280x720'] }, scope)).rejects.toMatchObject({ code });
  expect(f.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('does not count an incomplete tool response as a successful text probe', async () => {
  const f = await fixture(); f.fetcher.mockResolvedValue(Response.json({ status: 'incomplete', output: [] }));
  await expect(f.service.probe({ id: 'test/text', modality: 'text', capabilities: ['responses'] }, scope)).rejects.toMatchObject({ code: 'model_probe_inconclusive' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});
