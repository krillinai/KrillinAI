import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import { createDirectTransport } from '../../src/gateway/direct-transport.js';
import { readPrivateJsonFile } from '../../src/config/private-json-file.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'oc-media-')); roots.push(root);
  const fetcher = vi.fn(async (_url: URL | RequestInfo, _options?: RequestInit) => Response.json({ id: 'gen-image-test', usage: { cost: 0.014 }, data: [{ b64_json: 'aW1hZ2U=' }] }, { headers: { 'x-request-id': 'upstream-request-test' } }));
  const transport = createDirectTransport(root, fetcher);
  const model: GatewayModel = { id: 'flux-3', modality: 'image', capabilities: [], imageOptions: { maxImages: 1, maxReferences: 0, aspectRatios: ['1:1'], resolutions: ['1K'] } };
  const input = { account: 'account', key: 'private-test-key', resource: 'images/generations', method: 'POST', body: { model: model.id, prompt: 'test', n: 1 }, contentType: 'application/json', identity: 'request', fingerprint: 'fingerprint', signal: AbortSignal.timeout(3_000), model };
  return { root, fetcher, transport, model, input };
}

it('reports an asynchronous image rejection after acceptance without making another submission', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ error: { message: 'Model unavailable in this country' } }, { status: 403 }));
  const onModelFailure = vi.fn(async () => undefined);
  const response = await f.transport.request({ ...f.input, asyncImage: true, onModelFailure });
  expect(response.status).toBe(202);
  await expect.poll(() => onModelFailure.mock.calls.length).toBe(1);
  expect(onModelFailure).toHaveBeenCalledWith(f.model.id, 'image', expect.objectContaining({ httpStatus: 403 }));
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('reports access failures from video polling with the saved exact model identity', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async url => Response.json(String(url).endsWith('/videos')
    ? { id: 'remote-video', status: 'pending' }
    : { id: 'remote-video', status: 'failed', error: { code: 403, message: 'Model unavailable in this country' } }));
  const model: GatewayModel = { id: 'vendor/video', modality: 'video', capabilities: [], sizes: ['1280x720'], durations: [5] };
  const onModelFailure = vi.fn(async () => undefined);
  const submitted = await f.transport.request({ ...f.input, resource: 'video/jobs', model, body: { model: model.id, prompt: 'test', size: '1280x720', duration: 5 }, onModelFailure });
  const { requestId } = await submitted.json();
  await f.transport.request({ ...f.input, resource: `requests/${requestId}`, method: 'GET', onModelFailure });
  expect(onModelFailure).toHaveBeenCalledWith(model.id, 'video', expect.objectContaining({ upstreamCode: '403' }));
  expect(f.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('records completed image delivery once and does not turn replay into a fresh success', async () => {
  const f = await fixture(); const onModelSuccess = vi.fn(async () => undefined);
  const result = await f.transport.request({ ...f.input, onModelSuccess });
  expect(result.status).toBe(200);
  expect(onModelSuccess).toHaveBeenCalledExactlyOnceWith(f.model.id, 'image', 'images/generations');
  await f.transport.request({ ...f.input, onModelSuccess });
  expect(f.fetcher).toHaveBeenCalledOnce();
  expect(onModelSuccess).toHaveBeenCalledOnce();
});

it.each([false, true])('records video success only after nonempty completed delivery (empty=%s)', async empty => {
  const f = await fixture(); const onModelSuccess = vi.fn(async () => undefined);
  f.fetcher.mockImplementation(async url => String(url).includes('/content?index=0')
    ? new Response(empty ? '' : 'video', { headers: { 'Content-Type': 'video/mp4' } })
    : Response.json({ id: 'remote-video', status: String(url).endsWith('/videos') ? 'pending' : 'completed' }));
  const model: GatewayModel = { id: 'vendor/video', modality: 'video', capabilities: [], sizes: ['1280x720'], durations: [5] };
  const input = { ...f.input, resource: 'video/jobs', model, body: { model: model.id, prompt: 'test', size: '1280x720', duration: 5 }, onModelSuccess };
  const { requestId } = await (await f.transport.request(input)).json();
  expect(onModelSuccess).not.toHaveBeenCalled();
  await f.transport.request({ ...input, resource: `requests/${requestId}`, method: 'GET' });
  expect(onModelSuccess).not.toHaveBeenCalled();
  const content = await f.transport.request({ ...input, resource: `requests/${requestId}/result`, method: 'GET' });
  if (empty) {
    await expect(content.text()).rejects.toMatchObject({ code: 'invalid_gateway_response' });
    expect(onModelSuccess).not.toHaveBeenCalled();
  } else {
    expect(await content.text()).toBe('video');
    expect(onModelSuccess).toHaveBeenCalledExactlyOnceWith(model.id, 'video', 'video/jobs');
  }
  expect(f.fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

it('omits undeclared output_format and uses declared formats for Klein', async () => {
  const f = await fixture();
  await f.transport.request(f.input);
  expect(JSON.parse(String(f.fetcher.mock.lastCall?.[1]?.body))).not.toHaveProperty('output_format');
  f.model.imageOptions!.outputFormats = ['jpeg'];
  await f.transport.request({ ...f.input, identity: 'klein' });
  expect(JSON.parse(String(f.fetcher.mock.lastCall?.[1]?.body))).toMatchObject({ output_format: 'jpeg' });
});

it.each([
  { output_format: 'png' }, { aspect_ratio: '16:9' }, { size: '1536x1024' }, { resolution: '4K' },
  { n: 2 }, { n: 0 }, { n: 1.5 }, { n: '1' }, { n: 11 }, { quality: 'high' }, { stream: true },
  { prompt: '' }, { prompt: null }, { input_references: 'invalid' }, { input_references: [{}] },
  { input_references: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }] }
])('rejects an unsupported image profile before spending: %j', async params => {
  const f = await fixture();
  await expect(f.transport.request({ ...f.input, body: { ...f.input.body, ...params } })).rejects.toMatchObject({ code: 'capability_unsupported', status: 400 });
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(await readdir(f.root)).toEqual([]);
});

it.each(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'])('honors the documented video submit status %s and uses the authenticated content endpoint', async status => {
  const f = await fixture();
  f.fetcher.mockImplementation(async url => String(url).includes('/content?index=0') ? new Response('video', { headers: { 'Content-Type': 'video/mp4' } }) : Response.json({ id: 'remote-video', status, error: 'provider failed: private-test-key', usage: { cost: 0.02 }, polling_url: 'https://untrusted.invalid/job' }));
  const model: GatewayModel = { id: 'video', modality: 'video', capabilities: ['image_to_video'], resolutions: ['480p'], aspectRatios: ['16:9'], durations: [1] };
  const response = await f.transport.request({ ...f.input, resource: 'video/jobs', model, body: { model: 'video', prompt: 'test', size: '480p@16:9', duration: 1, image: 'data:image/png;base64,aW1hZ2U=' } });
  expect(JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))).toEqual({ model: 'video', prompt: 'test', duration: 1, resolution: '480p', aspect_ratio: '16:9', frame_images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' }, frame_type: 'first_frame' }] });
  const state = status === 'completed' ? 'succeeded' : ['failed', 'cancelled', 'expired'].includes(status) ? 'failed' : 'waiting_upstream';
  expect(await response.clone().json()).toMatchObject({ state });
  const { requestId } = await response.json();
  const receipt = await readPrivateJsonFile(join(f.root, `${requestId}.json`));
  expect(receipt).toMatchObject({ state, reportedCostUsd: 0.02 });
  expect(JSON.stringify(receipt)).not.toContain('private-test-key');
  if (state === 'failed') expect(receipt).toMatchObject({ upstreamError: { upstreamMessage: 'provider failed: [redacted]' } });
  if (state === 'succeeded') {
    await f.transport.request({ ...f.input, method: 'GET', resource: `requests/${requestId}/result` });
    expect(f.fetcher.mock.lastCall?.[0]).toBe('https://openrouter.ai/api/v1/videos/remote-video/content?index=0');
    expect(f.fetcher.mock.lastCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer private-test-key' });
  }
});

it('preserves an accepted video ID when a malformed submit status needs read-only reconciliation', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ id: 'remote-video' }));
  const input = { ...f.input, resource: 'video/jobs', model: undefined, body: { model: 'video', prompt: 'test' } };
  await expect(f.transport.request(input)).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  const replay = await createDirectTransport(f.root, f.fetcher).request(input);
  expect(await replay.json()).toMatchObject({ state: 'outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('keeps model, upstream identifiers and reported cost with a replayable result', async () => {
  const f = await fixture();
  const response = await f.transport.request(f.input);
  const requestId = response.headers.get('x-request-id')!;
  expect(await readPrivateJsonFile(join(f.root, `${requestId}.json`))).toMatchObject({
    account: 'account', model: 'flux-3', operation: 'images/generations', state: 'succeeded',
    upstreamRequestId: 'upstream-request-test', upstreamGenerationId: 'gen-image-test', reportedCostUsd: 0.014,
    createdAt: expect.any(String), updatedAt: expect.any(String)
  });
  await createDirectTransport(f.root, f.fetcher).request(f.input);
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('retains bounded, redacted rejection evidence privately without exposing it in the receipt API', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ error: { code: 'unsupported_parameter', message: 'output_format is unsupported; api_key=private-test-key', metadata: { raw: 'should not be retained' } } }, { status: 400, headers: { 'x-request-id': 'failed-upstream-request' } }));
  await expect(f.transport.request(f.input)).rejects.toMatchObject({ status: 400 });
  const [name] = await readdir(f.root);
  const receipt = await readPrivateJsonFile(join(f.root, name!));
  expect(receipt).toMatchObject({ state: 'failed', upstreamRequestId: 'failed-upstream-request', upstreamError: { httpStatus: 400, upstreamCode: 'unsupported_parameter', upstreamMessage: expect.stringContaining('output_format') } });
  expect(JSON.stringify(receipt)).not.toContain('private-test-key');
  expect(JSON.stringify(receipt)).not.toContain('should not be retained');
  const status = await f.transport.request({ ...f.input, method: 'GET', resource: `requests/${name!.replace(/\.json$/, '')}` });
  expect(await status.text()).not.toContain('unsupported_parameter');
});

