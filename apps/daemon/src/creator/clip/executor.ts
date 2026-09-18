import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreatorServicesConfigStore } from '../../creator-services/config-store.js';
import type { CreatorExecutor } from '../executor.js';
import { CreatorExecutorError } from '../executor.js';
import { spawnCreatorProcess } from '../process-tree.js';
import { validateMediaFile } from '../validators/media.js';
import { analyzeClips, parseClipCandidates, type ClipGenre } from './analyzer.js';

export function createClipExecutor(input: {
  configStore: Pick<CreatorServicesConfigStore, 'read'>;
  ffmpegPath: string;
  ffprobePath: string;
  preferHardwareEncoding?: boolean;
}): CreatorExecutor {
  return {
    id: 'clip',
    async run(stage) {
      if (stage.stageRun.stageId === 'analyze') {
        stage.reportProgress({
          phase: 'validating',
          percent: 5,
          message: 'Checking the source video and analysis settings'
        });
        const config = await input.configStore.read();
        if (!config.llm.apiKey) throw new CreatorExecutorError('creator_llm_config_missing', 'LLM configuration is incomplete');
        const subtitle = stage.inputArtifacts.find(artifact => artifact.kind.includes('subtitle'))?.path;
        const source = stage.inputArtifacts.find(artifact => artifact.kind === 'source_video')?.path;
        if (!subtitle || !source) throw new CreatorExecutorError('creator_stage_input_missing', 'Video and subtitle are required');
        const media = await validateMediaFile(source, input.ffprobePath);
        const durationRange = readDurationRange(stage.job.state.duration);
        const focus = readFocus(stage.job.state.focus);
        const count = readClipCount(stage.job.state.clipCount);
        const genre = readGenre(stage.job.state.genre);
        stage.reportProgress({
          phase: 'analyzing_clips',
          percent: 30,
          message: 'Finding the strongest standalone moments'
        });
        const candidates = await analyzeClips({
          ...config.llm,
          transcript: await readFile(subtitle, 'utf8'),
          duration: media.duration,
          focus,
          minDuration: durationRange.min,
          maxDuration: durationRange.max,
          count,
          genre
        });
        const path = join(stage.workdir, 'clip-candidates.json');
        await writeFile(path, `${JSON.stringify({ candidates }, null, 2)}\n`);
        const progress = {
          phase: 'completed',
          percent: 100,
          completed: candidates.length,
          failed: 0,
          total: candidates.length,
          message: `Found ${candidates.length} clip candidates`
        };
        stage.reportProgress(progress);
        return {
          outputs: [{
            kind: 'clip_candidates',
            status: 'completed',
            path,
            metadata: {
              candidates,
              focus,
              genre,
              duration: `${durationRange.min}-${durationRange.max}`,
              clipCount: candidates.length
            }
          }],
          progress
        };
      }
      if (stage.stageRun.stageId === 'render') {
        const source = stage.inputArtifacts.find(artifact => artifact.kind === 'source_video')?.path;
        const candidateArtifact = stage.inputArtifacts.find(artifact => artifact.kind === 'clip_candidates');
        if (!source || !candidateArtifact?.path) throw new CreatorExecutorError('creator_stage_input_missing', 'Source and clip candidates are required');
        const raw = JSON.parse(await readFile(candidateArtifact.path, 'utf8')) as unknown;
        const sourceMedia = await validateMediaFile(source, input.ffprobePath);
        const duration = sourceMedia.duration;
        const candidates = parseClipCandidates(raw, duration);
        if (candidates.length === 0) throw new CreatorExecutorError('creator_clip_candidates_missing', 'No clips are available to render');
        const aspectRatio = readAspectRatio(stage.job.state.aspectRatio);
        const outputs = [];
        let videoEncoder: ClipVideoEncoder = (input.preferHardwareEncoding ?? process.platform === 'darwin')
          ? 'h264_videotoolbox'
          : 'libx264';
        for (let index = 0; index < candidates.length; index += 1) {
          const candidate = candidates[index]!;
          const clipDuration = candidate.end - candidate.start;
          const fileName = `${String(index + 1).padStart(2, '0')}-${safeFileName(candidate.title)}.mp4`;
          const output = join(stage.workdir, fileName);
          let lastReportedPercent = Math.round(index / candidates.length * 100);
          stage.reportProgress({
            phase: 'rendering_clips',
            percent: lastReportedPercent,
            completed: index,
            failed: 0,
            total: candidates.length,
            message: `Rendering clip ${index + 1} of ${candidates.length}`
          });
          const renderInput = {
            source,
            output,
            candidate,
            aspectRatio,
            hasAudio: sourceMedia.hasAudio,
            videoEncoder
          };
          const reportRenderProgress = (renderedSeconds: number) => {
            const clipProgress = Math.max(0, Math.min(1, renderedSeconds / clipDuration));
            const percent = Math.min(99, Math.round((index + clipProgress) / candidates.length * 100));
            if (percent <= lastReportedPercent) return;
            lastReportedPercent = percent;
            stage.reportProgress({
              phase: 'rendering_clips',
              percent,
              completed: index,
              failed: 0,
              total: candidates.length,
              message: `Rendering clip ${index + 1} of ${candidates.length}`
            });
          };
          try {
            await runProcess(
              input.ffmpegPath,
              buildClipArguments(renderInput),
              stage.signal,
              reportRenderProgress
            );
          } catch (error) {
            if (videoEncoder !== 'h264_videotoolbox' || stage.signal.aborted) throw error;
            videoEncoder = 'libx264';
            renderInput.videoEncoder = videoEncoder;
            stage.reportProgress({
              phase: 'rendering_clips',
              percent: lastReportedPercent,
              completed: index,
              failed: 0,
              total: candidates.length,
              message: 'Hardware encoding unavailable; retrying with software encoding'
            });
            await runProcess(
              input.ffmpegPath,
              buildClipArguments(renderInput),
              stage.signal,
              reportRenderProgress
            );
          }
          outputs.push({
            kind: 'auto_clip_video' as const,
            status: 'completed' as const,
            path: output,
            sourceArtifactIds: [candidateArtifact.id, ...candidateArtifact.sourceArtifactIds],
            metadata: {
              ...await validateMediaFile(output, input.ffprobePath),
              fileName,
              candidateId: candidate.id,
              title: candidate.title,
              transcript: candidate.transcript,
              start: candidate.start,
              end: candidate.end,
              duration: candidate.end - candidate.start,
              aspectRatio,
              candidateArtifactId: candidateArtifact.id
            }
          });
        }
        const progress = {
          phase: 'completed',
          percent: 100,
          completed: outputs.length,
          failed: 0,
          total: outputs.length,
          message: `Rendered ${outputs.length} clips`
        };
        stage.reportProgress(progress);
        return { outputs, progress };
      }
      throw new CreatorExecutorError('creator_stage_not_supported', 'Unsupported clip stage');
    }
  };
}

