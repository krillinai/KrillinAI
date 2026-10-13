import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createMuse2ApiClient } from '../../src/creator-services/muse2api.js';

function response(payload: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(payload), { status, headers });
}

describe('Muse2API client', () => {
  it('uses plain Chat Completions for Muse Spark without sending tool protocol fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => response({
      choices: [{ message: { role: 'assistant', content: 'A plain answer' } }]
    }));
    const client = createMuse2ApiClient({
      baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret', fetchImpl
    });

    await expect(client.chat([{ role: 'user', content: 'hello' }], 'muse-spark', new AbortController().signal))
      .resolves.toBe('A plain answer');
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({ redirect: 'manual' });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'muse-spark', messages: [{ role: 'user', content: 'hello' }], stream: false
    });
    expect(JSON.stringify(JSON.parse(String(init?.body)))).not.toContain('tools');
  });

  it('submits Muse Image with a stable idempotency key and polls the same task id', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ id: 'image-task-1', status: 'queued' }, 202))
      .mockResolvedValueOnce(response({ id: 'image-task-1', status: 'completed', data: [{ url: '/v1/media/image.webp' }] }));
    const client = createMuse2ApiClient({ baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret', fetchImpl });
    const signal = new AbortController().signal;

    const taskId = await client.submitImage({
      prompt: 'edit', model: 'muse-image', aspectRatio: '3:2', referenceImage: 'data:image/png;base64,AA==', operationId: 'operation-image-0001', signal
    });
    const state = await client.pollImage(taskId, signal);

    expect(taskId).toBe('image-task-1');
    expect(state).toMatchObject({ status: 'completed', url: '/v1/media/image.webp' });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://127.0.0.1:18610/v1/images/tasks');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'Idempotency-Key': 'operation-image-0001' })
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: 'muse-image', size: '3:2', reference_image: 'data:image/png;base64,AA=='
    });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe('http://127.0.0.1:18610/v1/images/tasks/image-task-1');
  });

  it('submits and polls Muse Video for one local reference image', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ id: 'video-task-1', status: 'queued' }, 202))
      .mockResolvedValueOnce(response({ id: 'video-task-1', status: 'processing', progress: 45 }));
    const client = createMuse2ApiClient({ baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret', fetchImpl });
    const signal = new AbortController().signal;

    const id = await client.submitVideo({
      prompt: 'animate', model: 'muse-video', duration: 5, aspectRatio: '9:16',
      referenceImage: 'data:image/jpeg;base64,AA==', signal
    });
    const state = await client.pollVideo(id, signal);

    expect(state).toMatchObject({ status: 'processing', progress: 45 });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      prompt: 'animate', model: 'muse-video', duration: 5, size: '9:16',
      reference_image: 'data:image/jpeg;base64,AA=='
    });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe('http://127.0.0.1:18610/v1/videos/video-task-1');
  });

  it('never follows redirects or sends the gateway key to an output URL on another origin', async () => {
    const fetchImpl = vi.fn(async () => response({ url: 'https://attacker.example/collect' }));
    const client = createMuse2ApiClient({ baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret', fetchImpl });

    await expect(client.downloadMedia('https://attacker.example/collect', 'image', new AbortController().signal))
      .rejects.toThrow(/origin/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('downloads same-origin media without forwarding the API key and rejects redirect responses', async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#cc8844' }
    }).png().toBuffer();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(png, {
      headers: { 'content-type': 'image/png' }
    }));
    const client = createMuse2ApiClient({ baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret', fetchImpl });

    await expect(client.downloadMedia('/v1/media/image.png', 'image', new AbortController().signal))
      .resolves.toMatchObject({ content: png, mime: 'image/png' });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');

    const redirecting = createMuse2ApiClient({
      baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret',
      fetchImpl: vi.fn<typeof fetch>(async (_input, _init) => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:1/internal' } }))
    });
    await expect(redirecting.downloadMedia('/v1/media/image.png', 'image', new AbortController().signal))
      .rejects.toThrow(/redirect/i);
  });

  it.each(['application/octet-stream', 'image/webp'])('accepts validated WebP output with %s', async contentType => {
    const webp = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#cc8844' }
    }).webp().toBuffer();
    const client = createMuse2ApiClient({
      baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret',
      fetchImpl: vi.fn(async () => new Response(webp, { headers: { 'content-type': contentType } }))
    });

    await expect(client.downloadMedia('/v1/media/image.webp', 'image', new AbortController().signal))
      .resolves.toEqual({ content: webp, mime: 'image/webp' });
  });

  it.each([
    ['octet-stream HTML error body', Buffer.from('<html>gateway error</html>'), 'application/octet-stream'],
    ['HTML body advertising WebP', Buffer.from('<html>gateway error</html>'), 'image/webp'],
    ['JSON error body', Buffer.from('{"error":"upstream failed"}'), 'application/octet-stream']
  ])('rejects %s even when returned as image media', async (_name, bytes, contentType) => {
    const client = createMuse2ApiClient({
      baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret',
      fetchImpl: vi.fn(async () => new Response(bytes, { headers: { 'content-type': contentType } }))
    });

    await expect(client.downloadMedia('/v1/media/image.webp', 'image', new AbortController().signal))
      .rejects.toThrow(/image|media|invalid/i);
  });

  it('rejects a truncated WebP with an otherwise valid signature', async () => {
    const webp = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#cc8844' }
    }).webp().toBuffer();
    const truncated = webp.subarray(0, -5);
    const client = createMuse2ApiClient({
      baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret',
      fetchImpl: vi.fn(async () => new Response(truncated, { headers: { 'content-type': 'application/octet-stream' } }))
    });

    await expect(client.downloadMedia('/v1/media/image.webp', 'image', new AbortController().signal))
      .rejects.toThrow(/truncated|invalid/i);
  });

  it('rejects media whose declared size exceeds the image limit before reading its body', async () => {
    const fetchImpl = vi.fn(async () => new Response(Buffer.from('tiny'), {
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(30 * 1024 * 1024 + 1) }
    }));
    const client = createMuse2ApiClient({ baseUrl: 'http://127.0.0.1:18610/v1', apiKey: 'secret', fetchImpl });

    await expect(client.downloadMedia('/v1/media/image.webp', 'image', new AbortController().signal))
      .rejects.toThrow(/large|invalid|size/i);
  });
});
