import type { CreatorJob, CreatorJson, CreatorStageRun } from '@opencreator/protocol';
import { describe, expect, it } from 'vitest';
import { downloadWorkdirStageId } from '../../src/creator/download/resume.js';

function stage(id: string, progress: Record<string, CreatorJson> = {}): CreatorStageRun {
  return { id, jobId: 'job', stageId: 'download', executor: 'download', status: 'interrupted',
    dispatchStatus: 'finished', claimOwner: null, claimExpiresAt: null, attempt: 1,
    idempotencyKey: null, scopeKey: null, inputFingerprint: null,
    errorCode: null, errorMessage: null, startedAt: null, finishedAt: null, progress: {
    optionId: 'video-1080', sourceUrl: 'https://www.youtube.com/watch?v=demo', probeArtifactId: 'probe', ...progress
  } };
}

function job(stages: CreatorStageRun[]): CreatorJob {
  return { templateId: 'video-download', templateVersion: 2, stages } as CreatorJob;
}

describe('download resume directory', () => {
  it('uses the last actual directory for a legacy run that previously restarted in a new directory', () => {
    const first = stage('first');
    const oldResume = stage('old-resume', { resumedFromStageRunId: first.id });
    const current = stage('current', { resumedFromStageRunId: oldResume.id, downloadWorkdirStageRunId: oldResume.id });
    expect(downloadWorkdirStageId(job([first, oldResume, current]), current)).toBe(oldResume.id);
  });

  it('keeps the original partial files through repeated pauses, including a resumed run paused while queued', () => {
    const first = stage('first', { downloadWorkdirStageRunId: 'first' });
    const queued = stage('queued', { resumedFromStageRunId: first.id, downloadWorkdirStageRunId: first.id });
    const current = stage('current', { resumedFromStageRunId: queued.id, downloadWorkdirStageRunId: first.id });
    expect(downloadWorkdirStageId(job([first, queued, current]), current)).toBe(first.id);
  });

  it('never reuses files from a different format or an explicitly canceled download', () => {
    const first = stage('first', { optionId: 'video-720' });
    const current = stage('current', { resumedFromStageRunId: first.id, downloadWorkdirStageRunId: first.id });
    expect(downloadWorkdirStageId(job([first, current]), current)).toBe(current.id);
    first.progress.optionId = current.progress.optionId!;
    first.progress.downloadControl = 'canceled';
    expect(downloadWorkdirStageId(job([first, current]), current)).toBe(current.id);
  });
});
