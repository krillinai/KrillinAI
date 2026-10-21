import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig, readCreatorResultSnapshots } from '@opencreator/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createCreatorAgentRepository } from '../../src/creator/agent/repository.js';
import { createCreatorCommandDispatcher } from '../../src/creator/command-dispatcher.js';
import { createCreatorRepository } from '../../src/creator/repository.js';
import { createCreatorService } from '../../src/creator/service.js';
import { createCreatorStageRunner } from '../../src/creator/stage-runner.js';
import { createDefaultCreatorTemplateRegistry } from '../../src/creator/templates/registry.js';
import { createVideoTranslationWorkflow } from '../../src/creator/templates/video-translation-actions.js';
import { openRuntimeDatabase } from '../../src/storage/database.js';

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
function setup(state: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'translation-parallel-'));
  const db = openRuntimeDatabase(join(dir, 'runtime.sqlite'));
  const repository = createCreatorRepository(db);
  const service = createCreatorService({ repository, templates: createDefaultCreatorTemplateRegistry() });
  const job = service.createJob({ projectId: 'project', templateId: 'video-translation', state: {
    sourceType: 'url', sourceUrl: 'https://youtu.be/parallel', composeVideo: false, dubbing: false, ...state
  } });
  const dispatcher = createCreatorCommandDispatcher({ service, repository, receipts: createCreatorAgentRepository(db) });
  const config = createDefaultCreatorServicesConfig(); config.tts.openai.apiKey = 'configured';
  const workflow = createVideoTranslationWorkflow({ creator: service, dispatcher, configStore: { read: async () => config } });
  const start = () => dispatcher.dispatch(job.id, { action: 'run-stage', expectedRevision: service.getJob(job.id)!.revision,
    idempotencyKey: 'start', input: { stageId: 'subtitle', workflow: true } }, 'user').commandReceipt.stageRunId!;
  return { dir, db, repository, service, workflow, start, jobId: job.id, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

describe('translation with parallel source download', () => {
  it.each(['download-first', 'subtitles-first', 'download-failed'] as const)('publishes subtitles independently and attaches only matching media (%s)', async order => {
    const fixture = setup(); const subtitleGate = gate(); const downloadGate = gate();
    let subtitleStarted = false; let downloadStarted = false;
    const source = join(fixture.dir, 'source.mp4'); writeFileSync(source, 'media');
    const runner = createCreatorStageRunner({ repository: fixture.repository, templates: fixture.service.templates, workRoot: join(fixture.dir, 'work'),
      executors: [{ id: 'krillinai', async run() { subtitleStarted = true; await subtitleGate.promise; return { outputs: [{ kind: 'target_subtitle', status: 'completed', path: null }] }; } },
        { id: 'download', async run(stage) { downloadStarted = true; await downloadGate.promise;
          if (order === 'download-failed') throw new Error('Download unavailable');
          return { outputs: [{ kind: 'source_video', status: 'completed', path: source, metadata: { sourceUrl: stage.stageRun.progress.previewSourceUrl! } }] }; } }],
      onStageChanged(stage) { void fixture.workflow.handleStageChanged(stage); },
      onStageSucceeded(stage) { void fixture.workflow.handleStageChanged(stage); }
    });
    try {
      const subtitleRun = runner.runStageRun(fixture.start());
      await vi.waitFor(() => expect(subtitleStarted).toBe(true));
      const download = fixture.service.getJob(fixture.jobId)!.stages.find(stage => stage.stageId === 'preview-source-video')!;
      expect(download).toMatchObject({ progress: { backgroundSourceDownload: true } });
      const downloadRun = runner.runStageRun(download.id);
      await vi.waitFor(() => expect(downloadStarted).toBe(true)); // subtitle gate is still closed
      await fixture.workflow.handleStageChanged(fixture.service.getJob(fixture.jobId)!.stages[0]!);
      await fixture.workflow.recover();
      expect(fixture.service.getJob(fixture.jobId)!.stages).toHaveLength(2);
      if (order === 'download-first') { downloadGate.release(); await downloadRun; subtitleGate.release(); await subtitleRun; }
      else {
        subtitleGate.release(); await subtitleRun;
        expect(fixture.service.getJob(fixture.jobId)!.status).toBe('completed');
        expect(readCreatorResultSnapshots(fixture.service.getJob(fixture.jobId)!.state.resultSnapshots)[0]?.artifactRefs.target_subtitle).toHaveLength(1);
        downloadGate.release(); await downloadRun;
      }
      const job = fixture.service.getJob(fixture.jobId)!;
      expect(job.status).toBe('completed');
      const snapshots = readCreatorResultSnapshots(job.state.resultSnapshots);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]!.artifactRefs.target_subtitle).toHaveLength(1);
      expect(snapshots[0]!.artifactRefs.source_video?.length ?? 0).toBe(order === 'download-failed' ? 0 : 1);
      expect(job.stages.find(stage => stage.stageId === 'preview-source-video')!.status).toBe(order === 'download-failed' ? 'failed' : 'succeeded');
    } finally { subtitleGate.release(); downloadGate.release(); await runner.close(); fixture.cleanup(); }
  });

  it.each([{ skipVideoDownload: true }, { sourceType: 'file' }, { sourceType: 'subtitle' }])('does not start remote media preparation for %j', async state => {
    const fixture = setup(state);
    try {
      const id = fixture.start(); fixture.repository.updateStageRun({ id, status: 'running' });
      await fixture.workflow.handleStageChanged(fixture.repository.getStageRun(id)!);
      expect(fixture.service.getJob(fixture.jobId)!.stages).toHaveLength(1);
    } finally { fixture.cleanup(); }
  });

  it.each(['other-part', 'incompatible'])('does not show an invalid cached video while the source is pending (%s)', async cache => {
    const fixture = setup({ sourceUrl: 'https://www.bilibili.com/video/BV18E421w7bf?p=3' });
    const source = join(fixture.dir, 'part2.mp4'); writeFileSync(source, 'other part');
    fixture.repository.insertArtifact({ jobId: fixture.jobId, kind: 'source_video', status: 'completed', path: source, sourceArtifactIds: [],
      metadata: { sourceUrl: `https://www.bilibili.com/video/BV18E421w7bf?p=${cache === 'other-part' ? 2 : 3}`, playbackCompatible: cache !== 'incompatible' } });
    const runner = createCreatorStageRunner({ repository: fixture.repository, templates: fixture.service.templates,
      workRoot: join(fixture.dir, 'work'), executors: [{ id: 'krillinai', async run() { return {
        outputs: [{ kind: 'target_subtitle', status: 'completed', path: null }]
      }; } }] });
    try {
      await runner.runStageRun(fixture.start());
      const snapshot = readCreatorResultSnapshots(fixture.service.getJob(fixture.jobId)!.state.resultSnapshots)[0]!;
      expect(snapshot.artifactRefs.target_subtitle).toHaveLength(1);
      expect(snapshot.artifactRefs.source_video).toBeUndefined();
    } finally { await runner.close(); fixture.cleanup(); }
  });

  it('waits for parallel media preparation, then composes the generated dubbing with the current subtitles', async () => {
    const fixture = setup({ composeVideo: true, dubbing: true });
    const source = join(fixture.dir, 'source.mp4'); writeFileSync(source, 'media');
    const run = vi.fn(async (stage: import('../../src/creator/executor.js').CreatorExecutorInput) => ({
      outputs: stage.stageRun.stageId === 'subtitle' ? [{ kind: 'target_subtitle', status: 'completed' as const, path: null }]
        : stage.stageRun.stageId === 'tts' ? [{ kind: 'dubbed_audio', status: 'completed' as const, path: null }]
        : [{ kind: 'horizontal_video', status: 'completed' as const, path: null }]
    }));
    const runner = createCreatorStageRunner({ repository: fixture.repository, templates: fixture.service.templates,
      workRoot: join(fixture.dir, 'work'), executors: [{ id: 'krillinai', run }, { id: 'download', async run() { return {
        outputs: [{ kind: 'source_video', status: 'completed', path: source, metadata: { sourceUrl: 'https://youtu.be/parallel' } }]
      }; } }], onStageChanged(stage) { void fixture.workflow.handleStageChanged(stage); },
      onStageSucceeded(stage) { void fixture.workflow.handleStageChanged(stage); } });
    try {
      await runner.runStageRun(fixture.start());
      expect(fixture.service.getJob(fixture.jobId)!.stages.map(stage => stage.stageId)).toEqual(['subtitle', 'preview-source-video']);
      await runner.runStageRun(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.id);
      await vi.waitFor(() => expect(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.stageId).toBe('tts'));
      await runner.runStageRun(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.id);
      await vi.waitFor(() => expect(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.stageId).toBe('render-horizontal'));
      await runner.runStageRun(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.id);
      expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ inputArtifacts: expect.arrayContaining([
        expect.objectContaining({ kind: 'target_subtitle' }), expect.objectContaining({ kind: 'dubbed_audio' }), expect.objectContaining({ kind: 'source_video' })
      ]) }));
      expect(fixture.service.getJob(fixture.jobId)!.status).toBe('completed');
      expect(readCreatorResultSnapshots(fixture.service.getJob(fixture.jobId)!.state.resultSnapshots)).toHaveLength(1);
    } finally { await runner.close(); fixture.cleanup(); }
  });

  it('does not start paid dubbing after the remaining source download is canceled or recovered', async () => {
    const fixture = setup({ composeVideo: true, dubbing: true });
    let downloadStarted = false;
    const runner = createCreatorStageRunner({ repository: fixture.repository, templates: fixture.service.templates,
      workRoot: join(fixture.dir, 'work'), executors: [{ id: 'krillinai', async run() { return {
        outputs: [{ kind: 'target_subtitle', status: 'completed', path: null }]
      }; } }, { id: 'download', async run(stage) { downloadStarted = true;
        await new Promise<void>(resolve => stage.signal.addEventListener('abort', () => resolve(), { once: true })); return { outputs: [] };
      } }], onStageChanged(stage) { void fixture.workflow.handleStageChanged(stage); },
      onStageSucceeded(stage) { void fixture.workflow.handleStageChanged(stage); } });
    try {
      await runner.runStageRun(fixture.start());
      const download = runner.runStageRun(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.id);
      await vi.waitFor(() => expect(downloadStarted).toBe(true)); runner.cancelJob(fixture.jobId); await download;
      await fixture.workflow.recover();
      expect(fixture.service.getJob(fixture.jobId)!.stages.map(stage => stage.stageId)).toEqual(['subtitle', 'preview-source-video']);
    } finally { await runner.close(); fixture.cleanup(); }
  });

  it('cancels both running stages without publishing late media', async () => {
    const fixture = setup(); let count = 0;
    const run = vi.fn(async (stage: { signal: AbortSignal }) => { count++; await new Promise<void>(resolve => stage.signal.addEventListener('abort', () => resolve(), { once: true })); return { outputs: [] }; });
    const runner = createCreatorStageRunner({ repository: fixture.repository, templates: fixture.service.templates, workRoot: join(fixture.dir, 'work'),
      executors: [{ id: 'krillinai', run }, { id: 'download', run }], onStageChanged(stage) { void fixture.workflow.handleStageChanged(stage); } });
    try {
      const first = runner.runStageRun(fixture.start()); await vi.waitFor(() => expect(count).toBe(1));
      const second = runner.runStageRun(fixture.service.getJob(fixture.jobId)!.stages.at(-1)!.id);
      await vi.waitFor(() => expect(count).toBe(2)); runner.cancelJob(fixture.jobId); await Promise.all([first, second]);
      expect(fixture.service.getJob(fixture.jobId)!.stages.every(stage => stage.status === 'canceled')).toBe(true);
      expect(fixture.service.getJob(fixture.jobId)!.artifacts).toHaveLength(0);
    } finally { await runner.close(); fixture.cleanup(); }
  });
});
