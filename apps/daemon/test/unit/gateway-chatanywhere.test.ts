import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import { createGatewayClient } from '../../src/gateway/client.js';
import { createDirectTransport } from '../../src/gateway/direct-transport.js';
import { chatAnywhereTranscription } from '../../src/gateway/chatanywhere-media.js';
import { createDirectRuntime } from '../../src/gateway/direct-runtime.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const domestic = 'https://api.chatanywhere.tech/v1';
const overseas = 'https://api.chatanywhere.org/v1';
const whisper: GatewayModel = { id: 'whisper-1', modality: 'transcription', capabilities: ['transcription_text', 'subtitle_timestamps'] };
const image: GatewayModel = { id: 'gpt-image-1', modality: 'image', capabilities: ['generate', 'edit'], imageOptions: { maxImages: 1, maxReferences: 16, aspectRatios: ['3:2'], resolutions: ['1K'] } };
async function fixture(fetcher: typeof fetch, baseUrl = domestic, recover?: Parameters<typeof createDirectTransport>[2]) {
  const root = await mkdtemp(join(tmpdir(), 'oc-chatanywhere-')); roots.push(root);
  return { transport: createDirectTransport(root, fetcher, recover), input: { account: 'a', baseUrl, key: 'private-ca', method: 'POST', contentType: 'application/json', identity: 'one', fingerprint: 'fingerprint', signal: AbortSignal.timeout(5000) } };
}
async function multipart(form: FormData) {
  const request = new Request('http://localhost', { method: 'POST', body: form });
  return { body: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get('content-type')! };
}
async function audio(format = 'verbose_json') {
  const form = new FormData(); form.set('model', 'whisper-1'); form.set('response_format', format);
  form.set('timestamp_granularities[]', 'segment'); form.set('file', new Blob(['sample'], { type: 'audio/wav' }), 'sample.wav');
  return multipart(form);
}

it.each([domestic, overseas])('accepts only the paired ChatAnywhere base (%s)', async baseUrl => {
  const bootstrap = { schemaVersion: 2, supplier: 'chatanywhere', transport: 'supplier-direct', keyRotation: false, modelUsePolicy: 'cached-key-v1', account: { id: 'a', email: 'a@test', verified: true }, modelKey: 'private-ca', keyVersion: 'one', bindingVersion: 'a:chatanywhere:one', baseUrl, models: [whisper], defaults: { transcription: 'whisper-1' } };
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(bootstrap));
  const client = createGatewayClient('https://gateway.example', fetcher);
  expect((await client.bootstrap('device', { rotate: false, region: 'overseas' })).baseUrl).toBe(baseUrl);
  expect(String(fetcher.mock.lastCall?.[0])).toContain('region=overseas');
  bootstrap.supplier = '88api';
  await expect(client.bootstrap('device')).rejects.toMatchObject({ code: 'invalid_gateway_response' });
});

it.each([domestic, overseas])('uses native STT and preserves real subtitle timestamps (%s)', async baseUrl => {
  const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
    const form = await new Request('http://localhost', { method: 'POST', headers: options?.headers, body: options?.body }).formData();
    expect(form.get('model')).toBe('whisper-1'); expect(form.has('timestamp_granularities[]')).toBe(false);
    expect(form.get('response_format')).toBe('verbose_json'); expect(form.get('file')).toBeInstanceOf(File);
    return Response.json({ text: 'hello', segments: [{ text: 'hello', start: 0, end: 0.5 }] });
  });
  const f = await fixture(fetcher, baseUrl);
  const response = await f.transport.request({ ...f.input, ...await audio(), model: whisper, resource: 'audio/transcriptions' });
  expect((await response.json()).segments[0]).toEqual({ text: 'hello', start: 0, end: 0.5 });
  expect(fetcher.mock.lastCall?.[0]).toBe(`${baseUrl}/audio/transcriptions`);
});

