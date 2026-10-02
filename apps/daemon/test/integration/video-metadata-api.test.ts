import Fastify, { type FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../../src/api/server.js';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerVideoMetadataRoutes } from '../../src/api/routes.video-metadata.js';
import {
  createVideoMetadataService,
  VideoMetadataError
} from '../../src/video-metadata/service.js';

describe('video metadata API', () => {
  let server: FastifyInstance;

  beforeEach(() => {
    server = Fastify({ logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns normalized YouTube title information without fetching the submitted URL', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      title: '  A useful video title  ',
      author_name: 'Creator name',
      width: 1920,
      height: 1080
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await registerVideoMetadataRoutes(server, createVideoMetadataService({
      fetchImpl: fetchImpl as typeof fetch
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/video-metadata?url=https%3A%2F%2Fyoutu.be%2Fvideo_123%3Fsi%3Dshare-token'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      platform: 'youtube',
      title: 'A useful video title',
      authorName: 'Creator name',
      thumbnailUrl: 'https://i.ytimg.com/vi/video_123/hqdefault.jpg',
      width: 1920,
      height: 1080
    });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://www.youtube.com/oembed');
    expect(requestedUrl.searchParams.get('url')).toBe('https://www.youtube.com/watch?v=video_123');
  });

  it('rejects unsupported links without making an upstream request', async () => {
    const fetchImpl = vi.fn();
    await registerVideoMetadataRoutes(server, createVideoMetadataService({
      fetchImpl: fetchImpl as typeof fetch
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/video-metadata?url=https%3A%2F%2Fexample.com%2Fvideo'
    });

    expect(response.statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns title information for a Bilibili video', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      code: 0,
      data: {
        title: 'Bilibili video title',
        owner: { name: 'Bilibili creator' },
        pic: 'https://i0.hdslb.com/bfs/archive/example.jpg',
        dimension: { width: 1080, height: 1920, rotate: 0 }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await registerVideoMetadataRoutes(server, createVideoMetadataService({
      fetchImpl: fetchImpl as typeof fetch
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/video-metadata?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1xx411c7mD'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      platform: 'bilibili',
      title: 'Bilibili video title',
      authorName: 'Bilibili creator',
      width: 1080,
      height: 1920
    });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://api.bilibili.com/x/web-interface/view');
    expect(requestedUrl.searchParams.get('bvid')).toBe('BV1xx411c7mD');
  });

  it('normalizes rotated Bilibili dimensions', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: {
        title: 'Rotated video',
        dimension: { width: 1920, height: 1080, rotate: 90 }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await registerVideoMetadataRoutes(server, createVideoMetadataService({
      fetchImpl: fetchImpl as typeof fetch
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/video-metadata?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1xx411c7mD'
    });

    expect(response.json()).toMatchObject({ width: 1080, height: 1920 });
  });

  it.each([undefined, 1, 2, 3])('returns Bilibili parts and the requested selection: %s', async partIndex => {
    const pages = [1, 2, 3].map(index => ({
      page: index, part: `Lesson ${index}`, cid: 1000 + index, duration: 60 * index,
      dimension: index === 3 ? { width: 1920, height: 1080, rotate: 90 } : { width: 1920, height: 1080, rotate: 0 }
    }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: { title: 'Course', pages } })));
    await registerVideoMetadataRoutes(server, createVideoMetadataService({ fetchImpl }));
    const url = `https://www.bilibili.com/video/BV18E421w7bf/${partIndex === undefined ? '' : `?p=${partIndex}`}`;
    const response = await server.inject({ method: 'GET', url: `/video-metadata?${new URLSearchParams({ url })}` });
    expect(response.statusCode).toBe(200);
    const metadata = response.json();
    expect(metadata.parts).toHaveLength(3);
    if (partIndex === undefined) {
      expect(metadata.selectedPart).toBeUndefined();
      expect(metadata.width).toBeUndefined();
    } else {
      expect(metadata.selectedPart).toMatchObject({ index: partIndex, title: `Lesson ${partIndex}`, cid: 1000 + partIndex });
      expect(metadata.width).toBe(partIndex === 3 ? 1080 : 1920);
    }
  });

  it('rejects an out-of-range Bilibili part instead of falling back to P1', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: {
      title: 'Course', pages: [{ page: 1, part: 'Lesson 1' }]
    } })));
    await registerVideoMetadataRoutes(server, createVideoMetadataService({ fetchImpl }));
    const url = 'https://www.bilibili.com/video/BV18E421w7bf?p=3';
    const response = await server.inject({ method: 'GET', url: `/video-metadata?${new URLSearchParams({ url })}` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain('分 P 3 不存在');
  });

  it('registers production metadata and prevents a multipart task from bypassing selection', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'video-metadata-server-'));
    const get = vi.fn(async () => ({ platform: 'bilibili' as const, title: 'Course',
      parts: [1, 2, 3].map(index => ({ index, title: `Lesson ${index}` })) }));
    const run = vi.fn(async () => ({ outputs: [] }));
    const config = createDefaultCreatorServicesConfig();
    config.llm.source = 'codex';
    await server.close();
    try {
      server = await buildServer({ token: 'secret', dataDir, codexHome: join(dataDir, 'codex-home'),
        creatorExecutors: [{ id: 'krillinai', run }], videoMetadataService: { get },
        creatorServicesConfigStore: { read: async () => config, write: async value => value, reset: async () => config } });
      const url = 'https://www.bilibili.com/video/BV18E421w7bf?p=3';
      const response = await server.inject({ method: 'GET', url: `/video-metadata?${new URLSearchParams({ url })}`,
        headers: { authorization: 'Bearer secret' } });
      expect(response.statusCode).toBe(200);
      expect(get).toHaveBeenCalledWith(url);
      expect(response.json()).toMatchObject({ platform: 'bilibili', title: 'Course' });
      const created = await server.inject({ method: 'POST', url: '/creator/jobs',
        headers: { authorization: 'Bearer secret' }, payload: {
          projectId: 'bilibili-parts', templateId: 'video-translation',
          state: { sourceType: 'url', sourceUrl: 'https://www.bilibili.com/video/BV18E421w7bf' }
        } });
      expect(created.statusCode).toBe(201);
      const job = created.json().job;
      const started = await server.inject({ method: 'POST', url: `/creator/jobs/${job.id}/actions`,
        headers: { authorization: 'Bearer secret' }, payload: {
          action: 'run-stage', expectedRevision: job.revision, input: { stageId: 'subtitle', workflow: true }
        } });
      expect(started.statusCode).toBe(400);
      expect(started.json().error.code).toBe('creator_source_part_required');
      expect(run).not.toHaveBeenCalled();
      const snapshot = await server.inject({ method: 'GET', url: `/creator/jobs/${job.id}`, headers: { authorization: 'Bearer secret' } });
      expect(snapshot.json().job.stages).toHaveLength(0);
    } finally {
      await server.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('reuses the collection metadata while validating different parts', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: {
      title: 'Course', pages: [1, 2, 3].map(index => ({ page: index, part: `Lesson ${index}` }))
    } })));
    const service = createVideoMetadataService({ fetchImpl });
    await service.get('https://www.bilibili.com/video/BV18E421w7bf');
    expect((await service.get('https://www.bilibili.com/video/BV18E421w7bf?p=3')).selectedPart?.index).toBe(3);
    await expect(service.get('https://www.bilibili.com/video/BV18E421w7bf?p=4')).rejects.toMatchObject({ code: 'INVALID_PART' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps unavailable upstream metadata to a recoverable API error', async () => {
    await registerVideoMetadataRoutes(server, {
      async get() {
        throw new VideoMetadataError('UPSTREAM_ERROR', 'Video metadata request failed');
      }
    });

    const response = await server.inject({
      method: 'GET',
      url: '/video-metadata?url=https%3A%2F%2Fyoutu.be%2Fvideo_123'
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: 'VIDEO_METADATA_UNAVAILABLE',
        message: 'Video metadata request failed'
      }
    });
  });
});
