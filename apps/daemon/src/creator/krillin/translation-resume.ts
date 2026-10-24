import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { CreatorServicesConfig } from '@opencreator/protocol';
import type { CreatorExecutorInput } from '../executor.js';

// Reuse the existing stage directory and runtime checkpoints only for the same
// audio/VTT task. Credentials, editor style and unrelated job state are excluded.
export function translationResumeStage(
  stage: CreatorExecutorInput,
  options: Record<string, unknown>,
  config: CreatorServicesConfig,
  llmOverride?: { baseUrl: string; model: string }
): CreatorExecutorInput {
  if (stage.job.templateId !== 'video-translation' || stage.stageRun.stageId !== 'subtitle'
    || stage.job.state.sourceType === 'subtitle') return stage;
  const { provider, openai, fasterWhisper, whisperKit, whisperCpp, funasr } = config.transcription;
  const llm = llmOverride ?? config.llm;
  const key = createHash('sha256').update(JSON.stringify({
    version: 1,
    templateVersion: stage.job.templateVersion,
    source: [options.sourceType, options.sourceUrl, options.originLanguage, options.targetLanguage, options.captionSource],
    inputs: stage.inputArtifacts.filter(artifact => ['source_video', 'source_audio', 'source_subtitle'].includes(artifact.kind))
      .map(artifact => [artifact.kind, artifact.id, artifact.metadata?.sha256 ?? null]).sort(),
    llm: [config.llm.source, llm.baseUrl, llm.model],
    transcription: [provider, provider === 'openai' ? [openai.baseUrl, openai.model]
      : provider === 'funasr' ? [funasr.baseUrl, funasr.model]
      : provider === 'faster-whisper' ? fasterWhisper.model
      : provider === 'whisperkit' ? whisperKit.model : provider === 'whisper.cpp' ? whisperCpp.model
      : provider === 'volcengine' ? [config.transcription.volcengine.baseUrl, config.transcription.volcengine.resourceId] : provider]
  })).digest('hex');
  const stages = stage.job.stages ?? [];
  const latest = [...stages].reverse().find(candidate => candidate.id !== stage.stageRun.id
    && candidate.stageId === 'subtitle'
    && candidate.progress.translationResumeKey === key);
  const previous = latest && ['failed', 'interrupted', 'canceled'].includes(latest.status) ? latest : undefined;
  const previousDirectory = previous?.progress.translationWorkdirStageRunId;
  const owner = previous && typeof previousDirectory === 'string'
    && stages.some(candidate => candidate.id === previousDirectory && candidate.stageId === 'subtitle')
    ? previousDirectory : previous?.id ?? stage.stageRun.id;
  stage.reportProgress({ translationResumeKey: key, translationWorkdirStageRunId: owner,
    ...(previous ? { translationResumedFromStageRunId: previous.id } : {}) });
  return owner === stage.stageRun.id ? stage : { ...stage, workdir: join(dirname(stage.workdir), owner) };
}
