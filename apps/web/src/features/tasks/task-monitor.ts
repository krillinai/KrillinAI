import type { TaskItem } from '@opencreator/protocol';
import type { ActiveView } from '../../app/app-state.js';
import type { HostNotification } from '../../host/bridge.js';

const NOTIFIABLE_STATUSES: ReadonlySet<TaskItem['status']> = new Set([
  'waiting_approval',
  'succeeded',
  'failed',
  'canceled'
]);

export function collectTaskTransitions(
  previous: ReadonlyMap<string, TaskItem['status']>,
  tasks: TaskItem[],
  baselineReady: boolean
): {
  statuses: Map<string, TaskItem['status']>;
  transitions: TaskItem[];
} {
  const statuses = new Map(tasks.map(task => [task.id, task.status]));
  if (!baselineReady) return { statuses, transitions: [] };

  return {
    statuses,
    transitions: tasks.filter(task => (
      NOTIFIABLE_STATUSES.has(task.status)
      && previous.get(task.id) !== task.status
    ))
  };
}

export function shouldAutoSubscribeTask(
  task: TaskItem,
  transitioned = false
): boolean {
  return task.status === 'queued'
    || task.status === 'running'
    || task.status === 'waiting_approval'
    || (transitioned && NOTIFIABLE_STATUSES.has(task.status));
}

export function createTaskNotification(task: TaskItem): {
  title: HostNotification['title'];
  body: HostNotification['body'];
  threadId?: HostNotification['threadId'];
  runId: HostNotification['runId'];
  approvalId?: HostNotification['approvalId'];
} {
  const target = {
    ...(task.threadId === undefined ? {} : { threadId: task.threadId }),
    runId: task.runId,
    ...(task.pendingApproval?.id === undefined
      ? {}
      : { approvalId: task.pendingApproval.id })
  };
  const detail = notificationDetail(task);

  if (task.createdBy === 'schedule') {
    return {
      title: task.status === 'waiting_approval'
        ? `${task.title}: awaiting approval`
        : task.status === 'failed'
          ? `${task.title}: failed`
          : task.status === 'canceled'
            ? `${task.title}: canceled`
            : task.title,
      body: detail,
      ...target
    };
  }

  const title = task.status === 'waiting_approval'
    ? 'Task awaiting approval'
    : task.status === 'succeeded'
      ? 'Task completed'
      : task.status === 'canceled'
        ? 'Task canceled'
        : 'Task failed';
  return {
    title,
    body: `${task.title}：${detail}`,
    ...target
  };
}

function notificationDetail(task: TaskItem): string {
  switch (task.status) {
    case 'waiting_approval':
      return task.pendingApproval?.summary ?? 'Your approval is required.';
    case 'succeeded':
      return task.resultSummary ?? 'The task is complete.';
    case 'failed':
      return task.failureSummary ?? 'The task did not complete. Open its conversation for details.';
    case 'canceled':
      return 'This task was canceled.';
    case 'queued':
      return 'The task is queued.';
    case 'running':
      return 'The task is running.';
  }
}

export function shouldSendSystemNotification(
  task: TaskItem,
  activeView: ActiveView,
  selectedThreadId?: string
): boolean {
  return task.threadId === undefined
    || activeView !== 'conversation'
    || selectedThreadId !== task.threadId;
}
