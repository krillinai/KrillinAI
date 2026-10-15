import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import { bootstrapSchema, createGatewayClient } from '../../src/gateway/client.js';
import { createDirectTransport } from '../../src/gateway/direct-transport.js';
import { createDirectRuntime } from '../../src/gateway/direct-runtime.js';
import { createOfficialModelAccess } from '../../src/gateway/model-access.js';
import { downloadSupplierMedia } from '../../src/gateway/supplier-media.js';

const baseUrl = 'https://api.88api.ai/v1';
const bootstrap = { schemaVersion: 2, supplier: '88api', transport: 'supplier-direct', keyRotation: false, modelUsePolicy: 'cached-key-v1',
  account: { id: 'account', email: 'a@test', verified: true }, modelKey: 'private-inference-key', keyVersion: 'v1', bindingVersion: 'binding', baseUrl,
  models: [{ id: 'gpt-5.5', modality: 'text', capabilities: ['responses', 'chat'] }], defaults: { text: 'gpt-5.5' } };
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(fetcher: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), 'oc-88api-')); roots.push(root);
  const input = { account: 'account', baseUrl, key: 'private-inference-key', resource: 'images/generations', method: 'POST', body: {},
    contentType: 'application/json', identity: 'request', fingerprint: 'fingerprint', signal: AbortSignal.timeout(5_000) };
  return { root, transport: createDirectTransport(root, fetcher), input };
}

it('accepts a v2 stable 88API binding and rejects supplier/host/protocol mismatches', async () => {
  const fetcher = vi.fn(async () => Response.json(bootstrap));
  expect(await createGatewayClient('https://gateway.test', fetcher).bootstrap('device')).toMatchObject({ supplier: '88api', baseUrl });
  for (const patch of [{ baseUrl: 'https://gateway.test/v1' }, { supplier: 'openrouter' }, { schemaVersion: 1 }, { keyRotation: true }]) {
    expect(bootstrapSchema.safeParse({ ...bootstrap, ...patch }).success).toBe(false);
  }
});

it('uses only the supplier account catalog and intersects exact configured profiles without paid inference', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ id: 'gpt-5.5' }, { id: 'unconfigured' }] }));
  const f = await fixture(fetcher);
  const access = createOfficialModelAccess({ dataDir: f.root, fetcher, readProxy: async () => '' });
  const prepared = await access.prepare(bootstrapSchema.parse(bootstrap));
  expect(prepared.models.map(model => model.id)).toEqual(['gpt-5.5']);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/models`, expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer private-inference-key' } }));
  await access.prepare(bootstrapSchema.parse(bootstrap));
  expect(fetcher).toHaveBeenCalledOnce();
});

it('streams Responses tools through the local runtime to 88API with an isolated key', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('data: {"type":"response.completed","response":{"status":"completed"}}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  const runtime = await createDirectRuntime('private-inference-key', fetcher, undefined, undefined, baseUrl);
  try {
    const response = await fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.5', input: 'test', stream: true, store: true, tools: [{ type: 'function', name: 'test' }] }) });
    expect(await response.text()).toContain('response.completed');
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${baseUrl}/responses`);
    const options = fetcher.mock.calls[0]?.[1];
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer private-inference-key' });
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(String(options?.body))).toMatchObject({ store: false, tools: [{ name: 'test' }] });
    expect(String(options?.body)).not.toContain(runtime.token);
  } finally { await runtime.close(); }
});

it('converts GPT image controls to native parameters and replays locally', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] }));
  const f = await fixture(fetcher);
  const model: GatewayModel = { id: 'gpt-image-2', modality: 'image', capabilities: ['edit'], imageOptions: { maxImages: 1, maxReferences: 1, aspectRatios: ['3:2'], resolutions: ['1K'], qualities: ['high'] } };
  const input = { ...f.input, model, body: { model: model.id, prompt: 'test', aspect_ratio: '3:2', resolution: '1K', quality: 'high' } };
  expect(await (await f.transport.request(input)).json()).toMatchObject({ data: [{ b64_json: 'aW1hZ2U=' }] });
  expect(fetcher.mock.calls[0]?.[0]).toBe(`${baseUrl}/images/generations`);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ model: model.id, prompt: 'test', n: 1, size: '1536x1024', quality: 'high', response_format: 'b64_json' });
  await f.transport.request(input);
  expect(fetcher).toHaveBeenCalledOnce();
  const form = new FormData(); form.set('model', model.id); form.set('prompt', 'edit'); form.set('aspect_ratio', '3:2'); form.set('image', new Blob(['image'], { type: 'image/png' }), 'reference.png');
  const request = new Request('http://localhost', { method: 'POST', body: form });
  await f.transport.request({ ...input, resource: 'images/edits', identity: 'edit', contentType: request.headers.get('content-type')!, body: Buffer.from(await request.arrayBuffer()) });
  const options = fetcher.mock.lastCall?.[1];
  const sent = await new Request('http://localhost', { method: 'POST', headers: options?.headers, body: options?.body }).formData();
  expect(fetcher.mock.lastCall?.[0]).toBe(`${baseUrl}/images/edits`);
  expect(sent.get('size')).toBe('1536x1024'); expect(sent.has('aspect_ratio')).toBe(false);
  expect(await (sent.get('image') as File).text()).toBe('image');
});

