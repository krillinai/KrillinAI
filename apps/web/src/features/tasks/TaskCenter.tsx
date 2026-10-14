import type {
  ApprovalDecisionResponse,
  TaskItem,
  TaskListResponse,
  TaskStatusFilter
} from '@opencreator/protocol';
import {
  Bell,
  BellOff,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FolderOpen,
  LoaderCircle,
  PauseCircle,
  RefreshCw,
  X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NotificationSettings } from '../../services/notification-service.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';
import './task-center.css';

type TaskService = {
  list(query: {
    status: TaskStatusFilter;
    limit: number;
    cursor?: string;
  }): Promise<TaskListResponse>;
};

type ApprovalService = {
  approve(id: string): Promise<ApprovalDecisionResponse>;
  reject(id: string): Promise<ApprovalDecisionResponse>;
};

const FILTERS: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Running' },
  { value: 'waiting_approval', label: 'Awaiting approval' },
  { value: 'terminal', label: 'Finished' },
  { value: 'failed', label: 'Failed' }
];

export function TaskCenter(props: {
  service: TaskService | null;
  approvalService: ApprovalService | null;
  notificationSettings: NotificationSettings;
  unreadIds: ReadonlySet<string>;
  onEnableNotifications(): Promise<void> | void;
  onDisableNotifications(): void;
  onClearUnread(): void;
  onOpenTask(task: TaskItem): void;
  onMarkRead(id: string): void;
  onEditSchedule?(scheduleId: string): void;
  onPauseSchedule?(scheduleId: string): Promise<void> | void;
}) {
  const [filter, setFilter] = useState<TaskStatusFilter>('all');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(() => new Set());
  const pageIssues = usePageIssueState('tasks');

  useEffect(() => {
    void loadTasks(true);
  }, [filter, props.service]);

  async function loadTasks(reset: boolean) {
    if (props.service === null) {
      setTasks([]);
      pageIssues.captureOperationFailure('tasks.load', new Error('runtime_unavailable'), 'The local Runtime is disconnected');
      return;
    }
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const response = await props.service.list({
        status: filter,
        limit: 20,
        ...(reset || cursor === undefined ? {} : { cursor })
      });
      setTasks(current => reset ? response.tasks : mergeTasks(current, response.tasks));
      setCursor(response.nextCursor);
      setHasMore(response.hasMore);
      pageIssues.resolveOperation('tasks.load');
    } catch (loadError) {
      pageIssues.captureOperationFailure('tasks.load', loadError, 'Could not load tasks. Try again.', { retryable: true });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function resolveApproval(task: TaskItem, decision: 'approve' | 'reject') {
    const approval = task.pendingApproval;
    if (
      approval === undefined
      || props.approvalService === null
      || resolvingIds.has(task.id)
    ) {
      return;
    }
    setResolvingIds(current => new Set(current).add(task.id));
    try {
      const response = decision === 'approve'
        ? await props.approvalService.approve(approval.id)
        : await props.approvalService.reject(approval.id);
      setTasks(current => current.map(item => (
        item.id === task.id
          ? {
              ...item,
              status: item.runStatus,
              pendingApproval: response.approval
            }
          : item
      )));
      await loadTasks(true);
    } catch (approvalError) {
      pageIssues.captureOperationFailure('tasks.approval', approvalError, 'The approval operation did not complete. Try again.');
    } finally {
      setResolvingIds(current => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function pauseSchedule(scheduleId: string) {
    if (props.onPauseSchedule === undefined) return;
    try {
      await props.onPauseSchedule(scheduleId);
      await loadTasks(true);
    } catch (pauseError) {
      pageIssues.captureOperationFailure('tasks.pause-schedule', pauseError, 'Could not pause the task. Try again.');
    }
  }

  return (
    <section className="task-center">
      <div className="task-center__inner">
        <header className="task-center__header">
          <div>
            <h1>Task center</h1>
            <p>View runs across conversations, pending approvals, and recent results.</p>
          </div>
          <div className="task-center__header-actions">
            {props.unreadIds.size > 0 ? (
              <button type="button" onClick={props.onClearUnread}>
                <Check size={15} aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
            {props.notificationSettings.enabled ? (
              <button type="button" onClick={props.onDisableNotifications}>
                <BellOff size={15} aria-hidden="true" />
                Disable notifications
              </button>
            ) : (
              <button
                type="button"
                disabled={props.notificationSettings.permission === 'denied'}
                onClick={() => void props.onEnableNotifications()}
              >
                <Bell size={15} aria-hidden="true" />
                Enable notifications
              </button>
            )}
            <button
              type="button"
              aria-label="Refresh tasks"
              title="Refresh tasks"
              onClick={() => void loadTasks(true)}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="task-center__filters" role="tablist" aria-label="Task filters">
          {FILTERS.map(item => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <IssueList
          issues={pageIssues.issues}
          actions={{ retryOperations: { 'tasks.load': () => loadTasks(true) } }}
          onDismiss={pageIssues.dismissIssue}
        />
        {loading ? (
          <div className="task-center__state" role="status">
            <LoaderCircle className="task-center__spin" size={22} />
            Loading tasks
          </div>
        ) : tasks.length === 0 ? (
          <div className="task-center__state">
            <Clock3 size={22} />
            <strong>No tasks match these filters</strong>
          </div>
        ) : (
          <ul className="task-center__list">
            {tasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                unread={props.unreadIds.has(task.id)}
                resolving={resolvingIds.has(task.id)}
                onOpen={() => {
                  props.onMarkRead(task.id);
                  props.onOpenTask(task);
                }}
                onApprove={() => void resolveApproval(task, 'approve')}
                onReject={() => void resolveApproval(task, 'reject')}
                onEditSchedule={
                  task.scheduleId === undefined || props.onEditSchedule === undefined
                    ? undefined
                    : () => props.onEditSchedule?.(task.scheduleId!)
                }
                onPauseSchedule={
                  task.scheduleId === undefined || props.onPauseSchedule === undefined
                    ? undefined
                    : () => pauseSchedule(task.scheduleId!)
                }
              />
            ))}
          </ul>
        )}

        {hasMore ? (
          <button
            className="task-center__load-more"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadTasks(false)}
          >
            {loadingMore ? <LoaderCircle className="task-center__spin" size={15} /> : null}
            {loadingMore ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function TaskRow(props: {
  task: TaskItem;
  unread: boolean;
  resolving: boolean;
  onOpen(): void;
  onApprove(): void;
  onReject(): void;
  onEditSchedule?(): void;
  onPauseSchedule?(): Promise<void> | void;
}) {
  const approval = props.task.pendingApproval?.status === 'pending'
    ? props.task.pendingApproval
    : undefined;
  return (
    <li className="task-row" data-unread={props.unread ? 'true' : undefined}>
      <button className="task-row__main" type="button" onClick={props.onOpen}>
        <span className={`task-row__status task-row__status--${props.task.status}`}>
          {props.task.status === 'failed' ? <CircleAlert size={15} /> : null}
          {formatStatus(props.task.status)}
        </span>
        <span className="task-row__content">
          <strong>{props.task.title}</strong>
          <span>{taskSummary(props.task)}</span>
        </span>
        <span className="task-row__time">
          <span>{formatTime(props.task.startedAt ?? props.task.createdAt)}</span>
          <span>{formatDuration(props.task)}</span>
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {approval ? (
        <div className="task-row__approval">
          <div>
            <strong>{approval.title}</strong>
            <code>{approval.summary}</code>
          </div>
          <div>
            <button type="button" disabled={props.resolving} onClick={props.onReject}>
              <X size={14} aria-hidden="true" />
              Reject
            </button>
            <button
              className="task-row__approve"
              type="button"
              disabled={props.resolving}
              onClick={props.onApprove}
            >
              <Check size={14} aria-hidden="true" />
              Approve
            </button>
          </div>
        </div>
      ) : null}
      {props.task.failureKind === 'project_directory' ? (
        <div className="task-row__failure-guidance">
          <div>
            <strong>
              {props.task.consecutiveFailureCount === undefined
                ? 'The project directory needs updating'
                : `${props.task.consecutiveFailureCount} consecutive failures`}
            </strong>
            <span>
              {props.task.suggestPause
                ? 'Pause the task, update the project directory, then resume it.'
                : 'Retry after updating the project directory.'}
            </span>
          </div>
          <div>
            {props.onEditSchedule === undefined ? null : (
              <button type="button" onClick={props.onEditSchedule}>
                <FolderOpen size={14} aria-hidden="true" />
                Edit project
              </button>
            )}
            {!props.task.suggestPause || props.onPauseSchedule === undefined ? null : (
              <button type="button" onClick={() => void props.onPauseSchedule?.()}>
                <PauseCircle size={14} aria-hidden="true" />
                Pause task
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function mergeTasks(current: TaskItem[], incoming: TaskItem[]): TaskItem[] {
  const byId = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

function formatStatus(status: TaskItem['status']): string {
  switch (status) {
    case 'waiting_approval':
      return 'Awaiting approval';
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'succeeded':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
  }
}

function taskSummary(task: TaskItem): string {
  if (task.failureSummary) return task.failureSummary;
  if (task.status === 'waiting_approval' && task.pendingApproval !== undefined) {
    return task.pendingApproval.summary;
  }
  if (task.status === 'queued' && task.queuePosition !== undefined) {
    return `Queue position ${task.queuePosition} · ${task.cwd}`;
  }
  if (task.status === 'failed') return 'The task did not complete. Open its conversation for details.';
  return `${task.profile} · ${task.cwd}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDuration(task: TaskItem): string {
  const start = new Date(task.startedAt ?? task.createdAt).getTime();
  const end = new Date(task.endedAt ?? task.updatedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'Unknown duration';
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds === 0
    ? `${minutes}m`
    : `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
