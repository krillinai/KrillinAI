import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultCreatorServicesConfig, type CreatorJob, type CreatorJson } from '@opencreator/protocol';
import { createCreatorPreflight } from '../../src/creator/preflight.js';
import { createImageGenerationTemplate } from '../../src/creator/templates/image-generation.js';
import { createVideoDownloadTemplate } from '../../src/creator/templates/video-download.js';
import { createKrillinCreatorServicesCapabilities } from '../../src/creator/krillin/capabilities.js';

let root = '';

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

describe('creator preflight', () => {
  it('blocks a stage with missing provider credentials and provides a settings repair', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-preflight-'));
    const config = createDefaultCreatorServicesConfig();
    const job = fakeJob('image-generation', { provider: 'openai', prompt: 'test' });
    const result = await createCreatorPreflight({
      configStore: { read: async () => config },
      readCapabilities: () => createKrillinCreatorServicesCapabilities('win32', 'x64'),
      resourceRoot: join(root, 'runtime'),
      jobsRoot: join(root, 'jobs'),
      executorIds: ['image']
    }).check(job, createImageGenerationTemplate().stages[0]!);

    expect(result.canStart).toBe(false);
    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'image-provider',
        repair: expect.objectContaining({ deepLink: '#/settings?tab=ai-services&section=image' })
      })
    ]));
  });

  it('reports local dependency failures before creating a download stage', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-preflight-'));
    const job = fakeJob('video-download', { sourceUrl: 'https://youtu.be/example' });
    const result = await createCreatorPreflight({
      configStore: { read: async () => createDefaultCreatorServicesConfig() },
      readCapabilities: () => createKrillinCreatorServicesCapabilities('win32', 'x64'),
      resourceRoot: join(root, 'runtime'),
      jobsRoot: join(root, 'jobs'),
      executorIds: ['download'],
      validateRuntimeAssets: true
    }).check(job, createVideoDownloadTemplate().stages[0]!);

    expect(result.canStart).toBe(false);
    expect(result.blocked.map(item => item.id)).toEqual(expect.arrayContaining(['ffmpeg', 'ffprobe', 'yt-dlp']));
    expect(result.blocked.every(item => item.repair.label.length > 0)).toBe(true);
  });

  it('blocks a reference image when the configured provider cannot edit images', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-preflight-'));
    const referencePath = join(root, 'reference.png');
    await writeFile(referencePath, 'image');
    const config = createDefaultCreatorServicesConfig();
    config.image.jimeng.apiKey = 'test-key';
    const job = fakeJob('image-generation', {
      provider: 'jimeng',
      prompt: 'test',
      referenceImageArtifactId: 'reference-image'
    });
    job.artifacts.push({
      id: 'reference-image',
      jobId: job.id,
      kind: 'reference_image',
      status: 'completed',
      version: 1,
      path: referencePath,
      sourceArtifactIds: [],
      metadata: {},
      createdAt: new Date(0).toISOString()
    });

    const result = await createCreatorPreflight({
      configStore: { read: async () => config },
      readCapabilities: () => createKrillinCreatorServicesCapabilities('win32', 'x64'),
      resourceRoot: join(root, 'runtime'),
      jobsRoot: join(root, 'jobs'),
      executorIds: ['image']
    }).check(job, createImageGenerationTemplate().stages[0]!);

    expect(result.blocked).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'reference-image-capability' })
    ]));
  });
});

function fakeJob(templateId: string, state: Record<string, CreatorJson>): CreatorJob {
  return {
    id: 'job-preflight',
    projectId: 'project-preflight',
    templateId,
    templateVersion: templateId === 'image-generation' ? 2 : 2,
    status: 'draft',
    revision: 0,
    state,
    agentThreadId: null,
    stages: [],
    artifacts: [],
    activities: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}
