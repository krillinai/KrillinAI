import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCreatorResultSnapshots } from '@opencreator/protocol';
import { expect, it } from 'vitest';
import { buildServer } from '../../src/api/server.js';
import { createCreatorRepository } from '../../src/creator/repository.js';
import { createCreatorService } from '../../src/creator/service.js';
import { createDefaultCreatorTemplateRegistry } from '../../src/creator/templates/registry.js';
import { openRuntimeDatabase } from '../../src/storage/database.js';

it('preflights and serves a draft Douyin preview without translation configuration or result versions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'creator-draft-preview-api-'));
  const db = openRuntimeDatabase(join(directory, 'runtime.sqlite'));
  const repository = createCreatorRepository(db);
  const service = createCreatorService({ repository, templates: createDefaultCreatorTemplateRegistry() });
  const sourceUrl = 'https://v.douyin.com/example/';
  const initial = service.createJob({ projectId: 'preview-project', templateId: 'video-translation', state: { sourceType: 'url', sourceUrl } });
  const server = await buildServer({ db, token: 'secret', dataDir: directory, codexHome: join(directory, 'codex-home'),
    creatorExecutors: [{ id: 'download', async run({ stageRun, workdir, reportProgress }) {
      expect(stageRun.stageId).toBe('preview-source-video');
      expect(stageRun.progress.previewSourceUrl).toBe(sourceUrl);
      reportProgress({ phase: 'downloading', percent: 25, downloadedBytes: 25, totalBytes: 100, message: 'Downloading preview' });
      const path = join(workdir, 'preview.mp4');
      writeFileSync(path, 'draft-preview-video');
      return { outputs: [{ kind: 'source_video', path, status: 'completed', sourceArtifactIds: [],
        metadata: { sourceUrl, settingsSnapshot: { sourceType: 'url', sourceUrl }, previewOnly: true, playbackCompatible: true } }] };
    } }]
  });
  const headers = { authorization: 'Bearer secret' };
  const route = `/creator/jobs/${initial.id}`;
  try {
    const preflight = await server.inject({ method: 'GET', url: `${route}/preflight?stageId=preview-source-video`, headers });
    expect(preflight.statusCode).toBe(200);
    expect(preflight.json().canStart).toBe(true);
    const started = await server.inject({ method: 'POST', url: `${route}/actions`, headers, payload: {
      action: 'run-stage', expectedRevision: initial.revision, idempotencyKey: 'draft-preview', input: { stageId: 'preview-source-video' }
    } });
    expect(started.statusCode).toBe(200);
    await expect.poll(() => repository.getJob(initial.id)!.stages.at(-1)!.status).toBe('succeeded');
    const after = repository.getJob(initial.id)!;
    expect(after.status).toBe('draft');
    expect(after.state.resultVersion).toBeUndefined();
    expect(readCreatorResultSnapshots(after.state.resultSnapshots)).toEqual([]);
    const source = after.artifacts[0]!;
    const content = await server.inject({ method: 'GET', url: `${route}/artifacts/${source.id}/content`, headers });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('video/mp4');
    expect(content.body).toBe('draft-preview-video');
  } finally {
    await server.close();
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('preflights, cancels, resumes, and serves preview media for a completed historical result without retranslation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'creator-video-preview-api-'));
  const db = openRuntimeDatabase(join(directory, 'runtime.sqlite'));
  const repository = createCreatorRepository(db);
  const service = createCreatorService({ repository, templates: createDefaultCreatorTemplateRegistry() });
  const initial = service.createJob({ projectId: 'preview-project', templateId: 'video-translation' });
  const subtitlePath = join(directory, 'subtitles.srt');
  writeFileSync(subtitlePath, '1\n00:00:00,000 --> 00:00:01,000\n已翻译字幕\n');
  const subtitle = repository.insertArtifact({ jobId: initial.id, kind: 'target_subtitle', status: 'completed',
    path: subtitlePath, sourceArtifactIds: [], metadata: { resultVersion: 1 } });
  repository.updateJob({ id: initial.id, status: 'completed', revision: 1, state: {
    ...initial.state, sourceUrl: 'https://www.bilibili.com/video/BV18E421w7bf?p=99',
    resultVersion: 1, latestResultVersion: 1,
    resultSnapshots: [{ version: 1, createdAt: initial.createdAt, action: 'stage-succeeded', stageId: 'subtitle',
      description: 'Translated subtitles', artifactRefs: { target_subtitle: [subtitle.id] },
      changedArtifactIds: [subtitle.id], staleArtifactIds: [],
      state: { ...initial.state, sourceUrl: 'https://youtu.be/demo', composeVideo: false }
    }]
  } });
  const before = repository.getJob(initial.id)!;
  let executions = 0;
  const server = await buildServer({ db, token: 'secret', dataDir: directory, codexHome: join(directory, 'codex-home'),
    creatorExecutors: [{ id: 'download', async run({ stageRun, workdir, signal, reportProgress }) {
      expect(stageRun.stageId).toBe('prepare-source-video');
      expect(stageRun.progress.inputResultVersion).toBe(1);
      reportProgress({ phase: 'downloading', percent: 25, downloadedBytes: 25, totalBytes: 100, message: 'Downloading preview' });
      if (++executions === 1) {
        await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true }));
      }
      const path = join(workdir, 'preview.mp4');
      writeFileSync(path, 'downloaded-preview');
      return { outputs: [{ kind: 'source_video', path, status: 'completed', sourceArtifactIds: [],
        metadata: { fileName: 'preview.mp4', playbackCompatible: true,
          settingsSnapshot: readCreatorResultSnapshots(before.state.resultSnapshots)[0]!.state }
      }] };
    } }]
  });
  const headers = { authorization: 'Bearer secret' };
  const route = `/creator/jobs/${initial.id}`;
  try {
    const preflight = await server.inject({ method: 'GET', url: `${route}/preflight?stageId=prepare-source-video&inputResultVersion=1`, headers });
    expect(preflight.statusCode).toBe(200);
    expect(preflight.json().canStart).toBe(true);
    const missingVersion = await server.inject({ method: 'GET', url: `${route}/preflight?stageId=prepare-source-video`, headers });
    expect(missingVersion.json().canStart).toBe(false);
    const started = await server.inject({ method: 'POST', url: `${route}/actions`, headers, payload: {
      action: 'run-stage', expectedRevision: before.revision, idempotencyKey: 'preview-download',
      input: { stageId: 'prepare-source-video', inputResultVersion: 1 }
    } });
    expect(started.statusCode).toBe(200);
    await expect.poll(() => repository.getJob(initial.id)!.stages.at(-1)!.progress.percent).toBe(25);
    expect(repository.getJob(initial.id)!.status).toBe('completed');
    const canceled = await server.inject({ method: 'POST', url: `${route}/cancel`, headers });
    expect([200, 202]).toContain(canceled.statusCode);
    await expect.poll(() => repository.getJob(initial.id)!.stages.at(-1)!.status).toBe('canceled');
    const stopped = repository.getJob(initial.id)!;
    expect(stopped.status).toBe('completed');
    expect(stopped.state.resultSnapshots).toEqual(before.state.resultSnapshots);
    const resumed = await server.inject({ method: 'POST', url: `${route}/resume`, headers });
    expect(resumed.statusCode).toBe(202);
    expect(resumed.json().stage.progress.inputResultVersion).toBe(1);
    await expect.poll(() => repository.getJob(initial.id)!.stages.at(-1)!.status).toBe('succeeded');
    const after = repository.getJob(initial.id)!;
    const source = after.artifacts.find(artifact => artifact.kind === 'source_video')!;
    expect(executions).toBe(2);
    expect(after.status).toBe('completed');
    expect(after.state).toMatchObject({ resultVersion: 1, latestResultVersion: 1, sourceUrl: before.state.sourceUrl, composeVideo: false });
    expect(after.artifacts.find(artifact => artifact.id === subtitle.id)).toEqual(subtitle);
    expect(readCreatorResultSnapshots(after.state.resultSnapshots)).toEqual([
      { ...readCreatorResultSnapshots(before.state.resultSnapshots)[0], artifactRefs: { target_subtitle: [subtitle.id], source_video: [source.id] } }
    ]);
    const content = await server.inject({ method: 'GET', url: `${route}/artifacts/${source.id}/content`, headers });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('video/mp4');
    expect(content.body).toBe('downloaded-preview');
  } finally {
    await server.close();
    if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
