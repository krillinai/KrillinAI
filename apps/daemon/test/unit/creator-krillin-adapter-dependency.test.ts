import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import type { CreatorExecutorInput } from '../../src/creator/executor.js';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const preflightKrillinDependencies = vi.hoisted(() => vi.fn());
const runKrillinCli = vi.hoisted(() => vi.fn());

vi.mock('../../src/creator/krillin/dependency-preflight.js', () => ({
  preflightKrillinDependencies
}));

vi.mock('../../src/creator/validators/media.js', () => ({
  validateMediaFile: vi.fn(async () => ({ duration: 1, hasVideo: true, hasAudio: true }))
}));

vi.mock('../../src/creator/krillin/cli-runner.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/creator/krillin/cli-runner.js')>();
  return { ...actual, runKrillinCli };
});

import { createKrillinExecutor } from '../../src/creator/krillin/adapter.js';
import { KrillinCliError } from '../../src/creator/krillin/cli-runner.js';

let tempDir = '';

afterEach(() => {
  vi.clearAllMocks();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('KrillinAI configured transcription dependency', () => {
  it('uses the original YouTube URL without preparing transcription when platform captions succeed', async () => {
    const fixture = setup();
    runKrillinCli.mockImplementation(async input => [writeTargetSubtitle(input.jobsRoot)]);

    const result = await fixture.executor.run(fixture.stage);

    expect(result.outputs).toEqual([
      expect.objectContaining({ kind: 'target_subtitle', status: 'completed' })
    ]);
    expect(fixture.ensure).not.toHaveBeenCalled();
    expect(runKrillinCli).toHaveBeenCalledTimes(1);
    expect(runKrillinCli.mock.calls[0]?.[0]).toMatchObject({
      source: 'https://www.youtube.com/watch?v=demo',
      options: {
        captionSource: 'platform',
        originLanguage: 'auto',
        targetLanguage: 'zh_cn'
      }
    });
  });

  it('prepares transcription only after platform captions fail and uses the local video', async () => {
    const fixture = setup();
    runKrillinCli
      .mockRejectedValueOnce(new KrillinCliError(
        'platform_caption_failed',
        'No platform captions are available'
      ))
      .mockImplementationOnce(async input => [writeTargetSubtitle(input.jobsRoot)]);

    await fixture.executor.run(fixture.stage);

    expect(fixture.ensure).toHaveBeenCalledTimes(1);
    expect(runKrillinCli).toHaveBeenCalledTimes(2);
    expect(runKrillinCli.mock.calls[0]?.[0]).toMatchObject({
      source: 'https://www.youtube.com/watch?v=demo',
      options: { captionSource: 'platform' }
    });
    expect(runKrillinCli.mock.calls[1]?.[0]).toMatchObject({
      source: expect.stringMatching(/^local:/),
      options: {
        captionSource: 'whisper',
        originLanguage: 'auto',
        targetLanguage: 'zh_cn'
      }
    });
  });

  it('preserves platform caption diagnostics when transcription fallback also fails', async () => {
    const fixture = setup();
    runKrillinCli
      .mockRejectedValueOnce(new KrillinCliError(
        'platform_caption_failed',
        'No original YouTube captions are available'
      ))
      .mockRejectedValueOnce(new KrillinCliError(
        'audio_transcription_failed',
        'whisperkit-cli rejected the language option'
      ));

    await expect(fixture.executor.run(fixture.stage)).rejects.toMatchObject({
      code: 'audio_transcription_failed',
      message: expect.stringMatching(/No original YouTube captions.*whisperkit-cli rejected/)
    });
  });

  it.each(['platform_caption_access_failed', 'platform_caption_processing_failed'])('does not download transcription components after %s', async code => {
    const fixture = setup();
    runKrillinCli.mockRejectedValueOnce(new KrillinCliError(code, 'Platform request failed'));

    await expect(fixture.executor.run(fixture.stage)).rejects.toMatchObject({ code });

    expect(runKrillinCli).toHaveBeenCalledTimes(1);
    expect(fixture.ensure).not.toHaveBeenCalled();
  });

  it.each(['different-url', 'unknown'])('does not reuse a source video with %s provenance when rendering a URL', async provenance => {
    const fixture = setup();
    const stage = fixture.stage as CreatorExecutorInput;
    stage.job.templateId = 'video-translation';
    stage.stageRun.stageId = 'render-horizontal';
    const previousVideo = stage.inputArtifacts[0]!;
    previousVideo.metadata = provenance === 'different-url'
      ? { settingsSnapshot: { sourceUrl: 'https://www.youtube.com/watch?v=previous' } }
      : {};
    const subtitle = writeTargetSubtitle(tempDir);
    stage.inputArtifacts.push({ id: 'target-subtitle', kind: 'target_subtitle', path: join(tempDir, subtitle.relativePath) } as never);
    runKrillinCli.mockImplementation(async input => {
      const outputDir = join(input.jobsRoot, stage.job.id, 'outputs');
      mkdirSync(outputDir, { recursive: true });
      const sourcePath = join(outputDir, 'new-source.mp4');
      const renderPath = join(outputDir, 'horizontal.mp4');
      writeFileSync(sourcePath, 'new source');
      writeFileSync(renderPath, 'render');
      return [
        { kind: 'source_video', relativePath: relative(input.jobsRoot, sourcePath), size: 10 },
        { kind: 'horizontal_video', relativePath: relative(input.jobsRoot, renderPath), size: 6 }
      ];
    });

    const result = await fixture.executor.run(stage);

    expect(runKrillinCli.mock.calls[0]?.[0].artifacts).toEqual([
      expect.objectContaining({ id: 'target-subtitle', kind: 'target_subtitle' })
    ]);
    expect(runKrillinCli.mock.calls[0]?.[0].options.sourceUrl).toBe(stage.job.state.sourceUrl);
    expect(result.outputs).toEqual([
      expect.objectContaining({ kind: 'source_video', sourceArtifactIds: [] }),
      expect.objectContaining({ kind: 'horizontal_video', sourceArtifactIds: ['target-subtitle'] })
    ]);
    expect(fixture.ensure).not.toHaveBeenCalled();
  });

  it.each(['matching-url', 'local-file'])('retains a source video with %s provenance', async provenance => {
    const fixture = setup();
    const stage = fixture.stage as CreatorExecutorInput;
    stage.job.templateId = 'video-translation';
    stage.stageRun.stageId = 'tts';
    stage.job.state.sourceType = provenance === 'local-file' ? 'file' : 'url';
    stage.inputArtifacts[0]!.metadata = provenance === 'matching-url'
      ? { settingsSnapshot: { sourceUrl: stage.job.state.sourceUrl! } }
      : {};
    runKrillinCli.mockImplementation(async input => {
      const outputDir = join(input.jobsRoot, stage.job.id, 'outputs');
      mkdirSync(outputDir, { recursive: true });
      const outputPath = join(outputDir, 'dubbed.wav');
      writeFileSync(outputPath, 'audio');
      return [{ kind: 'dubbed_audio', relativePath: relative(input.jobsRoot, outputPath), size: 5 }];
    });

    await fixture.executor.run(stage);

    expect(runKrillinCli.mock.calls[0]?.[0].artifacts).toEqual([
      expect.objectContaining({ id: 'source-video', kind: 'source_video' })
    ]);
    expect(fixture.ensure).not.toHaveBeenCalled();
  });
});

function setup() {
  tempDir = realpathSync(mkdtempSync(join(tmpdir(), 'creator-krillin-caption-plan-')));
  const resourceRoot = join(tempDir, 'runtime');
  const jobsRoot = join(tempDir, 'jobs');
  const sourcePath = join(jobsRoot, 'auto-clip-job', 'inputs', 'source.mp4');
  const ffprobePath = join(resourceRoot, 'bin', 'ffprobe');
  mkdirSync(join(resourceRoot, 'bin'), { recursive: true });
  mkdirSync(join(jobsRoot, 'auto-clip-job', 'inputs'), { recursive: true });
  writeFileSync(sourcePath, 'video');
  writeFileSync(ffprobePath, 'ffprobe');
  writeFileSync(join(resourceRoot, 'manifest.json'), JSON.stringify({
    version: 1,
    platform: process.platform,
    arch: process.arch,
    resources: [{
      path: 'bin/ffprobe',
      sha256: 'a'.repeat(64),
      kind: 'executable'
    }]
  }));

  const config = createDefaultCreatorServicesConfig();
  config.transcription.provider = 'whisperkit';
  preflightKrillinDependencies.mockReturnValue({
    manifest: { resources: [] },
    config
  });
  const ensure = vi.fn(async () => undefined);
  const executor = createKrillinExecutor({
    resourceRoot,
    jobsRoot,
    configStore: {
      read: vi.fn(async () => config)
    } as never,
    dependencyLoader: {
      root: join(tempDir, 'dependencies'),
      capabilities: vi.fn(),
      ensure
    }
  });
  const stage = {
    signal: new AbortController().signal,
    stageRun: {
      id: 'subtitle-stage',
      stageId: 'subtitle',
      progress: {}
    },
    job: {
      id: 'auto-clip-job',
      templateId: 'auto-clip',
      state: {
        sourceUrl: 'https://www.youtube.com/watch?v=demo',
        sourceLanguage: 'auto',
        targetLanguage: 'zh-CN',
        preferPlatformCaptions: true
      }
    },
    inputArtifacts: [{
      id: 'source-video',
      kind: 'source_video',
      path: sourcePath
    }],
    workdir: join(jobsRoot, 'auto-clip-job', 'subtitle-stage'),
    reportProgress: vi.fn()
  } as never;
  return { ensure, executor, stage };
}

function writeTargetSubtitle(jobsRoot: string) {
  const outputDir = join(jobsRoot, 'auto-clip-job', 'outputs');
  const path = join(outputDir, 'target.srt');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path, '1\n00:00:00,000 --> 00:00:01,000\n字幕内容\n');
  return {
    kind: 'target_subtitle',
    relativePath: relative(jobsRoot, path).replaceAll('\\', '/'),
    size: 48,
    sha256: 'b'.repeat(64)
  };
}
