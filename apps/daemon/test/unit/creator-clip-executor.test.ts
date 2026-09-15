import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDefaultCreatorServicesConfig,
  type CreatorArtifact,
  type CreatorJob,
  type CreatorStageRun
} from '@opencreator/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClipExecutor } from '../../src/creator/clip/executor.js';

let tempDir = '';

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
  vi.unstubAllGlobals();
});

describe('clip executor', () => {
  it('uses the saved content settings during analysis', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-clip-executor-'));
    const workdir = join(tempDir, 'work');
    mkdirSync(workdir);
    const sourcePath = join(tempDir, 'source.mp4');
    const subtitlePath = join(tempDir, 'subtitle.srt');
    const ffprobePath = join(tempDir, 'ffprobe');
    writeFileSync(sourcePath, 'source-video');
    writeFileSync(subtitlePath, '1\n00:01:05,000 --> 00:01:40,000\nProduct pricing and customer feedback\n');
    writeExecutable(ffprobePath, `#!/bin/sh\nprintf '%s\\n' '{"format":{"duration":"180"},"streams":[{"codec_type":"video","width":1920,"height":1080},{"codec_type":"audio"}]}'\n`);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(request.messages[0]!.content).toContain('内容类型：播客对谈');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          candidates: [candidate('clip-1', 'Pricing insight', 65, 100)]
        }) } }]
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const config = createDefaultCreatorServicesConfig();
    config.llm.apiKey = 'test-key';
    config.llm.baseUrl = 'https://api.openai.test/v1';
    config.llm.model = 'test-model';
    const executor = createClipExecutor({
      configStore: { read: async () => config },
      ffmpegPath: join(tempDir, 'unused-ffmpeg'),
      ffprobePath
    });

    const currentJob = job();
    currentJob.state = {
      ...currentJob.state,
      focus: 'knowledge',
      genre: 'podcast',
      duration: '30-60',
      clipCount: 4
    };
    const result = await executor.run({
      stageRun: stageRun('analyze'),
      job: currentJob,
      inputArtifacts: [
        artifact('source', 'source_video', sourcePath),
        artifact('subtitle', 'target_subtitle', subtitlePath)
      ],
      workdir,
      signal: new AbortController().signal,
      reportProgress: vi.fn()
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.outputs[0]?.metadata).toMatchObject({
      genre: 'podcast',
      duration: '30-60',
      clipCount: 1
    });
  });

  it('renders every analyzed clip as a separate file without a selection', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-clip-executor-'));
    const workdir = join(tempDir, 'work');
    mkdirSync(workdir);
    const sourcePath = join(tempDir, 'source.mp4');
    const candidatesPath = join(tempDir, 'clip-candidates.json');
    const ffprobePath = join(tempDir, 'ffprobe');
    const ffmpegPath = join(tempDir, 'ffmpeg');
    const ffmpegLogPath = join(tempDir, 'ffmpeg.log');
    writeFileSync(sourcePath, 'source-video');
    writeFileSync(candidatesPath, JSON.stringify({ candidates: [
      candidate('clip-1', 'First clip', 0, 30),
      candidate('clip-2', 'Second clip', 40, 75)
    ] }));
    writeExecutable(ffprobePath, `#!/bin/sh\nprintf '%s\\n' '{"format":{"duration":"120"},"streams":[{"codec_type":"video","width":1920,"height":1080},{"codec_type":"audio"}]}'\n`);
    writeExecutable(ffmpegPath, `#!/bin/sh\nlast=''\nfor arg in "$@"; do\n  last="$arg"\n  printf '%s\\n' "$arg" >> '${ffmpegLogPath}'\ndone\nprintf '%s\\n' '---' >> '${ffmpegLogPath}'\nprintf '%s\\n' 'out_time=00:00:15.000000' >&2\nprintf '%s\\n' 'progress=continue' >&2\nprintf 'rendered-video' > "$last"\n`);

    const sourceArtifact = artifact('source', 'source_video', sourcePath);
    const candidateArtifact = artifact('candidates', 'clip_candidates', candidatesPath);
    const executor = createClipExecutor({
      configStore: { read: vi.fn() } as never,
      ffmpegPath,
      ffprobePath,
      preferHardwareEncoding: false
    });
    const reportProgress = vi.fn();
    const result = await executor.run({
      stageRun: stageRun(),
      job: job(),
      inputArtifacts: [sourceArtifact, candidateArtifact],
      workdir,
      signal: new AbortController().signal,
      reportProgress
    });

    const invocations = readFileSync(ffmpegLogPath, 'utf8').trim().split('\n---\n')
      .map(entry => entry.split('\n'));
    const firstArgs = invocations[0]!;
    const firstFilter = firstArgs[firstArgs.indexOf('-filter_complex') + 1]!;
    expect(firstArgs.slice(firstArgs.indexOf('-ss'), firstArgs.indexOf('-ss') + 2)).toEqual(['-ss', '0']);
    expect(firstArgs.indexOf('-ss')).toBeLessThan(firstArgs.indexOf('-i'));
    expect(firstArgs.slice(firstArgs.indexOf('-t'), firstArgs.indexOf('-t') + 2)).toEqual(['-t', '30']);
    expect(firstFilter).not.toContain('trim=');
    expect(firstFilter.indexOf('crop=')).toBeLessThan(firstFilter.indexOf('scale='));
    expect(firstArgs.slice(firstArgs.indexOf('-preset'), firstArgs.indexOf('-preset') + 2)).toEqual(['-preset', 'veryfast']);
    expect(firstArgs.slice(firstArgs.indexOf('-progress'), firstArgs.indexOf('-progress') + 2)).toEqual(['-progress', 'pipe:2']);
    expect(firstArgs).toContain('-nostats');
    expect(invocations[1]!.slice(invocations[1]!.indexOf('-ss'), invocations[1]!.indexOf('-ss') + 2)).toEqual(['-ss', '40']);
    expect(invocations[1]!.slice(invocations[1]!.indexOf('-t'), invocations[1]!.indexOf('-t') + 2)).toEqual(['-t', '35']);
    expect(reportProgress.mock.calls.map(([progress]) => progress).some(progress => (
      progress.phase === 'rendering_clips'
      && progress.completed === 0
      && progress.percent > 0
      && progress.percent < 50
    ))).toBe(true);
    expect(result.outputs.map(output => output.metadata?.candidateId))
      .toEqual(['clip-1', 'clip-2']);
    expect(result.outputs.map(output => output.path && readFileSync(output.path, 'utf8')))
      .toEqual(['rendered-video', 'rendered-video']);
    expect(invocations).toHaveLength(2);
    expect(result.progress).toMatchObject({ completed: 2, failed: 0, total: 2 });
  });

  it('falls back to software encoding when VideoToolbox is unavailable', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'creator-clip-executor-'));
    const workdir = join(tempDir, 'work');
    mkdirSync(workdir);
    const sourcePath = join(tempDir, 'source.mp4');
    const candidatesPath = join(tempDir, 'clip-candidates.json');
    const ffprobePath = join(tempDir, 'ffprobe');
    const ffmpegPath = join(tempDir, 'ffmpeg');
    const ffmpegLogPath = join(tempDir, 'ffmpeg.log');
    writeFileSync(sourcePath, 'source-video');
    writeFileSync(candidatesPath, JSON.stringify({
      candidates: [candidate('clip-1', 'First clip', 10, 30)]
    }));
    writeExecutable(ffprobePath, `#!/bin/sh\nprintf '%s\\n' '{"format":{"duration":"120"},"streams":[{"codec_type":"video","width":1920,"height":1080},{"codec_type":"audio"}]}'\n`);
    writeExecutable(ffmpegPath, `#!/bin/sh\nlast=''\nhardware='false'\nfor arg in "$@"; do\n  last="$arg"\n  if [ "$arg" = 'h264_videotoolbox' ]; then hardware='true'; fi\n  printf '%s\\n' "$arg" >> '${ffmpegLogPath}'\ndone\nprintf '%s\\n' '---' >> '${ffmpegLogPath}'\nif [ "$hardware" = 'true' ]; then\n  printf '%s\\n' 'VideoToolbox is unavailable' >&2\n  exit 1\nfi\nprintf 'rendered-video' > "$last"\n`);

    const executor = createClipExecutor({
      configStore: { read: vi.fn() } as never,
      ffmpegPath,
      ffprobePath,
      preferHardwareEncoding: true
    });
    const reportProgress = vi.fn();
    const result = await executor.run({
      stageRun: stageRun(),
      job: job(),
      inputArtifacts: [
        artifact('source', 'source_video', sourcePath),
        artifact('candidates', 'clip_candidates', candidatesPath)
      ],
      workdir,
      signal: new AbortController().signal,
      reportProgress
    });

    const invocations = readFileSync(ffmpegLogPath, 'utf8').trim().split('\n---\n')
      .map(entry => entry.split('\n'));
    expect(invocations).toHaveLength(2);
    expect(invocations[0]).toContain('h264_videotoolbox');
    expect(invocations[0]).toEqual(expect.arrayContaining(['-q:v', '65', '-realtime', 'true', '-prio_speed']));
    expect(invocations[1]).toContain('libx264');
    expect(invocations[1]).toEqual(expect.arrayContaining(['-preset', 'veryfast']));
    expect(reportProgress).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Hardware encoding unavailable; retrying with software encoding'
    }));
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.path && readFileSync(result.outputs[0].path!, 'utf8')).toBe('rendered-video');
  });
});

