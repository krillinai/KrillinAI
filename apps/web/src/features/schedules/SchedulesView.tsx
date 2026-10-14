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
      setLoadError('Could not load scheduled tasks');
      pageIssues.captureOperationFailure('schedules.load', cause, 'Could not load scheduled tasks. Try again.', { retryable: true });
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
        formatScheduleFrequency(schedule.cron),
      ].some(value => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, schedules]);

  if (!props.connected || props.service === null) {
    return (
      <section className="schedules-view">
        <div className="schedules-state">
          <CalendarClock size={28} aria-hidden="true" />
          <h2>Scheduled tasks are unavailable</h2>
          <p>Connect the local Runtime to create and manage tasks</p>
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
      pageIssues.captureOperationFailure('schedules.load-detail', error, 'Could not load schedule details. Try again.');
      setEditor(current => (
        current?.mode === 'edit' && current.scheduleId === schedule.id
          ? { ...current, loading: false }
          : current
      ));
    }
  }

  async function saveEditor(values: ScheduleEditorValues) {
    if (props.service === null || editor === undefined) return;
    const validationErrors = validateScheduleEditorValues(values);
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
      const mapped = mapScheduleError(error);
      setEditorErrors({ ...mapped, form: undefined });
      pageIssues.captureOperationFailure('schedules.save', error, mapped.form ?? 'Could not save the scheduled task. Check the settings and try again.');
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
      pageIssues.captureOperationFailure('schedules.toggle', error, 'Could not update task status. Try again.');
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
      pageIssues.captureOperationFailure('schedules.run-now', error, 'Could not run the task now. Try again.');
    } finally {
      setBusy(schedule.id, false);
    }
  }

  async function deleteSchedule(schedule: ScheduleResponse) {
    if (props.service === null || busyIds.has(schedule.id)) return;
    const confirmed = props.confirmDelete?.(schedule)
      ?? await confirm({
        title: 'Delete task',
        description: `Delete "${schedule.name}"? This cannot be undone.`,
        confirmLabel: 'Delete task',
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
      pageIssues.captureOperationFailure('schedules.delete', error, 'Could not delete the task. Try again.');
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
                <h1>Scheduled tasks</h1>
                <p>Schedule tasks, set reminders, or run recurring work</p>
              </div>
              <button
                className="schedule-button schedule-button--secondary"
                type="button"
                onClick={() => openCreateEditor('manual')}
              >
                <Plus size={16} />
                Create
              </button>
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
                aria-label="Search scheduled tasks"
                type="search"
                value={query}
                placeholder="Search scheduled tasks"
                onChange={event => setQuery(event.target.value)}
              />
            </label>

            <div className="schedules-filters" role="group" aria-label="Task status">
              {scheduleFilterOptions.map(option => (
                <button
                  aria-pressed={filter === option.value}
                  className={filter === option.value ? 'is-active' : ''}
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="schedules-state" role="status">
                <LoaderCircle size={24} className="schedule-spin" />
                Loading scheduled tasks
              </div>
            ) : loadError ? (
              <div className="schedules-state" role="status">
                <p>No tasks to display.</p>
                <button
                  className="schedule-button schedule-button--secondary"
                  type="button"
                  onClick={() => void loadSchedules(true)}
                >
                  <RefreshCw size={16} />
                  Reload
                </button>
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="schedules-empty">
                <CalendarClock size={24} aria-hidden="true" />
                <strong>
                  {schedules.length === 0 ? 'No scheduled tasks yet' : 'No matching tasks'}
                </strong>
                <span>
                  {schedules.length === 0
                    ? 'Start from a suggestion or create a task'
                    : 'Try another keyword or status filter'}
                </span>
              </div>
            ) : (
              <ul className="schedules-list">
                {filteredSchedules.map(schedule => {
                  const busy = busyIds.has(schedule.id);
                  const nextRun = formatScheduleNextRun(
                    schedule.nextRunAt,
                    schedule.timezone
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
                              aria-label={`Open task conversation ${schedule.name}`}
                              onClick={() => props.onOpenTask(schedule.threadId)}
                            >
                              {schedule.name}
                            </button>
                          </h2>
                          {schedule.lastStatus === 'running'
                            || schedule.lastStatus === 'queued' ? (
                              <span className="schedule-running-label">
                                <LoaderCircle size={13} className="schedule-spin" />
                                {lastStatusLabel(schedule.lastStatus)}
                              </span>
                            ) : null}
                        </div>
                        <p>{schedule.promptPreviewRedacted}</p>
                        <div className="schedule-row__meta">
                          <span>{formatScheduleFrequency(schedule.cron)}</span>
                          {nextRun ? <span>Next {nextRun}</span> : null}
                          {!schedule.enabled ? <span>Paused</span> : null}
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
                            View last run
                          </button>
                        ) : null}
                      </div>
                      <div className="schedule-row__actions">
                        <button
                          className="schedule-switch"
                          type="button"
                          role="switch"
                          aria-checked={schedule.enabled}
                          aria-label={`${schedule.enabled ? 'Pause' : 'Enable'} ${schedule.name}`}
                          disabled={busy}
                          onClick={() => void toggleSchedule(schedule)}
                        />
                        <button
                          className="schedule-icon-button"
                          type="button"
                          aria-label={`Run now ${schedule.name}`}
                          title="Run now"
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
                          aria-label={`Edit ${schedule.name}`}
                          title="Edit"
                          disabled={busy}
                          onClick={() => void openEditEditor(schedule)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="schedule-icon-button"
                          type="button"
                          aria-label={`Delete ${schedule.name}`}
                          title="Remove"
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
                <h2 id="schedule-suggestions-heading">Suggestions</h2>
                <div className="schedule-suggestion-list">
                  {scheduleSuggestions.map(suggestion => {
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
                aria-label={editor.mode === 'create' ? 'Create scheduled task' : 'Edit scheduled task'}
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

function mapScheduleError(error: unknown): ScheduleEditorErrors {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  if (normalized.includes('cwd') || normalized.includes('directory')) {
    return { form: 'The project directory is missing or inaccessible' };
  }
  if (normalized.includes('cron')) return { frequency: 'Invalid frequency' };
  if (normalized.includes('timezone')) return { timezone: 'Invalid time zone' };
  if (normalized.includes('profile')) {
    return { form: 'This project\'s Runtime configuration is unavailable. Fix it in project settings first.' };
  }
  if (normalized.includes('timeout')) return { timeoutMinutes: 'Invalid maximum run time' };
  if (error instanceof ApiClientError) return { form: error.message };
  return { form: 'Could not save the scheduled task' };
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

function lastStatusLabel(status: ScheduleResponse['lastStatus']): string {
  switch (status) {
    case 'succeeded':
      return 'Last run succeeded';
    case 'failed':
      return 'Last run failed';
    case 'canceled':
      return 'Last run canceled';
    case 'running':
      return 'Running';
    case 'queued':
      return 'Waiting to run';
    case 'skipped':
      return 'Last run skipped';
    default:
      return 'Waiting for first run';
  }
}

const scheduleFilterOptions: Array<{ value: ScheduleFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'paused', label: 'Paused' },
];

const scheduleSuggestions: Array<{
  name: string;
  prompt: string;
  frequency: ScheduleFrequency;
  scheduleLabel: string;
  description: string;
  icon: typeof Bell;
  tone: 'blue' | 'violet' | 'green';
}> = [
  {
    name: 'Daily briefing',
    prompt: '结合当前项目内容，总结昨天的进展、未完成事项和今天最重要的三件事。',
    frequency: { repeat: 'weekdays', time: '08:00', days: [] },
    scheduleLabel: 'Weekdays at 08:00',
    description: 'Summarize project progress, open items, and today\'s priorities',
    icon: Bell,
    tone: 'blue',
  },
  {
    name: 'Weekly review',
    prompt: '整理本周完成的工作、遇到的问题、关键决定和下周计划。',
    frequency: { repeat: 'weekly', time: '16:00', days: [5] },
    scheduleLabel: 'Fridays at 16:00',
    description: 'Review weekly progress and prepare a status update every Friday',
    icon: PencilLine,
    tone: 'violet',
  },
  {
    name: 'Follow-up monitor',
    prompt: '检查最近的项目和日历活动，列出需要继续跟进或可能阻塞的事项。',
    frequency: { repeat: 'weekdays', time: '09:00', days: [] },
    scheduleLabel: 'Weekdays at 09:00',
    description: 'Review recent activity and flag items needing follow-up',
    icon: MoreHorizontal,
    tone: 'green',
  },
];
