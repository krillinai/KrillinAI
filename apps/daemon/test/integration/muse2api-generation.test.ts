import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { createProviderOperationLedger } from '../../src/creator/provider-operations.js';
import { createImageGenerationService } from '../../src/image-generation/service.js';
import { createVideoGenerationService } from '../../src/video-generation/service.js';
import { openRuntimeDatabase } from '../../src/storage/database.js';
import { createCreatorRepository } from '../../src/creator/repository.js';
import { createImageExecutor } from '../../src/creator/image/executor.js';
import { createVideoExecutor } from '../../src/creator/video/executor.js';
import { generateImageContents } from '../../src/image-generation/provider.js';

let root = '';
const dbs: ReturnType<typeof openRuntimeDatabase>[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

function setup() {
  root = mkdtempSync(join(tmpdir(), 'muse2api-generation-'));
  const path = join(root, 'runtime.sqlite');
  const db = openRuntimeDatabase(path);
  dbs.push(db);
  const ledger = createProviderOperationLedger({ db });
  const config = createDefaultCreatorServicesConfig();
  config.muse2api.baseUrl = 'http://127.0.0.1:18610/v1';
  config.muse2api.apiKey = 'muse-secret';
  return {
    path,
    ledger,
    config,
    configStore: {
      read: async () => config,
      write: async (next: typeof config) => next,
      reset: async () => createDefaultCreatorServicesConfig()
    }
  };
}

async function createPngFixture() {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: '#cc8844' }
  }).png().toBuffer();
}