it('rejects missing timestamps and does not resubmit an ambiguous transcription', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ text: 'hello' }));
  const f = await fixture(fetcher); const input = { ...f.input, ...await audio(), model: whisper, resource: 'audio/transcriptions' };
  await expect(f.transport.request(input)).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  await expect(f.transport.request(input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('rejects word granularity and unsupported non-JSON transcription before inference', async () => {
  const value = await audio('srt');
  await expect(chatAnywhereTranscription(value.body, value.contentType)).rejects.toMatchObject({ code: 'capability_unsupported' });
  const form = new FormData(); form.set('model', 'whisper-1'); form.set('timestamp_granularities[]', 'word'); form.set('file', new Blob(['sample']), 'a.wav');
  const words = await multipart(form);
  await expect(chatAnywhereTranscription(words.body, words.contentType)).rejects.toMatchObject({ code: 'capability_unsupported' });
});

it('keeps image edits multipart and generation native', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] }));
  const f = await fixture(fetcher);
  await f.transport.request({ ...f.input, model: image, resource: 'images/generations', body: { model: image.id, prompt: 'test', aspect_ratio: '3:2', resolution: '1K' } });
  expect(fetcher.mock.lastCall?.[0]).toBe(`${domestic}/images/generations`);
  expect(JSON.parse(String(fetcher.mock.lastCall?.[1]?.body))).toMatchObject({ model: image.id, size: '1536x1024' });
  const form = new FormData(); form.set('model', image.id); form.set('prompt', 'edit'); form.set('image', new Blob(['image'], { type: 'image/png' }), 'a.png');
  await f.transport.request({ ...f.input, ...await multipart(form), identity: 'edit', model: image, resource: 'images/edits' });
  expect(fetcher.mock.lastCall?.[0]).toBe(`${domestic}/images/edits`);
  const options = fetcher.mock.lastCall?.[1];
  const native = await new Request('http://localhost', { method: 'POST', headers: options?.headers, body: options?.body }).formData();
  expect(native.get('image')).toBeInstanceOf(File); expect(native.has('input_references')).toBe(false);
});

it('downloads documented image results without forwarding the supplier key', async () => {
  const media = 'https://oaidalleapiprodscus.blob.core.windows.net/images/result.png?sig=signed';
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    if (url === media) { expect(new Headers(options?.headers).has('authorization')).toBe(false); return new Response('image', { headers: { 'Content-Type': 'image/png' } }); }
    return Response.json({ data: [{ url: media }] });
  });
  const f = await fixture(fetcher);
  const response = await f.transport.request({ ...f.input, model: image, resource: 'images/generations', body: { model: image.id, prompt: 'test' } });
  expect(await response.json()).toMatchObject({ data: [{ b64_json: 'aW1hZ2U=' }] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('rejects video and untrusted image hosts without forwarding credentials', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [{ url: 'https://untrusted.test/image.png' }] }));
  const f = await fixture(fetcher);
  await expect(f.transport.request({ ...f.input, resource: 'video/jobs', body: {} })).rejects.toMatchObject({ code: 'capability_unsupported' });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(f.transport.request({ ...f.input, resource: 'images/generations', model: image, body: { model: image.id, prompt: 'test' } })).rejects.toMatchObject({ code: 'unsupported_media_origin' });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('rejects stale runtime credentials after a supplier change', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const release = vi.fn(async () => undefined);
  const runtime = await createDirectRuntime('old-key', fetcher, async () => ({ key: 'new-key', baseUrl: overseas, release }), undefined, 'https://api.88api.ai/v1');
  try {
    const response = await fetch(`${runtime.baseUrl}/responses`, { method: 'POST', headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4.1-mini', input: 'hello' }) });
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: 'supplier_binding_changed' } });
    expect(fetcher).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
  } finally { await runtime.close(); }
});

it('does not resubmit an old failed receipt to another supplier or route', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ error: { message: 'Insufficient balance' } }, { status: 402 }));
  const f = await fixture(fetcher);
  const input = { ...f.input, resource: 'images/generations', model: image, body: { model: image.id, prompt: 'test' } };
  await expect(f.transport.request(input)).rejects.toMatchObject({ status: 402 });
  await expect(f.transport.request({ ...input, baseUrl: overseas })).rejects.toMatchObject({ code: 'operation_conflict' });
  await expect(f.transport.request({ ...input, baseUrl: 'https://api.88api.ai/v1' })).rejects.toMatchObject({ code: 'operation_conflict' });
  expect(fetcher).toHaveBeenCalledOnce();
});
