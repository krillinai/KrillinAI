import type { CreatorArtifact, CreatorJob } from '@opencreator/protocol';
import Fastify, { type FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCreatorThumbnailRoutes } from '../../src/api/routes.creator-thumbnail.js';

let server: FastifyInstance | undefined;
afterEach(async () => { await server?.close(); vi.unstubAllGlobals(); });

describe('creator video thumbnail download', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('saves a %s thumbnail as JPG at its original dimensions', async format => {
    const bytes = await sharp({ create: { width: 16, height: 9, channels: 3, background: '#cc4433' } }).toFormat(format).toBuffer();
    const fetch = vi.fn(async () => new Response(bytes, { headers: { 'content-type': `image/${format}` } }));
    vi.stubGlobal('fetch', fetch);
    await setup(job());
    const response = await server!.inject('/creator/jobs/job/artifacts/probe/thumbnail');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-disposition']).toBe('attachment; filename="thumbnail.jpg"');
    expect(await sharp(response.rawPayload).metadata()).toMatchObject({ format: 'jpeg', width: 16, height: 9 });
    if (format === 'jpeg') expect(response.rawPayload).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith(new URL('https://i.ytimg.com/vi/demo/hqdefault.jpg'), expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }));
  });

  it('uses a white background for transparent thumbnails saved as JPG', async () => {
    const bytes = await sharp({ create: { width: 16, height: 9, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png' } })));
    await setup(job());
    const response = await server!.inject('/creator/jobs/job/artifacts/probe/thumbnail');
    expect(response.statusCode).toBe(200);
    const { data, info } = await sharp(response.rawPayload).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
  });

  it('rejects missing jobs and probes that do not belong to the requested job', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await setup(job());
    expect((await server!.inject('/creator/jobs/other/artifacts/probe/thumbnail')).statusCode).toBe(404);
    expect((await server!.inject('/creator/jobs/job/artifacts/other/thumbnail')).statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'source_video' }, { status: 'draft' }, { metadata: {} }
  ] satisfies Partial<CreatorArtifact>[])('rejects artifacts that cannot supply a thumbnail: %j', async patch => {
    const current = job(); current.artifacts[0] = { ...current.artifacts[0]!, ...patch };
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await setup(current);
    expect((await server!.inject('/creator/jobs/job/artifacts/probe/thumbnail')).statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    () => new Response('unavailable', { status: 403 }),
    () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
    () => new Response('invalid image', { headers: { 'content-type': 'image/jpeg' } })
  ])('returns a retryable error when the platform does not return an image', async upstream => {
    vi.stubGlobal('fetch', vi.fn(async () => upstream()));
    await setup(job());
    const response = await server!.inject('/creator/jobs/job/artifacts/probe/thumbnail');
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('VIDEO_METADATA_UNAVAILABLE');
  });

  it('rejects non-HTTP thumbnail URLs without requesting them', async () => {
    const current = job(); current.artifacts[0]!.metadata.thumbnailUrl = 'file:///private/image.png';
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await setup(current);
    expect((await server!.inject('/creator/jobs/job/artifacts/probe/thumbnail')).statusCode).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });
});

async function setup(current: CreatorJob) {
  server = Fastify();
  await registerCreatorThumbnailRoutes(server, { getJob: id => id === current.id ? current : undefined });
}

function job(): CreatorJob {
  const createdAt = '2026-10-12T00:00:00Z';
  return { id: 'job', projectId: 'project', templateId: 'video-download', templateVersion: 2,
    status: 'draft', revision: 0, presetOrigin: null, state: {}, agentThreadId: null,
    stages: [], providerRequests: [], activities: [], createdAt, updatedAt: createdAt,
    artifacts: [{ id: 'probe', jobId: 'job', kind: 'download_probe', version: 1, status: 'completed',
      path: '/tmp/probe.json', scopeKey: null, inputFingerprint: null, sha256: null,
      sourceArtifactIds: [], createdAt, metadata: { thumbnailUrl: 'https://i.ytimg.com/vi/demo/hqdefault.jpg' } }] };
}