function candidate(id: string, title: string, start: number, end: number) {
  return {
    id,
    title,
    start,
    end,
    transcript: `${title} transcript`,
    reason: `${title} reason`,
    scores: { hook: 90, information: 88, emotion: 80, completeness: 92 }
  };
}

function artifact(id: string, kind: string, path: string): CreatorArtifact {
  return {
    id,
    jobId: 'auto-clip-job',
    kind,
    version: 1,
    status: 'completed',
    path,
    scopeKey: null,
    inputFingerprint: null,
    sha256: null,
    sourceArtifactIds: [],
    metadata: {},
    createdAt: new Date().toISOString()
  };
}

function job(): CreatorJob {
  const now = new Date().toISOString();
  return {
    id: 'auto-clip-job',
    projectId: 'project-1',
    templateId: 'auto-clip',
    templateVersion: 2,
    status: 'running',
    revision: 0,
    state: {
      aspectRatio: '9:16',
      selectedCandidateIds: ['clip-1']
    },
    agentThreadId: null,
    stages: [],
    artifacts: [],
    providerRequests: [],
    activities: [],
    createdAt: now,
    updatedAt: now
  };
}

function stageRun(stageId: 'analyze' | 'render' = 'render'): CreatorStageRun {
  return {
    id: `${stageId}-stage`,
    jobId: 'auto-clip-job',
    stageId,
    executor: 'clip',
    status: 'running',
    dispatchStatus: 'claimed',
    claimOwner: 'test',
    claimExpiresAt: null,
    attempt: 1,
    idempotencyKey: null,
    scopeKey: null,
    inputFingerprint: null,
    progress: {},
    errorCode: null,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };
}

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}
