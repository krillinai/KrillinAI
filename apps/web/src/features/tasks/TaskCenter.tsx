import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import type { AppLanguage } from '../../i18n/language.js';
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
  const l = useLocalizedCopy();
  const filters: Array<{ value: TaskStatusFilter; label: string }> = [
    { value: 'all', label: l('全部', 'All') },
    { value: 'active', label: l('进行中', 'Active') },
    { value: 'waiting_approval', label: l('待审批', 'Awaiting approval') },
    { value: 'terminal', label: l('已结束', 'Finished') },
    { value: 'failed', label: l('失败', 'Failed') }
  ];
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
      pageIssues.captureOperationFailure('tasks.load', new Error('runtime_unavailable'), l("本地运行内核未连接", "Local running kernel is not connected"));
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
      pageIssues.captureOperationFailure('tasks.load', loadError, l("无法加载任务，请重试。", "Unable to load task, please try again."), { retryable: true });
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
      pageIssues.captureOperationFailure('tasks.approval', approvalError, l("审批操作未完成，请重试。", "The approval operation is not completed, please try again."));
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
      pageIssues.captureOperationFailure('tasks.pause-schedule', pauseError, l("无法暂停任务，请重试。", "Unable to pause task, please try again."));
    }
  }

  return (
    <section className="task-center">
      <div className="task-center__inner">
        <header className="task-center__header">
          <div>
            <h1>{l("任务中心", "Task center")}</h1>
            <p>{l("查看跨会话运行、待审批操作和最近结果。", "View runs across sessions, pending actions, and recent results.")}</p>
          </div>
          <div className="task-center__header-actions">
            {props.unreadIds.size > 0 ? (
              <button type="button" onClick={props.onClearUnread}>
                <Check size={15} aria-hidden="true" />
                {l("全部已读", "All read")}</button>
            ) : null}
            {props.notificationSettings.enabled ? (
              <button type="button" onClick={props.onDisableNotifications}>
                <BellOff size={15} aria-hidden="true" />
                {l("关闭通知", "Turn off notifications")}</button>
            ) : (
              <button
                type="button"
                disabled={props.notificationSettings.permission === 'denied'}
                onClick={() => void props.onEnableNotifications()}
              >
                <Bell size={15} aria-hidden="true" />
                {l("开启通知", "Turn on notifications")}</button>
            )}
            <button
              type="button"
              aria-label={l("刷新任务", "Refresh tasks")}
              title={l("刷新任务", "Refresh tasks")}
              onClick={() => void loadTasks(true)}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="task-center__filters" role="tablist" aria-label={l("任务筛选", "Task filter")}>
          {filters.map(item => (
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
            {l("正在加载任务", "Loading tasks")}</div>
        ) : tasks.length === 0 ? (
          <div className="task-center__state">
            <Clock3 size={22} />
            <strong>{l("当前筛选下没有任务", "No tasks match the current filters")}</strong>
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
            {loadingMore ? l("正在加载", "Loading") : l("加载更多", "load more")}
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
  const l = useLocalizedCopy();
  const { language } = useAppLanguage();
  const approval = props.task.pendingApproval?.status === 'pending'
    ? props.task.pendingApproval
    : undefined;
  return (
    <li className="task-row" data-unread={props.unread ? 'true' : undefined}>
      <button className="task-row__main" type="button" onClick={props.onOpen}>
        <span className={`task-row__status task-row__status--${props.task.status}`}>
          {props.task.status === 'failed' ? <CircleAlert size={15} /> : null}
          {formatStatus(l, props.task.status)}
        </span>
        <span className="task-row__content">
          <strong>{props.task.title}</strong>
          <span>{taskSummary(l, props.task)}</span>
        </span>
        <span className="task-row__time">
          <span>{formatTime(props.task.startedAt ?? props.task.createdAt, language)}</span>
          <span>{formatDuration(l, props.task)}</span>
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
              {l("拒绝", "reject")}</button>
            <button
              className="task-row__approve"
              type="button"
              disabled={props.resolving}
              onClick={props.onApprove}
            >
              <Check size={14} aria-hidden="true" />
              {l("批准", "approve")}</button>
          </div>
        </div>
      ) : null}
      {props.task.failureKind === 'project_directory' ? (
        <div className="task-row__failure-guidance">
          <div>
            <strong>
              {props.task.consecutiveFailureCount === undefined
                ? l("项目目录需要更新", "Project directory needs to be updated")
                : l(`已连续失败 ${props.task.consecutiveFailureCount} 次`, `Failed ${props.task.consecutiveFailureCount} times in a row`)}
            </strong>
            <span>
              {props.task.suggestPause
                ? l("建议先暂停任务，更新项目目录后再恢复。", "It is recommended to pause the task first, update the project directory and then resume it.")
                : l("更新项目目录后可以重新执行。", "You can re-execute after updating the project directory.")}
            </span>
          </div>
          <div>
            {props.onEditSchedule === undefined ? null : (
              <button type="button" onClick={props.onEditSchedule}>
                <FolderOpen size={14} aria-hidden="true" />
                {l("编辑项目", "Edit project")}</button>
            )}
            {!props.task.suggestPause || props.onPauseSchedule === undefined ? null : (
              <button type="button" onClick={() => void props.onPauseSchedule?.()}>
                <PauseCircle size={14} aria-hidden="true" />
                {l("暂停任务", "Pause task")}</button>
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

function formatStatus(l: LocalizeCopy, status: TaskItem['status']): string {
  switch (status) {
    case 'waiting_approval':
      return l("等待审批", "Waiting for approval");
    case 'queued':
      return l("排队中", "Queuing");
    case 'running':
      return l("运行中", "Running");
    case 'succeeded':
      return l("已完成", "Completed");
    case 'failed':
      return l("失败", "fail");
    case 'canceled':
      return l("已取消", "Canceled");
  }
}

function taskSummary(l: LocalizeCopy, task: TaskItem): string {
  if (task.failureSummary) return task.failureSummary;
  if (task.status === 'waiting_approval' && task.pendingApproval !== undefined) {
    return task.pendingApproval.summary;
  }
  if (task.status === 'queued' && task.queuePosition !== undefined) {
    return l(`队列第 ${task.queuePosition} 位 · ${task.cwd}`, `Queue position ${task.queuePosition} · ${task.cwd}`);
  }
  if (task.status === 'failed') return l("任务未完成，请打开会话查看详情。", "The task is not completed, please open the session to view details.");
  return `${task.profile} · ${task.cwd}`;
}

function formatTime(value: string, language: AppLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDuration(l: LocalizeCopy, task: TaskItem): string {
  const start = new Date(task.startedAt ?? task.createdAt).getTime();
  const end = new Date(task.endedAt ?? task.updatedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return l('时长未知', 'Unknown duration');
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return l(`${seconds} 秒`, `${seconds} seconds`);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds === 0
    ? l(`${minutes} 分钟`, `${minutes} minutes`)
    : l(`${minutes} 分 ${remainingSeconds} 秒`, `${minutes} minutes ${remainingSeconds} seconds`);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? l(`${hours} 小时`, `${hours} hours`) : l(`${hours} 小时 ${remainingMinutes} 分`, `${hours} hours ${remainingMinutes} minutes`);
}