type ClipAspectRatio = 'source' | '16:9' | '9:16' | '1:1';
type ClipVideoEncoder = 'libx264' | 'h264_videotoolbox';

function buildClipArguments(input: {
  source: string;
  output: string;
  candidate: ReturnType<typeof parseClipCandidates>[number];
  aspectRatio: ClipAspectRatio;
  hasAudio: boolean;
  videoEncoder: ClipVideoEncoder;
}): string[] {
  const format = aspectRatioFilter(input.aspectRatio);
  const videoFilter = [
    'setpts=PTS-STARTPTS',
    ...format,
    'format=yuv420p'
  ].join(',');
  const filter = input.hasAudio
    ? `[0:v]${videoFilter}[outv];[0:a]asetpts=PTS-STARTPTS[outa]`
    : `[0:v]${videoFilter}[outv]`;
  return [
    '-y',
    '-ss', formatFfmpegTime(input.candidate.start),
    '-i', input.source,
    '-t', formatFfmpegTime(input.candidate.end - input.candidate.start),
    '-filter_complex', filter,
    '-map', '[outv]',
    ...(input.hasAudio ? ['-map', '[outa]', '-c:a', 'aac'] : ['-an']),
    ...videoEncoderArguments(input.videoEncoder),
    '-movflags', '+faststart',
    '-progress', 'pipe:2',
    '-nostats',
    input.output
  ];
}

function aspectRatioFilter(value: ClipAspectRatio): string[] {
  if (value === '16:9') return ["crop='min(iw,ih*16/9)':'min(ih,iw*9/16)'", 'scale=1920:1080:flags=bilinear'];
  if (value === '9:16') return ["crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'", 'scale=1080:1920:flags=bilinear'];
  if (value === '1:1') return ["crop='min(iw,ih)':'min(iw,ih)'", 'scale=1080:1080:flags=bilinear'];
  return ['scale=trunc(iw/2)*2:trunc(ih/2)*2'];
}

function videoEncoderArguments(value: ClipVideoEncoder): string[] {
  return value === 'h264_videotoolbox'
    ? ['-c:v', value, '-q:v', '65', '-realtime', 'true', '-prio_speed', 'true']
    : ['-c:v', value, '-preset', 'veryfast'];
}

function formatFfmpegTime(value: number): string {
  return String(Math.max(0, Number(value.toFixed(3))));
}

function readFocus(value: unknown): 'balanced' | 'viral' | 'knowledge' {
  return value === 'viral' || value === 'knowledge' ? value : 'balanced';
}

function readGenre(value: unknown): ClipGenre {
  return value === 'talk'
    || value === 'podcast'
    || value === 'tutorial'
    || value === 'interview'
    || value === 'entertainment'
    || value === 'sports'
    || value === 'gaming'
    || value === 'news'
    ? value
    : 'auto';
}

function readDurationRange(value: unknown): { min: number; max: number } {
  if (value === '15-30') return { min: 15, max: 30 };
  if (value === '60-90') return { min: 60, max: 90 };
  return { min: 30, max: 60 };
}

function readClipCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(20, Math.round(value)))
    : 3;
}

function readAspectRatio(value: unknown): ClipAspectRatio {
  return value === '16:9' || value === '9:16' || value === '1:1' ? value : 'source';
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return normalized || 'video-clip';
}

function runProcess(
  binary: string,
  args: string[],
  signal: AbortSignal,
  onProgress?: (seconds: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnCreatorProcess(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] }, signal);
    let stderr = '';
    let progressBuffer = '';
    child.stderr?.on('data', chunk => {
      const text = String(chunk);
      stderr = `${stderr}${text}`.slice(-4000);
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const seconds = parseFfmpegProgressTime(line);
        if (seconds !== null) onProgress?.(seconds);
      }
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2000))));
  });
}

function parseFfmpegProgressTime(line: string): number | null {
  const match = /^out_time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(line.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(seconds) ? seconds : null;
}
