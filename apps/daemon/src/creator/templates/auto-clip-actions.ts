import type { CreatorJob, CreatorStageRun } from '@opencreator/protocol';
import type { CreatorCommandDispatcher } from '../command-dispatcher.js';
import type { CreatorService } from '../service.js';

export type AutoClipWorkflow = ReturnType<typeof createAutoClipWorkflow>;

export function createAutoClipWorkflow(input: {
  creator: CreatorService;
  dispatcher: Pick<CreatorCommandDispatcher, 'dispatch'>;
}) {
  async function continueFrom(stage: CreatorStageRun): Promise<void> {
    if (
      stage.status !== 'succeeded'
      || (stage.progress.workflow !== true && stage.stageId !== 'analyze')
    ) return;
    const job = input.creator.getJob(stage.jobId);
    if (job === undefined || job.templateId !== 'auto-clip') return;
    const nextStageId = nextWorkflowStage(stage.stageId);
    if (nextStageId === undefined) return;
    queueNextStage(job, stage, nextStageId, input.dispatcher);
  }

  return {
    async handleStageChanged(stage: CreatorStageRun): Promise<void> {
      await continueFrom(stage);
    },
    async recover(): Promise<void> {
      for (const job of input.creator.listJobs()) {
        if (job.templateId !== 'auto-clip') continue;
        const completed = [...job.stages].reverse().find(stage => (
          stage.status === 'succeeded'
          && (stage.progress.workflow === true || stage.stageId === 'analyze')
          && nextWorkflowStage(stage.stageId) !== undefined
          && !hasLaterWorkflowStage(job, stage)
        ));
        if (completed !== undefined) await continueFrom(completed);
      }
    }
  };
}

function nextWorkflowStage(stageId: string): string | undefined {
  if (stageId === 'probe') return 'download';
  if (stageId === 'download') return 'subtitle';
  if (stageId === 'subtitle') return 'analyze';
  if (stageId === 'analyze') return 'render';
  return undefined;
}

function queueNextStage(
  job: CreatorJob,
  completed: CreatorStageRun,
  nextStageId: string,
  dispatcher: Pick<CreatorCommandDispatcher, 'dispatch'>
): void {
  const alreadyQueued = job.stages.some(stage => (
    stage.stageId === nextStageId
    && stage.progress.workflowParentStageRunId === completed.id
  ));
  if (alreadyQueued) return;
  dispatcher.dispatch(job.id, {
    action: 'run-stage',
    expectedRevision: job.revision,
    idempotencyKey: `auto-clip:${completed.id}:${nextStageId}`,
    input: {
      stageId: nextStageId,
      workflow: true,
      workflowParentStageRunId: completed.id
    }
  }, 'system');
}

function hasLaterWorkflowStage(job: CreatorJob, completed: CreatorStageRun): boolean {
  const nextStageId = nextWorkflowStage(completed.stageId);
  if (nextStageId === undefined) return true;
  return job.stages.some(stage => (
    stage.stageId === nextStageId
    && stage.progress.workflowParentStageRunId === completed.id
  ));
}
