import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { registerImageGenerationRoutes } from '../../src/api/routes.image-generation.js';
import { registerVideoGenerationRoutes } from '../../src/api/routes.video-generation.js';
import { createProviderOperationLedger } from '../../src/creator/provider-operations.js';
import { createImageGenerationService } from '../../src/image-generation/service.js';
import { openRuntimeDatabase } from '../../src/storage/database.js';
import { createVideoGenerationService } from '../../src/video-generation/service.js';

let root = '';
const close: Array<() => Promise<void>> = [];
async function createPngFixture() {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: '#cc8844' }
  }).png().toBuffer();
}

afterEach(async () => {
  for (const stop of close.splice(0).reverse()) await stop();
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

function setup() {
  root = mkdtempSync(join(tmpdir(), 'muse2api-api-'));
  const db = openRuntimeDatabase(join(root, 'runtime.sqlite'));
  const config = createDefaultCreatorServicesConfig();
  config.muse2api.apiKey = 'mock-secret';
  const configStore = {
    read: async () => config,
    write: async (next: typeof config) => next,
    reset: async () => createDefaultCreatorServicesConfig()
  };
  return { db, configStore, ledger: createProviderOperationLedger({ db }) };
}

describe('Muse2API standalone generation routes', () => {
  it('accepts Idempotency-Key for Muse Image and persists the operation before POST', async () => {
    const context = setup();
    const png = await createPngFixture();
    close.push(async () => { context.db.close(); });
    const server = Fastify({ logger: false });
    close.push(() => server.close());
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'route_image_task', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'route_image_task', status: 'completed', data: [{ url: '/v1/media/image.png' }] })))
      .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/png' } }));
    await registerImageGenerationRoutes(server, createImageGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl,
      pollIntervalMs: 0
    }));

    const response = await server.inject({
      method: 'POST',
      url: '/image-generation/results',
      headers: { 'idempotency-key': 'muse-image-route-operation-001' },
      payload: {
        prompt: 'route image', provider: 'muse2api', size: '1024x1024', quality: 'medium', count: 1
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().result.id).toBe('muse-image-route-operation-001');
    expect(context.ledger.get('muse-image-route-operation-001')).toMatchObject({
      status: 'succeeded', remoteTaskId: 'route_image_task', scope: 'standalone-image'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('accepts Idempotency-Key for Muse Video and stores the remote id before returning', async () => {
    const context = setup();
    close.push(async () => { context.db.close(); });
    const server = Fastify({ logger: false });
    close.push(() => server.close());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'route_video_task', status: 'queued' }), { status: 202 }));
    await registerVideoGenerationRoutes(server, createVideoGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    }));

    const response = await server.inject({
      method: 'POST',
      url: '/video-generation/results',
      headers: { 'idempotency-key': 'muse-video-route-operation-001' },
      payload: {
        prompt: 'route video', provider: 'muse2api', model: 'muse-video', size: '1280x720', duration: 5
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().result).toMatchObject({ id: 'muse-video-route-operation-001', status: 'queued' });
    expect(context.ledger.get('muse-video-route-operation-001')).toMatchObject({
      status: 'waiting_remote', remoteTaskId: 'route_video_task', scope: 'standalone-video'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
