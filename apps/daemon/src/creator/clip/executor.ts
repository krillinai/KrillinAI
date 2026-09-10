import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreatorServicesConfigStore } from '../../creator-services/config-store.js';
import type { CreatorExecutor } from '../executor.js';
import { CreatorExecutorError } from '../executor.js';
import { spawnCreatorProcess } from '../process-tree.js';
import { validateMediaFile } from '../validators/media.js';
import { analyzeClips, parseClipCandidates } from './analyzer.js';

export function createClipExecutor(input: {
  configStore: Pick<CreatorServicesConfigStore, 'read'>;
  ffmpegPath: string;
  ffprobePath: string;
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
          count
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
        const selectedIds = Array.isArray(stage.job.state.selectedCandidateIds)
          ? new Set(stage.job.state.selectedCandidateIds.filter(value => typeof value === 'string'))
          : new Set<string>();
        const selected = candidates.filter(candidate => selectedIds.has(candidate.id));
        if (selected.length === 0) throw new CreatorExecutorError('creator_clip_selection_missing', 'At least one clip must be selected');
        const aspectRatio = readAspectRatio(stage.job.state.aspectRatio);
        const outputs = [];
        for (let index = 0; index < selected.length; index += 1) {
          const candidate = selected[index]!;
          const fileName = `${String(index + 1).padStart(2, '0')}-${safeFileName(candidate.title)}.mp4`;
          const output = join(stage.workdir, fileName);
          stage.reportProgress({
            phase: 'rendering_clips',
            percent: Math.round(index / selected.length * 100),
            completed: index,
            failed: 0,
            total: selected.length,
            message: `Rendering clip ${index + 1} of ${selected.length}`
          });
          await runProcess(input.ffmpegPath, buildClipArguments({
            source,
            output,
            candidate,
            aspectRatio,
            hasAudio: sourceMedia.hasAudio
          }), stage.signal);
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

function buildClipArguments(input: {
  source: string;
  output: string;
  candidate: ReturnType<typeof parseClipCandidates>[number];
  aspectRatio: ClipAspectRatio;
  hasAudio: boolean;
}): string[] {
  const format = aspectRatioFilter(input.aspectRatio);
  const videoFilter = [
    `trim=start=${input.candidate.start}:end=${input.candidate.end}`,
    'setpts=PTS-STARTPTS',
    ...format,
    'format=yuv420p'
  ].join(',');
  const filter = input.hasAudio
    ? `[0:v]${videoFilter}[outv];[0:a]atrim=start=${input.candidate.start}:end=${input.candidate.end},asetpts=PTS-STARTPTS[outa]`
    : `[0:v]${videoFilter}[outv]`;
  return [
    '-y',
    '-i', input.source,
    '-filter_complex', filter,
    '-map', '[outv]',
    ...(input.hasAudio ? ['-map', '[outa]', '-c:a', 'aac'] : ['-an']),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-movflags', '+faststart',
    input.output
  ];
}

function aspectRatioFilter(value: ClipAspectRatio): string[] {
  if (value === '16:9') return ['scale=1920:1080:force_original_aspect_ratio=increase', 'crop=1920:1080'];
  if (value === '9:16') return ['scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920'];
  if (value === '1:1') return ['scale=1080:1080:force_original_aspect_ratio=increase', 'crop=1080:1080'];
  return ['scale=trunc(iw/2)*2:trunc(ih/2)*2'];
}

function readFocus(value: unknown): 'balanced' | 'viral' | 'knowledge' {
  return value === 'viral' || value === 'knowledge' ? value : 'balanced';
}

function readDurationRange(value: unknown): { min: number; max: number } {
  if (value === '15-30') return { min: 15, max: 30 };
  if (value === '60-90') return { min: 60, max: 90 };
  return { min: 30, max: 60 };
}

function readClipCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(20, Math.round(value)))
    : 10;
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

function runProcess(binary: string, args: string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnCreatorProcess(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] }, signal);
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2000))));
  });
}