it('keeps server errors and interruptions unknown so they cannot trigger an automatic duplicate', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ error: { message: 'Upstream disconnected' } }, { status: 502 }));
  await expect(f.transport.request(f.input)).rejects.toMatchObject({ status: 503 });
  await expect(createDirectTransport(f.root, f.fetcher).request(f.input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('retains malformed HTTP 200 image responses and generation IDs for reconciliation', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ id: 'gen-bad-image', usage: { cost: 0.014 }, data: [] }));
  await expect(f.transport.request(f.input)).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  const [name] = await readdir(f.root);
  const receipt = await readPrivateJsonFile(join(f.root, name!)) as { content: string };
  expect(receipt).toMatchObject({ state: 'outcome_unknown', upstreamGenerationId: 'gen-bad-image', reportedCostUsd: 0.014, upstreamError: { upstreamCode: 'invalid_image_response' } });
  expect(JSON.parse(Buffer.from(receipt.content, 'base64').toString('utf8'))).toMatchObject({ id: 'gen-bad-image', data: [] });
  await expect(createDirectTransport(f.root, f.fetcher).request(f.input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('retains partial image response bytes and connection failure facts without retrying', async () => {
  const f = await fixture();
  const partial = '{"data":[';
  f.fetcher.mockImplementation(async () => {
    let sent = false;
    return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      if (!sent) { sent = true; controller.enqueue(new TextEncoder().encode(partial)); }
      else controller.error(new Error('Connection interrupted', { cause: { code: 'ECONNRESET' } }));
    } }), { headers: { 'Content-Type': 'application/json' } });
  });
  await expect(f.transport.request(f.input)).rejects.toThrow('Connection interrupted');
  const [name] = await readdir(f.root);
  const receipt = await readPrivateJsonFile(join(f.root, name!)) as { content: string };
  expect(receipt).toMatchObject({ state: 'outcome_unknown', status: 200, receivedBytes: partial.length, upstreamError: { kind: 'connection-reset', upstreamCode: 'ECONNRESET' } });
  expect(Buffer.from(receipt.content, 'base64').toString('utf8')).toBe(partial);
  await expect(createDirectTransport(f.root, f.fetcher).request(f.input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('blocks an unverified image-to-video operation before submitting', async () => {
  const f = await fixture();
  await expect(f.transport.request({ ...f.input, resource: 'video/jobs', model: { id: 'video', modality: 'video', capabilities: [], sizes: ['1280x720'], durations: [5] }, body: { model: 'video', prompt: 'test', size: '1280x720', duration: 5, image: 'data:image/png;base64,aW1hZ2U=' } })).rejects.toMatchObject({ code: 'capability_unsupported' });
  expect(f.fetcher).not.toHaveBeenCalled();
});
