import type {
  CreateVideoGenerationRequest,
  CreatorArtifact,
  CreatorJson,
  VideoGenerationDuration,
  VideoGenerationProvider,
  VideoGenerationResult,
  VideoGenerationSize
} from '@opencreator/protocol';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { MediaProbe } from '../validators/media.js';
import type { CreatorExecutor, CreatorExecutorInput } from '../executor.js';
import { CreatorExecutorError } from '../executor.js';
import {
  VideoGenerationError,
  type VideoGenerationService
} from '../../video-generation/service.js';

type ProbeVideo = (path: string) => Promise<MediaProbe>;
const MAX_CONSECUTIVE_REFRESH_FAILURES = 3;

export function createVideoExecutor(input: {
  service: VideoGenerationService;
  probeVideo: ProbeVideo;
  pollIntervalMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}): CreatorExecutor {
  const pollIntervalMs = Math.max(250, input.pollIntervalMs ?? 2_500);
  const sleep = input.sleep ?? abortableSleep;

  return {
    id: 'video',
    async run(stage) {
      try {
        stage.reportProgress({
          status: 'running',
          phase: 'validating',
          percent: 3
        });
        const request = await videoRequest(stage);
        const resumedResultId = readResumedResultId(stage);
        const outputPath = join(stage.workdir, 'OpenCreator-generated-video.mp4');

        let result: VideoGenerationResult;
        if (resumedResultId === undefined) {
          stage.reportProgress({
            status: 'running',
            phase: request.referenceImage === undefined
              ? 'submitting'
              : 'preparing_reference',
            percent: request.referenceImage === undefined ? 8 : 5
          });
          if (request.referenceImage !== undefined) {
            stage.reportProgress({
              status: 'running',
              phase: 'submitting',
              percent: 8
            });
          }
          result = await input.service.create(request, {
            signal: stage.signal,
            onDownloadStart: () => reportDownloading(stage)
          });
          stage.reportProgress({
            ...remoteProgress(result),
            videoGenerationResultId: result.id,
            upstreamProvider: result.provider,
            upstreamModel: result.model
          });
        } else {
          result = await input.service.get(resumedResultId);
          stage.reportProgress({
            ...remoteProgress(result),
            videoGenerationResultId: result.id,
            upstreamProvider: result.provider,
            upstreamModel: result.model,
            resumedUpstreamTask: true
          });
        }

        let consecutiveRefreshFailures = 0;
        while (result.status === 'queued' || result.status === 'in_progress') {
          await sleep(pollIntervalMs, stage.signal);
          try {
            result = await input.service.refresh(result.id, {
              signal: stage.signal,
              onDownloadStart: () => reportDownloading(stage)
            });
            consecutiveRefreshFailures = 0;
          } catch (error) {
            if (
              isRetryableRefreshError(error)
              && consecutiveRefreshFailures < MAX_CONSECUTIVE_REFRESH_FAILURES
            ) {
              consecutiveRefreshFailures += 1;
              stage.reportProgress({
                status: 'running',
                phase: 'generating',
                percent: null,
                message: 'The provider status connection was interrupted and will be retried',
                videoGenerationResultId: result.id,
                upstreamProvider: result.provider,
                upstreamModel: result.model,
                refreshRetry: consecutiveRefreshFailures
              });
              continue;
            }
            throw error;
          }
          stage.reportProgress({
            ...remoteProgress(result),
            videoGenerationResultId: result.id,
            upstreamProvider: result.provider,
            upstreamModel: result.model
          });
        }

        if (result.status === 'failed') {
          throw new CreatorExecutorError(
            'creator_video_generation_failed',
            result.error || 'The video provider failed to generate a video'
          );
        }

        stage.reportProgress({
          status: 'running',
          phase: 'collecting_output',
          percent: 94,
          videoGenerationResultId: result.id
        });
        await input.service.copyTo(result.id, outputPath);
        stage.reportProgress({
          status: 'running',
          phase: 'validating_output',
          percent: 97,
          videoGenerationResultId: result.id
        });
        const media = await input.probeVideo(outputPath);
        if (!media.hasVideo) {
          throw new CreatorExecutorError(
            'creator_video_output_invalid',
            'The generated file does not contain a video stream'
          );
        }
        const info = await stat(outputPath);
        const reference = stage.inputArtifacts.find(artifact => artifact.kind === 'reference_image');
        const fileName = result.fileName || 'OpenCreator-generated-video.mp4';
        const metadata: Record<string, CreatorJson> = {
          provider: result.provider,
          model: result.model,
          videoSize: result.videoSize,
          requestedDuration: result.duration,
          duration: media.duration,
          width: media.width ?? null,
          height: media.height ?? null,
          hasAudio: media.hasAudio,
          mimeType: 'video/mp4',
          bytes: info.size,
          size: info.size,
          fileName,
          generationMode: reference === undefined ? 'text-to-video' : 'image-to-video',
          videoGenerationResultId: result.id,
          ...(reference === undefined ? {} : { referenceArtifactId: reference.id })
        };
        stage.reportProgress({
          status: 'succeeded',
          phase: 'completed',
          percent: 100,
          completed: 1,
          failed: 0,
          total: 1,
          videoGenerationResultId: result.id
        });
        return {
          outputs: [{
            kind: 'generated_video',
            status: 'completed',
            path: outputPath,
            metadata
          }],
          progress: {
            status: 'succeeded',
            phase: 'completed',
            percent: 100,
            completed: 1,
            failed: 0,
            total: 1,
            videoGenerationResultId: result.id
          }
        };
      } catch (error) {
        throw creatorVideoError(error);
      }
    }
  };
}

