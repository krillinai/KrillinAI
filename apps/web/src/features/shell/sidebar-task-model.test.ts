import type { TaskItem } from '@opencreator/protocol';
import type { ThreadResponse } from '@opencreator/protocol';
import { describe, expect, it } from 'vitest';
import { createLocalizedCopy } from '../../i18n/localized-copy.js';
import type { ScheduleTaskSummary } from '../schedules/schedule-task-model.js';
import {
  createScheduleDraftSidebarSummaries,
  createSidebarTaskSummaries
} from './sidebar-task-model.js';

describe('sidebar task model', () => {
  it.each(['sv-SE', 'ja-JP', 'ko-KR', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR'] as const)('localizes generated draft names and next-run labels in %s', language => {
    const l = createLocalizedCopy(language);
    const drafts = createScheduleDraftSidebarSummaries([createDraft({ title: '' }), createDraft({ id: 'named', title: '用户任务标题' })], [], new Set(), new Set(), language);
    expect(drafts[0]?.name).toBe(l('任务草稿', 'Task draft'));
    expect(drafts[1]?.name).toBe('用户任务标题');
    const [summary] = createSidebarTaskSummaries([createSummary({ scheduleId: 'idle', threadId: 'thread', nextRunAt: '2026-07-15T10:00:00Z' })], [], new Set(), language);
    const time = new Intl.DateTimeFormat(language, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date('2026-07-15T10:00:00Z'));
    expect(summary?.nextRunLabel).toBe(l(`下次 ${time}`, `Next: ${time}`));
  });

  it('uses actionable runtime state before schedule state and keeps repair highest priority', () => {
    const summaries = [
      createSummary({
        scheduleId: 'repair',
        threadId: null,
        bindingStatus: 'repair_required',
        bindingIssue: 'missing_thread_id',
        statusMessage: 'The task conversation needs attention',
        currentRunStatus: null
      }),
      createSummary({ scheduleId: 'approval', threadId: 'thread-approval' }),
      createSummary({
        scheduleId: 'running',
        threadId: 'thread-running',
        currentRunStatus: 'running'
      }),
      createSummary({
        scheduleId: 'queued',
        threadId: 'thread-queued',
        pendingTrigger: true
      }),
      createSummary({
        scheduleId: 'paused',
        threadId: 'thread-paused',
        enabled: false,
        lastStatus: 'failed'
      }),
      createSummary({
        scheduleId: 'failed',
        threadId: 'thread-failed',
        lastStatus: 'failed'
      })
    ];
    const runtimeTasks = [
      createTask({
        id: 'task-approval',
        threadId: 'thread-approval',
        status: 'waiting_approval',
        runStatus: 'running'
      })
    ];

    expect(
      createSidebarTaskSummaries(summaries, runtimeTasks, new Set())
        .map(task => [task.id, task.status])
    ).toEqual([
      ['repair', 'repair_required'],
      ['approval', 'waiting_approval'],
      ['running', 'running'],
      ['queued', 'queued'],
      ['paused', 'failed'],
      ['failed', 'failed']
    ]);
  });

  it('formats the next run and marks a schedule unread from any task in its thread', () => {
    const runtimeTask = createTask({
      id: 'task-unread',
      threadId: 'thread-idle',
      status: 'succeeded',
      runStatus: 'succeeded'
    });

    const [task] = createSidebarTaskSummaries(
      [
        createSummary({
          scheduleId: 'idle',
          threadId: 'thread-idle',
          nextRunAt: '2026-07-15T10:00:00.000Z'
        })
      ],
      [runtimeTask],
      new Set(['task-unread'])
    );

    expect(task).toMatchObject({
      id: 'idle',
      threadId: 'thread-idle',
      name: '每日总结',
      status: 'idle',
      unread: true
    });
    expect(task?.nextRunLabel).toMatch(/^下次 /);
  });

  it('shows schedule drafts as task rows with approval and active-run priority', () => {
    const drafts = [
      createDraft({ id: 'draft-idle', title: '空闲草稿' }),
      createDraft({ id: 'draft-running', title: '运行草稿' }),
      createDraft({ id: 'draft-approval', title: '审批草稿' })
    ];
    const runtimeTasks = [
      createTask({
        id: 'task-approval',
        threadId: 'draft-approval',
        status: 'waiting_approval',
        runStatus: 'running'
      })
    ];

    expect(createScheduleDraftSidebarSummaries(
      drafts,
      runtimeTasks,
      new Set(['task-approval']),
      new Set(['draft-running', 'draft-approval'])
    )).toEqual([
      {
        id: 'draft:draft-idle',
        threadId: 'draft-idle',
        name: '空闲草稿',
        status: 'draft',
        unread: false
      },
      {
        id: 'draft:draft-running',
        threadId: 'draft-running',
        name: '运行草稿',
        status: 'running',
        unread: false
      },
      {
        id: 'draft:draft-approval',
        threadId: 'draft-approval',
        name: '审批草稿',
        status: 'waiting_approval',
        unread: true
      }
    ]);
  });
});

function createSummary(
  overrides: Partial<ScheduleTaskSummary> & Pick<ScheduleTaskSummary, 'scheduleId' | 'threadId'>
): ScheduleTaskSummary {
  return {
    name: '每日总结',
    enabled: true,
    nextRunAt: null,
    lastStatus: null,
    pendingTrigger: false,
    bindingStatus: 'ready',
    currentRunStatus: null,
    ...overrides
  } as ScheduleTaskSummary;
}

function createTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-1',
    runId: 'run-1',
    threadId: 'thread-1',
    title: '每日总结',
    status: 'running',
    runStatus: 'running',
    cwd: '/workspace',
    profile: 'default',
    createdBy: 'schedule',
    submissionMode: 'enqueue',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:01:00.000Z',
    ...overrides
  };
}

function createDraft(overrides: Partial<ThreadResponse> = {}): ThreadResponse {
  return {
    id: 'draft-1',
    title: '任务草稿',
    projectId: null,
    origin: 'opencreator_created',
    codexThreadId: null,
    cwd: '/workspace',
    canonicalCwd: '/workspace',
    workspaceMode: 'external',
    profile: 'default',
    model: null,
    reasoning: null,
    sandbox: 'workspace-write',
    status: 'active',
    purpose: 'schedule_draft',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:01:00.000Z',
    archivedAt: null,
    ...overrides
  };
}