describe('Muse2API image and video persistence', () => {
  it('persists Muse Image to a local artifact and idempotently returns it on duplicate operation', async () => {
    const context = setup();
    const png = await createPngFixture();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_image_task_1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_image_task_1', status: 'completed', data: [{ url: '/v1/media/image.png' }] })))
      .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/png' } }));
    const service = createImageGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const request = {
      operationId: 'muse-image-operation-001',
      prompt: 'A small fixture image',
      provider: 'muse2api' as const,
      size: '1024x1024' as const,
      quality: 'medium' as const,
      count: 1
    };

    const first = await service.generate(request);
    const duplicate = await service.generate(request);
    const stored = await service.read(first.id, 0);
    const operation = context.ledger.get(request.operationId);

    expect(first).toMatchObject({ id: request.operationId, provider: 'muse2api', model: 'muse-image', count: 1 });
    expect(duplicate).toEqual(first);
    expect(stored.content).toEqual(png);
    expect(operation).toMatchObject({ status: 'succeeded', remoteTaskId: 'muse_image_task_1' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('validates octet-stream Muse WebP by bytes and persists it as a local artifact', async () => {
    const context = setup();
    const webp = await sharp({
      create: { width: 3, height: 2, channels: 3, background: '#4488aa' }
    }).webp().toBuffer();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_image_webp_task', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_image_webp_task', status: 'completed', data: [{ url: '/v1/media/image.webp' }] })))
      .mockResolvedValueOnce(new Response(webp, { headers: { 'content-type': 'application/octet-stream' } }));
    const service = createImageGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const request = {
      operationId: 'muse-image-webp-operation-01',
      prompt: 'A WebP fixture image',
      provider: 'muse2api' as const,
      size: '1024x1024' as const,
      quality: 'medium' as const,
      count: 1
    };

    const generated = await service.generate(request);
    const afterRefresh = await service.get(generated.id);
    const stored = await service.read(afterRefresh.id, 0);

    expect(generated.images[0]).toMatchObject({ mime: 'image/webp', fileName: expect.stringMatching(/\.webp$/) });
    expect(stored.content).toEqual(webp);
    expect(context.ledger.get(request.operationId)).toMatchObject({
      status: 'succeeded', remoteTaskId: 'muse_image_webp_task'
    });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('does not resubmit a Muse Image operation after the POST response is ambiguous', async () => {
    const context = setup();
    const fetchImpl = vi.fn(async () => { throw new Error('socket closed after request write'); });
    const service = createImageGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const request = {
      operationId: 'muse-image-operation-002',
      prompt: 'Ambiguous fixture',
      provider: 'muse2api' as const,
      size: '1024x1024' as const,
      quality: 'medium' as const,
      count: 1
    };

    await expect(service.generate(request)).rejects.toThrow();
    await expect(service.generate(request)).rejects.toThrow();
    expect(context.ledger.get(request.operationId)?.status).toBe('unknown_remote_acceptance');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('resumes Muse Video polling by the persisted task id and finalizes only after local download', async () => {
    const context = setup();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_video_task_1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_video_task_1', status: 'completed', url: '/v1/media/video.mp4' })))
      .mockResolvedValueOnce(new Response(Buffer.from('local-muse-video'), { headers: { 'content-type': 'video/mp4' } }));
    const service = createVideoGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const request = {
      operationId: 'muse-video-operation-001',
      prompt: 'A fixture video',
      provider: 'muse2api' as const,
      model: 'muse-video',
      size: '1280x720' as const,
      duration: 5 as const
    };

    const submitted = await service.create(request);
    const operationBeforePoll = context.ledger.get(request.operationId);
    const completed = await service.refresh(submitted.id);
    const local = await service.read(completed.id);
    const duplicate = await service.create(request);

    expect(operationBeforePoll).toMatchObject({ status: 'waiting_remote', remoteTaskId: 'muse_video_task_1' });
    expect(completed).toMatchObject({ status: 'completed', provider: 'muse2api', fileName: expect.any(String) });
    expect(local.content.toString()).toBe('local-muse-video');
    expect(context.ledger.get(request.operationId)?.status).toBe('succeeded');
    expect(duplicate.id).toBe(submitted.id);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('reopens the durable ledger after restart and resumes the same remote task without another POST', async () => {
    const context = setup();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_video_task_restart', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'muse_video_task_restart', status: 'completed', url: '/v1/media/restarted-video.mp4' })))
      .mockResolvedValueOnce(new Response(Buffer.from('resumed-muse-video'), { headers: { 'content-type': 'video/mp4' } }));
    const request = {
      operationId: 'muse-video-operation-restart',
      prompt: 'A restart fixture video',
      provider: 'muse2api' as const,
      model: 'muse-video',
      size: '1280x720' as const,
      duration: 5 as const
    };
    const firstService = createVideoGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const submitted = await firstService.create(request);
    expect(context.ledger.get(request.operationId)).toMatchObject({
      status: 'waiting_remote', remoteTaskId: 'muse_video_task_restart'
    });

    dbs.pop()!.close();
    const reopenedDb = openRuntimeDatabase(context.path);
    dbs.push(reopenedDb);
    const resumedLedger = createProviderOperationLedger({ db: reopenedDb });
    const resumedService = createVideoGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: resumedLedger,
      fetchImpl
    });
    const completed = await resumedService.refresh(submitted.id);
    const local = await resumedService.read(submitted.id);

    expect(completed.status).toBe('completed');
    expect(local.content.toString()).toBe('resumed-muse-video');
    expect(resumedLedger.get(request.operationId)).toMatchObject({
      status: 'succeeded', remoteTaskId: 'muse_video_task_restart'
    });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not resubmit a Muse Video operation after an ambiguous POST', async () => {
    const context = setup();
    const fetchImpl = vi.fn(async () => { throw new Error('response lost after write'); });
    const service = createVideoGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const request = {
      operationId: 'muse-video-operation-002',
      prompt: 'Ambiguous video',
      provider: 'muse2api' as const,
      model: 'muse-video',
      size: '1280x720' as const,
      duration: 5 as const
    };

    await expect(service.create(request)).rejects.toThrow();
    await expect(service.create(request)).rejects.toThrow();
    expect(context.ledger.get(request.operationId)?.status).toBe('unknown_remote_acceptance');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses the same durable submit gate from a Creator Image stage and stage retry', async () => {
    const context = setup();
    const png = await createPngFixture();
    const repository = createCreatorRepository(dbs.at(-1)!);
    const job = repository.createJob({
      projectId: 'project_1', templateId: 'image-generation', templateVersion: 1,
      status: 'running', state: {
        provider: 'muse2api', prompt: 'Creator image fixture', size: '1024x1024',
        quality: 'medium', candidateCount: 1
      }
    });
    const stageRun = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'image', status: 'running',
      scopeKey: null, inputFingerprint: 'a'.repeat(64)
    });
    const currentJob = repository.getJob(job.id)!;
    const stage = {
      stageRun,
      job: currentJob,
      inputArtifacts: [],
      workdir: join(root, 'creator-image'),
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'creator_image_task_1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'creator_image_task_1', status: 'completed', data: [{ url: '/v1/media/image.png' }] })))
      .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/png' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'creator_image_task_1', status: 'completed', data: [{ url: '/v1/media/image.png' }] })))
      .mockResolvedValueOnce(new Response(png, { headers: { 'content-type': 'image/png' } }));
    const executor = createImageExecutor({
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      generate: (request, config, options) => generateImageContents(request, config, {
        ...options,
        fetchImpl
      })
    });
    const firstWorkdir = join(root, 'creator-image-1');
    const retryWorkdir = join(root, 'creator-image-2');
    await mkdir(firstWorkdir, { recursive: true });
    await mkdir(retryWorkdir, { recursive: true });
    const result = await executor.run({ ...stage, workdir: firstWorkdir });
    const retried = await executor.run({ ...stage, workdir: retryWorkdir });

    expect(result.outputs).toHaveLength(1);
    expect(retried.outputs).toHaveLength(1);
    expect(dbs.at(-1)!.prepare(`SELECT status, remote_task_id FROM creator_provider_operations
      WHERE job_id = ? AND scope = 'creator-image'`).get(job.id)).toEqual({
      status: 'succeeded', remote_task_id: 'creator_image_task_1'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('uses the same durable submit gate from a Creator Video stage and stage retry', async () => {
    const context = setup();
    const repository = createCreatorRepository(dbs.at(-1)!);
    const job = repository.createJob({
      projectId: 'project_1', templateId: 'video-generation', templateVersion: 1,
      status: 'running', state: {
        provider: 'muse2api', model: 'muse-video', prompt: 'Creator video fixture',
        size: '1280x720', duration: 5
      }
    });
    const stageRun = repository.createStageRun({
      jobId: job.id, stageId: 'generate', executor: 'video', status: 'running',
      scopeKey: null, inputFingerprint: 'b'.repeat(64)
    });
    const currentJob = repository.getJob(job.id)!;
    const stage = {
      stageRun,
      job: currentJob,
      inputArtifacts: [],
      workdir: join(root, 'creator-video-1'),
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'creator_video_task_1', status: 'queued' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'creator_video_task_1', status: 'completed', url: '/v1/media/video.mp4' })))
      .mockResolvedValueOnce(new Response(Buffer.from('creator-video'), { headers: { 'content-type': 'video/mp4' } }));
    const service = createVideoGenerationService({
      dataDir: root,
      configStore: context.configStore,
      providerOperationLedger: context.ledger,
      fetchImpl
    });
    const executor = createVideoExecutor({
      service,
      providerOperationLedger: context.ledger,
      sleep: async () => undefined,
      probeVideo: async () => ({
        hasVideo: true, hasAudio: false, duration: 5, width: 1280, height: 720
      })
    });
    const retryWorkdir = join(root, 'creator-video-2');
    await mkdir(stage.workdir, { recursive: true });
    await mkdir(retryWorkdir, { recursive: true });
    const result = await executor.run(stage);
    const retried = await executor.run({ ...stage, workdir: retryWorkdir });

    expect(result.outputs).toHaveLength(1);
    expect(retried.outputs).toHaveLength(1);
    expect(dbs.at(-1)!.prepare(`SELECT status, remote_task_id FROM creator_provider_operations
      WHERE job_id = ? AND scope = 'creator-video'`).get(job.id)).toEqual({
      status: 'succeeded', remote_task_id: 'creator_video_task_1'
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
