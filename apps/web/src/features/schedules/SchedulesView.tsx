import type { LocalizeCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import type {
  CreateScheduleRequest,
  CodexProfileResponse,
  ScheduleDetailResponse,
  ScheduleListResponse,
  ScheduleOperationListResponse,
  ScheduleResponse,
  UpdateScheduleRequest,
} from '@opencreator/protocol';
import {
  Bell,
  CalendarClock,
  CirclePlay,
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useConfirmDialog } from '../../components/dialogs/ConfirmDialogProvider.js';
import { ApiClientError } from '../../runtime/errors.js';
import type { OpenCreatorProject } from '../projects/project-model.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';
import {
  createScheduleRequest,
  createScheduleUpdate,
  ScheduleEditor,
  scheduleDetailToEditorValues,
  scheduleResponseToEditorValues,
  type ScheduleEditorErrors,
  type ScheduleEditorValues,
  validateScheduleEditorValues,
} from './ScheduleEditor.js';
import {
  defaultScheduleFrequency,
  formatScheduleFrequency,
  formatScheduleNextRun,
  scheduleFrequencyToCron,
  type ScheduleFrequency,
} from './schedule-frequency.js';
import './schedules-view.css';

export type ScheduleViewService = {
  listSchedules(): Promise<ScheduleListResponse>;
  getSchedule(id: string): Promise<ScheduleDetailResponse>;
  createSchedule(input: CreateScheduleRequest): Promise<ScheduleResponse>;
  updateSchedule(id: string, input: UpdateScheduleRequest): Promise<ScheduleResponse>;
  deleteSchedule(id: string): Promise<{ deleted: true }>;
  listOperations(id: string, limit?: number): Promise<ScheduleOperationListResponse>;
};

type EditorState =
  | {
      mode: 'create';
      source: 'manual' | 'suggestion';
      values: ScheduleEditorValues;
    }
  | {
      mode: 'edit';
      scheduleId: string;
      values: ScheduleEditorValues;
      loading: boolean;
    };

type ScheduleFilter = 'all' | 'enabled' | 'paused';

export type SchedulesViewProps = {
  connected: boolean;
  service: ScheduleViewService | null;
  projects: OpenCreatorProject[];
  currentProjectId: string;
  editScheduleId?: string;
  profiles?: CodexProfileResponse[];
  defaultTimezone: string;
  pollIntervalMs?: number;
  onOpenTask(threadId: string, runId?: string): void;
  onRunNow(schedule: ScheduleResponse): Promise<void> | void;
  onScheduleChanged(schedule: ScheduleResponse): void;
  onScheduleDeleted(schedule: ScheduleResponse): void;
  confirmDelete?(schedule: ScheduleResponse): boolean;
};

export function SchedulesView(props: SchedulesViewProps) {
  const l = useLocalizedCopy();
  const { language } = useAppLanguage();
  const confirm = useConfirmDialog();
  const [schedules, setSchedules] = useState<ScheduleResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [editor, setEditor] = useState<EditorState>();
  const [editorErrors, setEditorErrors] = useState<ScheduleEditorErrors>({});
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const requestGenerationRef = useRef(0);
  const openedExternalEditIdRef = useRef<string>();
  const pageIssues = usePageIssueState('schedules');

  const currentProject = useMemo(
    () => props.projects.find(project => project.id === props.currentProjectId) ?? props.projects[0],
    [props.currentProjectId, props.projects]
  );

  const loadSchedules = useCallback(async (showLoading: boolean) => {
    if (!props.connected || props.service === null) return;
    const generation = ++requestGenerationRef.current;
    if (showLoading) setLoading(true);
    setLoadError(undefined);
    try {
      const response = await props.service.listSchedules();
      if (generation !== requestGenerationRef.current) return;
      setSchedules(response.schedules);
      pageIssues.resolveOperation('schedules.load');
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      setLoadError('无法加载定时任务');
      pageIssues.captureOperationFailure('schedules.load', cause, l("无法加载定时任务，请重试。", "Unable to load the scheduled task, please try again."), { retryable: true });
    } finally {
      if (generation === requestGenerationRef.current && showLoading) setLoading(false);
    }
  }, [props.connected, props.service]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    setEditor(undefined);
    if (!props.connected || props.service === null) {
      setSchedules([]);
      setLoading(false);
      setLoadError(undefined);
      return;
    }
    void loadSchedules(true);
  }, [loadSchedules, props.connected, props.service]);

  useEffect(() => {
    const intervalMs = props.pollIntervalMs ?? 15_000;
    if (!props.connected || props.service === null || intervalMs <= 0) return;
    const interval = window.setInterval(() => void loadSchedules(false), intervalMs);
    return () => window.clearInterval(interval);
  }, [loadSchedules, props.connected, props.pollIntervalMs, props.service]);

  useEffect(() => {
    const scheduleId = props.editScheduleId;
    if (scheduleId === undefined) {
      openedExternalEditIdRef.current = undefined;
      return;
    }
    if (openedExternalEditIdRef.current === scheduleId) return;
    const schedule = schedules.find(item => item.id === scheduleId);
    if (schedule === undefined) return;
    openedExternalEditIdRef.current = scheduleId;
    void openEditEditor(schedule);
  }, [props.editScheduleId, schedules]);

  useEffect(() => {
    if (editor === undefined) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditor(undefined);
        setEditorErrors({});
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [editor]);

  const filteredSchedules = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return schedules.filter(schedule => {
      if (filter === 'enabled' && !schedule.enabled) return false;
      if (filter === 'paused' && schedule.enabled) return false;
      if (normalizedQuery.length === 0) return true;
      return [
        schedule.name,
        schedule.promptPreviewRedacted,
        formatScheduleFrequency(schedule.cron, language),
      ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, schedules]);

  if (!props.connected || props.service === null) {
    return (
      <section className="schedules-view">
        <div className="schedules-state">
          <CalendarClock size={28} aria-hidden="true" />
          <h2>{l("已安排功能暂不可用", "Scheduled functions are temporarily unavailable")}</h2>
          <p>{l("连接本地运行内核后可以创建和管理任务", "Connect to the local Runtime to create and manage tasks")}</p>
        </div>
      </section>
    );
  }

  function openCreateEditor(
    source: 'manual' | 'suggestion' = 'manual',
    override?: Partial<ScheduleEditorValues>
  ) {
    setEditorErrors({});
    setEditor({
      mode: 'create',
      source,
      values: {
        ...createDefaultValues(currentProject, props.defaultTimezone),
        ...override,
      },
    });
  }

  async function openEditEditor(schedule: ScheduleResponse) {
    if (props.service === null) return;
    setEditorErrors({});
    setEditor({
      mode: 'edit',
      scheduleId: schedule.id,
      values: scheduleResponseToEditorValues(schedule),
      loading: true,
    });
    try {
      const detail = await props.service.getSchedule(schedule.id);
      setEditor(current => (
        current?.mode === 'edit' && current.scheduleId === schedule.id
          ? {
              mode: 'edit',
              scheduleId: schedule.id,
              values: scheduleDetailToEditorValues(detail),
              loading: false,
            }
          : current
      ));
    } catch (error) {
      pageIssues.captureOperationFailure('schedules.load-detail', error, l("无法加载计划详情，请重试。", "Unable to load plan details, please try again."));
      setEditor(current => (
        current?.mode === 'edit' && current.scheduleId === schedule.id
          ? { ...current, loading: false }
          : current
      ));
    }
  }

  async function saveEditor(values: ScheduleEditorValues) {
    if (props.service === null || editor === undefined) return;
    const validationErrors = validateScheduleEditorValues(values, l);
    if (Object.keys(validationErrors).length > 0) {
      setEditorErrors(validationErrors);
      return;
    }

    setSaving(true);
    setEditorErrors({});
    try {
      const saved = editor.mode === 'create'
        ? await props.service.createSchedule(createScheduleRequest(values))
        : await props.service.updateSchedule(editor.scheduleId, createScheduleUpdate(values));
      setEditor(undefined);
      setEditorErrors({});
      setSchedules(current => upsertSchedule(current, saved));
      props.onScheduleChanged(saved);
      pageIssues.resolveOperation('schedules.save');
    } catch (error) {
      const mapped = mapScheduleError(l, error);
      setEditorErrors({ ...mapped, form: undefined });
      pageIssues.captureOperationFailure('schedules.save', error, mapped.form ?? l("无法保存计划任务，请检查后重试。", "Unable to save scheduled task, please check and try again."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleSchedule(schedule: ScheduleResponse) {
    if (props.service === null || busyIds.has(schedule.id)) return;
    const enabled = !schedule.enabled;
    setSchedules(current => replaceSchedule(current, { ...schedule, enabled }));
    setBusy(schedule.id, true);
    try {
      const updated = await props.service.updateSchedule(schedule.id, { enabled });
      setSchedules(current => replaceSchedule(current, updated));
      props.onScheduleChanged(updated);
      pageIssues.resolveOperation('schedules.toggle');
    } catch (error) {
      setSchedules(current => replaceSchedule(current, schedule));
      pageIssues.captureOperationFailure('schedules.toggle', error, l("无法更新任务状态，请重试。", "Unable to update task status, please try again."));
    } finally {
      setBusy(schedule.id, false);
    }
  }

  async function runSchedule(schedule: ScheduleResponse) {
    if (busyIds.has(schedule.id)) return;
    setBusy(schedule.id, true);
    try {
      await props.onRunNow(schedule);
      pageIssues.resolveOperation('schedules.run-now');
    } catch (error) {
      pageIssues.captureOperationFailure('schedules.run-now', error, l("无法立即运行任务，请重试。", "Unable to run task now, please try again."));
    } finally {
      setBusy(schedule.id, false);
    }
  }

  async function deleteSchedule(schedule: ScheduleResponse) {
    if (props.service === null || busyIds.has(schedule.id)) return;
    const confirmed = props.confirmDelete?.(schedule)
      ?? await confirm({
        title: l('删除任务', 'Delete task'),
        description: l(`确认删除“${schedule.name}”？删除后无法恢复。`, `Delete “${schedule.name}”? This cannot be undone.`),
        confirmLabel: l('删除任务', 'Delete task'),
        destructive: true
      });
    if (!confirmed) return;
    setBusy(schedule.id, true);
    try {
      await props.service.deleteSchedule(schedule.id);
      setSchedules(current => current.filter(item => item.id !== schedule.id));
      props.onScheduleDeleted(schedule);
      pageIssues.resolveOperation('schedules.delete');
      if (editor?.mode === 'edit' && editor.scheduleId === schedule.id) {
        setEditor(undefined);
      }
    } catch (error) {
      pageIssues.captureOperationFailure('schedules.delete', error, l("无法删除任务，请重试。", "Unable to delete task, please try again."));
    } finally {
      setBusy(schedule.id, false);
    }
  }

  function setBusy(id: string, busy: boolean) {
    setBusyIds(current => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }


  function closeEditor() {
    setEditor(undefined);
    setEditorErrors({});
  }

  return (
    <section className="schedules-view">
      <div className="schedules-view__inner">
        <>
            <header className="schedules-view__header">
              <div>
                <h1>{l("定时任务", "Scheduled tasks")}</h1>
                <p>{l("安排任务、设置提醒或定期处理工作", "Schedule tasks, set reminders, or schedule work")}</p>
              </div>
              <button
                className="schedule-button schedule-button--secondary"
                type="button"
                onClick={() => openCreateEditor('manual')}
              >
                <Plus size={16} />
                {l("创建", "create")}</button>
            </header>
            <IssueList
              issues={pageIssues.issues}
              actions={{ retryOperations: {
                'schedules.load': () => loadSchedules(true)
              } }}
              onDismiss={pageIssues.dismissIssue}
            />

            <label className="schedules-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label={l("搜索定时任务", "Search for scheduled tasks")}
                type="search"
                value={query}
                placeholder={l("搜索定时任务", "Search for scheduled tasks")}
                onChange={event => setQuery(event.target.value)}
              />
            </label>

            <div className="schedules-filters" role="group" aria-label={l("任务状态", "Task status")}>
              {scheduleFilterOptions.map(option => (
                <button
                  aria-pressed={filter === option.value}
                  className={filter === option.value ? 'is-active' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                >
                  {l(option.label, option.labelEn)}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="schedules-state" role="status">
                <LoaderCircle size={24} className="schedule-spin" />
                {l("正在加载定时任务", "Loading scheduled tasks")}</div>
            ) : loadError ? (
              <div className="schedules-state" role="status">
                <p>{l("当前没有可显示的任务。", "There are currently no tasks to display.")}</p>
                <button
                  className="schedule-button schedule-button--secondary"
                  type="button"
                  onClick={() => void loadSchedules(true)}
                >
                  <RefreshCw size={16} />
                  {l("重新加载", "reload")}</button>
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="schedules-empty">
                <CalendarClock size={24} aria-hidden="true" />
                <strong>
                  {schedules.length === 0 ? l("还没有定时任务", "There are no scheduled tasks yet") : l("没有找到匹配的任务", "No matching tasks found")}
                </strong>
                <span>
                  {schedules.length === 0
                    ? l("从建议开始，或者创建一个自己的任务", "Start with a suggestion, or create a task of your own")
                    : l("换个关键词或状态筛选试试", "Try changing keywords or status filtering")}
                </span>
              </div>
            ) : (
              <ul className="schedules-list">
                {filteredSchedules.map(schedule => {
                  const busy = busyIds.has(schedule.id);
                  const nextRun = formatScheduleNextRun(
                    schedule.nextRunAt,
                    schedule.timezone,
                    language
                  );
                  return (
                    <li className="schedule-row" key={schedule.id}>
                      <div className="schedule-row__icon" aria-hidden="true">
                        {schedule.enabled ? <Bell size={17} /> : <CalendarClock size={17} />}
                      </div>
                      <div className="schedule-row__content">
                        <div className="schedule-row__title">
                          <h2>
                            <button
                              className="schedule-row__title-button"
                              type="button"
                              aria-label={l(`打开任务会话 ${schedule.name}`, `Open task conversation ${schedule.name}`)}
                              onClick={() => props.onOpenTask(schedule.threadId)}
                            >
                              {schedule.name}
                            </button>
                          </h2>
                          {schedule.lastStatus === 'running'
                            || schedule.lastStatus === 'queued' ? (
                              <span className="schedule-running-label">
                                <LoaderCircle size={13} className="schedule-spin" />
                                {lastStatusLabel(l, schedule.lastStatus)}
                              </span>
                            ) : null}
                        </div>
                        <p>{schedule.promptPreviewRedacted}</p>
                        <div className="schedule-row__meta">
                          <span>{formatScheduleFrequency(schedule.cron, language)}</span>
                          {nextRun ? <span>{l(`下次 ${nextRun}`, `Next: ${nextRun}`)}</span> : null}
                          {!schedule.enabled ? <span>{l("已暂停", "Paused")}</span> : null}
                        </div>
                        {schedule.lastRunId ? (
                          <button
                            className="schedule-row__run-link"
                            type="button"
                            onClick={() => props.onOpenTask(
                              schedule.threadId,
                              schedule.lastRunId!
                            )}
                          >
                            <ExternalLink size={14} />
                            {l("查看上次运行", "View last run")}</button>
                        ) : null}
                      </div>
                      <div className="schedule-row__actions">
                        <button
                          className="schedule-switch"
                          type="button"
                          role="switch"
                          aria-checked={schedule.enabled}
                          aria-label={schedule.enabled ? l(`暂停${schedule.name}`, `Pause ${schedule.name}`) : l(`启用${schedule.name}`, `Enable ${schedule.name}`)}
                          disabled={busy}
                          onClick={() => void toggleSchedule(schedule)}
                        />
                        <button
                          className="schedule-icon-button"
                          type="button"
                          aria-label={l(`立即运行${schedule.name}`, `Run now${schedule.name}`)}
                          title={l("立即运行", "Run now")}
                          disabled={busy}
                          onClick={() => void runSchedule(schedule)}
                        >
                          {busy ? (
                            <LoaderCircle size={16} className="schedule-spin" />
                          ) : (
                            <CirclePlay size={16} />
                          )}
                        </button>
                        <button
                          className="schedule-icon-button"
                          type="button"
                          aria-label={l(`编辑${schedule.name}`, `Edit${schedule.name}`)}
                          title={l("编辑", "Edit")}
                          disabled={busy}
                          onClick={() => void openEditEditor(schedule)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="schedule-icon-button"
                          type="button"
                          aria-label={l(`删除${schedule.name}`, `Delete${schedule.name}`)}
                          title={l("删除", "Delete")}
                          disabled={busy}
                          onClick={() => void deleteSchedule(schedule)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {query.trim().length === 0 && filter === 'all' ? (
              <section className="schedule-suggestions" aria-labelledby="schedule-suggestions-heading">
                <h2 id="schedule-suggestions-heading">{l("建议", "Suggestions")}</h2>
                <div className="schedule-suggestion-list">
                {scheduleSuggestions(l).map(suggestion => {
                    const Icon = suggestion.icon;
                    return (
                      <button
                        key={suggestion.name}
                        type="button"
                        onClick={() => openCreateEditor('suggestion', {
                          name: suggestion.name,
                          prompt: suggestion.prompt,
                          frequency: suggestion.frequency,
                        })}
                      >
                        <Icon
                          className={`schedule-suggestion-icon schedule-suggestion-icon--${suggestion.tone}`}
                          size={18}
                          aria-hidden="true"
                        />
                        <span>
                          <strong>
                            {suggestion.name}
                            <small>{suggestion.scheduleLabel}</small>
                          </strong>
                          <span>{suggestion.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          {editor ? (
            <div
              className="schedule-editor-overlay"
              onMouseDown={event => {
                if (event.target === event.currentTarget) closeEditor();
              }}
            >
              <div
                aria-label={editor.mode === 'create' ? l("创建定时任务", "Create a scheduled task") : l("编辑定时任务", "Edit scheduled tasks")}
                aria-modal="true"
                className="schedule-editor-dialog"
                role="dialog"
              >
                <ScheduleEditor
                  mode={editor.mode}
                  initialValues={editor.values}
                  projects={props.projects}
                  loading={editor.mode === 'edit' && editor.loading}
                  saving={saving}
                  errors={editorErrors}
                  onCancel={closeEditor}
                  onSubmit={values => void saveEditor(values)}
                />
              </div>
            </div>
          ) : null}
        </>
      </div>
    </section>
  );
}

function createDefaultValues(
  project: OpenCreatorProject | undefined,
  timezone: string
): ScheduleEditorValues {
  return {
    name: '',
    prompt: '',
    frequency: { ...defaultScheduleFrequency },
    timezone,
    cwd: project?.cwd ?? '',
    profile: project?.profile ?? 'default',
    model: project?.model ?? '',
    reasoning: (project?.reasoning ?? '') as ScheduleEditorValues['reasoning'],
    sandbox: project?.sandbox === 'danger-full-access'
      || project?.sandbox === 'workspace-write'
      ? project.sandbox
      : 'workspace-write',
    timeoutMinutes: '',
    concurrencyPolicy: 'skip',
    enabled: true,
  };
}

function mapScheduleError(l: LocalizeCopy, error: unknown): ScheduleEditorErrors {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  if (normalized.includes('cwd') || normalized.includes('directory')) {
    return { form: l('项目目录不存在或无法访问', 'The project directory does not exist or cannot be accessed') };
  }
  if (normalized.includes('cron')) return { frequency: l('执行频率无效', 'Invalid frequency') };
  if (normalized.includes('timezone')) return { timezone: l('时区无效', 'Invalid timezone') };
  if (normalized.includes('profile')) {
    return { form: l('当前项目的运行配置不可用，请先在项目设置中修复', 'The project runtime configuration is unavailable. Update it in project settings first.') };
  }
  if (normalized.includes('timeout')) return { timeoutMinutes: l('最长运行时间无效', 'Invalid maximum runtime') };
  if (error instanceof ApiClientError) return { form: error.message };
  return { form: l('无法保存计划任务', 'Unable to save scheduled task') };
}

function upsertSchedule(
  current: ScheduleResponse[],
  schedule: ScheduleResponse
): ScheduleResponse[] {
  const index = current.findIndex(item => item.id === schedule.id);
  if (index < 0) return [schedule, ...current];
  return current.map(item => item.id === schedule.id ? schedule : item);
}

function replaceSchedule(
  current: ScheduleResponse[],
  schedule: ScheduleResponse
): ScheduleResponse[] {
  return current.map(item => item.id === schedule.id ? schedule : item);
}

function lastStatusLabel(l: LocalizeCopy, status: ScheduleResponse['lastStatus']): string {
  switch (status) {
    case 'succeeded':
      return l("上次成功", "Success last time");
    case 'failed':
      return l("上次失败", "failed last time");
    case 'canceled':
      return l("上次取消", "last canceled");
    case 'running':
      return l("正在运行", "Running");
    case 'queued':
      return l("等待运行", "waiting to run");
    case 'skipped':
      return l("上次跳过", "last skipped");
    default:
      return l("等待首次运行", "Waiting for first run");
  }
}

const scheduleFilterOptions: Array<{ value: ScheduleFilter; label: string; labelEn: string }> = [
  { value: 'all', label: '全部', labelEn: 'All' },
  { value: 'enabled', label: '已启用', labelEn: 'Enabled' },
  { value: 'paused', label: '已暂停', labelEn: 'Paused' },
];

function scheduleSuggestions(l: LocalizeCopy): Array<{
  name: string;
  prompt: string;
  frequency: ScheduleFrequency;
  scheduleLabel: string;
  description: string;
  icon: typeof Bell;
  tone: 'blue' | 'violet' | 'green';
}> { return [
  {
    name: l('每日简报', 'Daily briefing'),
    prompt: l('结合当前项目内容，总结昨天的进展、未完成事项和今天最重要的三件事。', "Using the current project, summarize yesterday's progress, unfinished work, and today's three most important tasks."),
    frequency: { repeat: 'weekdays', time: '08:00', days: [] },
    scheduleLabel: l('工作日 08:00', 'Weekdays 08:00'),
    description: l('汇总项目进展、未完成事项和当天优先级', 'Summarize project progress, unfinished work, and daily priorities'),
    icon: Bell,
    tone: 'blue',
  },
  {
    name: l('每周回顾', 'Weekly review'),
    prompt: l('整理本周完成的工作、遇到的问题、关键决定和下周计划。', "Summarize this week's completed work, problems, key decisions, and plans for next week."),
    frequency: { repeat: 'weekly', time: '16:00', days: [5] },
    scheduleLabel: l('每周五 16:00', 'Fridays 16:00'),
    description: l('每周五整理工作进展并形成清晰的状态更新', 'Review progress and prepare a clear status update every Friday'),
    icon: PencilLine,
    tone: 'violet',
  },
  {
    name: l('跟进监控', 'Follow-up monitor'),
    prompt: l('检查最近的项目和日历活动，列出需要继续跟进或可能阻塞的事项。', 'Review recent project and calendar activity, then list follow-up items and possible blockers.'),
    frequency: { repeat: 'weekdays', time: '09:00', days: [] },
    scheduleLabel: l('工作日 09:00', 'Weekdays 09:00'),
    description: l('查看最近活动并标记需要持续关注的事项', 'Review recent activity and identify items needing follow-up'),
    icon: MoreHorizontal,
    tone: 'green',
  },
]; }