async function videoRequest(
  stage: CreatorExecutorInput
): Promise<CreateVideoGenerationRequest> {
  const prompt = readString(stage.job.state.prompt);
  if (!prompt) {
    throw new CreatorExecutorError(
      'creator_stage_input_missing',
      'Video prompt is required'
    );
  }
  const reference = stage.inputArtifacts.find(artifact => artifact.kind === 'reference_image');
  return {
    prompt,
    provider: readProvider(stage.job.state.provider),
    ...(readString(stage.job.state.model)
      ? { model: readString(stage.job.state.model) }
      : {}),
    size: readSize(stage.job.state.size),
    duration: readDuration(stage.job.state.duration),
    ...(reference === undefined
      ? {}
      : { referenceImage: await readReferenceImage(reference) })
  };
}

async function readReferenceImage(
  artifact: CreatorArtifact
): Promise<NonNullable<CreateVideoGenerationRequest['referenceImage']>> {
  if (artifact.path === null) {
    throw new CreatorExecutorError(
      'creator_stage_input_missing',
      'Reference image file is unavailable'
    );
  }
  const content = await readFile(artifact.path);
  return {
    mime: referenceMime(artifact),
    data: content.toString('base64')
  };
}

function referenceMime(
  artifact: CreatorArtifact
): NonNullable<CreateVideoGenerationRequest['referenceImage']>['mime'] {
  const mime = artifact.metadata.mimeType;
  if (mime === 'image/jpeg' || mime === 'image/webp') return mime;
  const extension = artifact.path === null ? '' : extname(artifact.path).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}

function readResumedResultId(stage: CreatorExecutorInput): string | undefined {
  const resumedFrom = stage.stageRun.progress.resumedFromStageRunId;
  const previous = typeof resumedFrom === 'string'
    ? stage.job.stages.find(candidate => candidate.id === resumedFrom)
    : [...stage.job.stages].reverse().find(candidate => (
        candidate.id !== stage.stageRun.id
        && candidate.stageId === stage.stageRun.stageId
        && candidate.status === 'failed'
        && candidate.errorCode === 'creator_video_upstream_error'
        && typeof candidate.progress.videoGenerationResultId === 'string'
      ));
  const resultId = previous?.progress.videoGenerationResultId;
  return typeof resultId === 'string' && resultId.length > 0 ? resultId : undefined;
}

function remoteProgress(result: VideoGenerationResult): Record<string, CreatorJson> {
  if (result.status === 'completed') {
    return {
      status: 'running',
      phase: 'collecting_output',
      percent: 94
    };
  }
  if (result.status === 'failed') {
    return {
      status: 'failed',
      phase: 'provider_failed',
      percent: null,
      message: result.error ?? 'Video generation failed'
    };
  }
  if (result.status === 'queued') {
    return {
      status: 'running',
      phase: 'queued',
      percent: null,
      message: 'The video generation task is queued'
    };
  }
  return {
    status: 'running',
    phase: 'generating',
    ...(result.progressKnown === true
      ? { percent: Math.max(10, Math.min(90, 10 + Math.round(result.progress * 0.8))) }
      : { percent: null }),
    message: 'The video provider is generating the video'
  };
}

function reportDownloading(stage: CreatorExecutorInput): void {
  if (stage.signal.aborted) return;
  stage.reportProgress({
    status: 'running',
    phase: 'downloading',
    percent: 90
  });
}

function creatorVideoError(error: unknown): CreatorExecutorError {
  if (error instanceof CreatorExecutorError) return error;
  if (error instanceof VideoGenerationError) {
    if (error.code === 'VIDEO_GENERATION_CONFIG_REQUIRED') {
      return new CreatorExecutorError('creator_video_config_missing', error.message);
    }
    if (error.code === 'VALIDATION_FAILED') {
      return new CreatorExecutorError('creator_video_input_invalid', error.message);
    }
    if (error.code === 'VIDEO_GENERATION_NOT_READY') {
      return new CreatorExecutorError('creator_video_not_ready', error.message);
    }
    if (
      error.code === 'VIDEO_GENERATION_UPSTREAM_ERROR'
      && isUnavailableModelError(error.message)
    ) {
      return new CreatorExecutorError('creator_video_model_unavailable', error.message);
    }
    return new CreatorExecutorError('creator_video_upstream_error', error.message);
  }
  if (isAbortError(error)) {
    return new CreatorExecutorError('creator_stage_canceled', 'Creator stage was canceled');
  }
  return new CreatorExecutorError(
    'creator_video_generation_failed',
    error instanceof Error ? error.message : 'Video generation failed'
  );
}

function readString(value: CreatorJson | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUnavailableModelError(message: string): boolean {
  return /(?:not activated|not enabled|not subscribed|no permission|permission denied|access denied).{0,80}(?:model|service)|(?:model|service).{0,80}(?:not activated|not enabled|not subscribed|no permission|permission denied|access denied)/i
    .test(message);
}

function isRetryableRefreshError(error: unknown): boolean {
  return error instanceof VideoGenerationError
    && error.code === 'VIDEO_GENERATION_UPSTREAM_ERROR';
}

function readProvider(value: CreatorJson | undefined): VideoGenerationProvider {
  return value === 'kling' || value === 'veo' ? value : 'seedance';
}

function readSize(value: CreatorJson | undefined): VideoGenerationSize {
  return value === '720x1280' || value === '1024x1024' ? value : '1280x720';
}

function readDuration(value: CreatorJson | undefined): VideoGenerationDuration {
  return value === 4 || value === 6 || value === 8 || value === 10 ? value : 5;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
