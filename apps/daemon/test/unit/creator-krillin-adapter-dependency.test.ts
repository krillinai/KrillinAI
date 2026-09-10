import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const preflightKrillinDependencies = vi.hoisted(() => vi.fn());
const runKrillinCli = vi.hoisted(() => vi.fn());

vi.mock('../../src/creator/krillin/dependency-preflight.js', () => ({
  preflightKrillinDependencies
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
      options: { captionSource: 'platform' }
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
      options: { captionSource: 'whisper' }
    });
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