it('recovers a queued video after restart and downloads its result without supplier credentials', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url) => String(url).startsWith('https://assets.88api.ai/')
    ? new Response('video', { headers: { 'content-type': 'video/mp4' } })
    : Response.json({ id: 'video-123', status: String(url).endsWith('/videos') ? 'queued' : 'completed', url: 'https://assets.88api.ai/video.mp4' }));
  const f = await fixture(fetcher);
  const model: GatewayModel = { id: 'sora-2', modality: 'video', capabilities: ['image_to_video'], durations: [5], sizes: ['1280x720'] };
  const input = { ...f.input, model, resource: 'video/jobs', body: { model: model.id, prompt: 'test', duration: 5, size: '1280x720', image: 'https://assets.88api.ai/input.png' } };
  const { requestId } = await (await f.transport.request(input)).json();
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ images: ['https://assets.88api.ai/input.png'] });
  const recovered = createDirectTransport(f.root, fetcher);
  await expect(recovered.request({ ...input, baseUrl: 'https://openrouter.ai/api/v1', resource: `requests/${requestId}`, method: 'GET' })).rejects.toMatchObject({ code: 'operation_conflict' });
  await recovered.request({ ...input, resource: `requests/${requestId}`, method: 'GET' });
  const result = await recovered.request({ ...input, resource: `requests/${requestId}/result`, method: 'GET' });
  expect(await result.text()).toBe('video');
  expect(fetcher.mock.lastCall?.[1]?.headers).toEqual({});
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes('openrouter') && !String(url).includes('/content'))).toBe(true);
});

it('rejects media redirect escapes and oversized results without forwarding any credentials', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: 'https://untrusted.test/result' } }));
  await expect(downloadSupplierMedia(fetcher, 'https://assets.88api.ai/image.png', AbortSignal.timeout(1000))).rejects.toMatchObject({ code: 'unsupported_media_origin' });
  expect(fetcher).toHaveBeenCalledOnce();
  const result = await downloadSupplierMedia(async () => new Response('too big'), 'https://assets.88api.ai/image.png', AbortSignal.timeout(1000), 2);
  await expect(result.arrayBuffer()).rejects.toMatchObject({ code: 'invalid_gateway_response' });
});

it('requests native WAV speech and rejects unsupported audio or image parameters before spending', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('wave', { headers: { 'content-type': 'audio/wav' } }));
  const f = await fixture(fetcher);
  await f.transport.request({ ...f.input, resource: 'audio/speech', body: { model: 'gemini-3.1-tts', input: 'hello', voice: 'Kore' } });
  expect(JSON.parse(String(fetcher.mock.lastCall?.[1]?.body))).toMatchObject({ response_format: 'wav', voice: 'Kore' });
  await expect(f.transport.request({ ...f.input, identity: 'long', resource: 'audio/speech', body: { model: 'gemini-3.1-tts', input: 'x'.repeat(8001) } })).rejects.toMatchObject({ code: 'capability_unsupported' });
  await expect(f.transport.request({ ...f.input, identity: 'timestamps', resource: 'audio/transcriptions', body: { response_format: 'verbose_json' } })).rejects.toMatchObject({ code: 'capability_unsupported' });
  await expect(f.transport.request({ ...f.input, identity: 'gemini-image', body: { model: 'gemini-image', prompt: 'test', n: 2 } })).rejects.toMatchObject({ code: 'capability_unsupported' });
  expect(fetcher).toHaveBeenCalledOnce();
});
