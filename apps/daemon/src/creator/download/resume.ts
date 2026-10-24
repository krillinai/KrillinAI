import type { CreatorJob, CreatorStageRun } from '@opencreator/protocol';

export function downloadWorkdirStageId(job: CreatorJob, stage: CreatorStageRun): string {
  if (job.templateId !== 'video-download' || job.templateVersion < 2 || stage.stageId !== 'download') return stage.id;
  const workdirStageId = stage.progress.downloadWorkdirStageRunId;
  if (typeof workdirStageId !== 'string') return stage.id;
  let current = stage;
  const visited = new Set([current.id]);
  if (current.id === workdirStageId) return current.id;
  while (typeof current.progress.resumedFromStageRunId === 'string') {
    const previous = job.stages.find(candidate => candidate.id === current.progress.resumedFromStageRunId);
    if (!previous || visited.has(previous.id) || previous.stageId !== 'download'
      || !['canceled', 'interrupted'].includes(previous.status)
      || previous.progress.downloadControl === 'canceled'
      || previous.progress.optionId !== stage.progress.optionId
      || previous.progress.sourceUrl !== stage.progress.sourceUrl
      || previous.progress.probeArtifactId !== stage.progress.probeArtifactId) break;
    visited.add(previous.id);
    current = previous;
    if (current.id === workdirStageId) return current.id;
  }
  return stage.id;
}
