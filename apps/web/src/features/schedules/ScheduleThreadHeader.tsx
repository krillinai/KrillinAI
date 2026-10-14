import type {
  CodexProfileResponse,
  ScheduleDetailResponse,
  ScheduleResponse,
  UpdateScheduleRequest,
} from '@opencreator/protocol';
import {
  CircleAlert,
  CircleCheck,
  CirclePause,
  Clock3,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OpenCreatorProject } from '../projects/project-model.js';
import type { ScheduleSidebarTaskStatus } from '../shell/sidebar-task-model.js';
import { IssueList } from '../issues/IssuePresenter.js';
import { usePageIssueState } from '../issues/page-issue-state.js';
import {
  createScheduleUpdate,
  ScheduleEditor,
  scheduleResponseToEditorValues,
  type ScheduleEditorErrors,
  type ScheduleEditorValues,
  validateScheduleEditorValues,
} from './ScheduleEditor.js';
import './schedules-view.css';

type ScheduleThreadService = {
  getSchedule(id: string): Promise<ScheduleDetailResponse>;
  updateSchedule(id: string, input: UpdateScheduleRequest): Promise<ScheduleResponse>;
};

type Operation = 'run' | 'toggle' | 'load_editor' | 'save_editor';

export function ScheduleThreadHeader(props: {
  schedule: ScheduleResponse;
  status: ScheduleSidebarTaskStatus;
  nextRunLabel?: string;
  service: ScheduleThreadService;
  projects: OpenCreatorProject[];
  profiles?: CodexProfileResponse[];
  onRunNow(schedule: ScheduleResponse): Promise<void> | void;
  onScheduleChanged(schedule: ScheduleResponse): void;
}) {
  const [operation, setOperation] = useState<Operation>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorValues, setEditorValues] = useState<ScheduleEditorValues>();
  const [editorErrors, setEditorErrors] = useState<ScheduleEditorErrors>({});
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editorDialogRef = useRef<HTMLElement>(null);
  const pageIssues = usePageIssueState('schedule-thread');
  const visual = statusVisual(props.status);
  const StatusIcon = visual.icon;
  const actionsBusy = operation !== undefined;

  useEffect(() => {
    setEditorOpen(false);
    setEditorValues(undefined);
    setEditorErrors({});
    setOperation(undefined);
  }, [props.schedule.id]);

  useEffect(() => {
    if (!editorOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && operation !== 'save_editor') closeEditor();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [editorOpen, operation]);

  useEffect(() => {
    if (!editorOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const selector = editorValues === undefined
        ? 'button'
        : 'input, textarea, select, button';
      editorDialogRef.current?.querySelector<HTMLElement>(selector)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editorOpen, editorValues]);

  async function runNow() {
    if (actionsBusy) return;
    setOperation('run');
    try {
      await props.onRunNow(props.schedule);
      pageIssues.resolveOperation('schedule-thread.run-now');
    } catch (error) {
      pageIssues.captureOperationFailure('schedule-thread.run-now', error, 'Could not run the task now. Try again.', { retryable: true });
    } finally {
      setOperation(undefined);
    }
  }

  async function toggleEnabled() {
    if (actionsBusy) return;
    setOperation('toggle');
    try {
      const updated = await props.service.updateSchedule(props.schedule.id, {
        enabled: !props.schedule.enabled,
      });
      props.onScheduleChanged(updated);
      pageIssues.resolveOperation('schedule-thread.toggle');
    } catch (error) {
      pageIssues.captureOperationFailure('schedule-thread.toggle', error, 'Could not update task status. Try again.', { retryable: true });
    } finally {
      setOperation(undefined);
    }
  }

  async function openEditor() {
    if (actionsBusy) return;
    setEditorOpen(true);
    setEditorValues(undefined);
    setEditorErrors({});
    setOperation('load_editor');
    try {
      const schedule = await props.service.getSchedule(props.schedule.id);
      setEditorValues(scheduleResponseToEditorValues(schedule));
      pageIssues.resolveOperation('schedule-thread.load-editor');
    } catch (error) {
      pageIssues.captureOperationFailure('schedule-thread.load-editor', error, 'Could not load schedule details. Try again.', { retryable: true });
    } finally {
      setOperation(undefined);
    }
  }

  async function saveEditor(values: ScheduleEditorValues) {
    if (operation === 'save_editor') return;
    const validationErrors = validateScheduleEditorValues(values);
    if (Object.keys(validationErrors).length > 0) {
      setEditorErrors(validationErrors);
      return;
    }
    setOperation('save_editor');
    setEditorErrors({});
    try {
      const updated = await props.service.updateSchedule(
        props.schedule.id,
        createScheduleUpdate(values)
      );
      props.onScheduleChanged(updated);
      pageIssues.resolveOperation('schedule-thread.save-editor');
      closeEditor();
    } catch (error) {
      pageIssues.captureOperationFailure('schedule-thread.save-editor', error, 'Could not save the scheduled task. Try again.', { retryable: true });
    } finally {
      setOperation(undefined);
    }
  }

  function closeEditor() {
    if (operation === 'save_editor') return;
    setEditorOpen(false);
    setEditorValues(undefined);
    setEditorErrors({});
    window.requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  return (
    <>
      <section className="schedule-thread-header" aria-label="Task management">
        <div className="schedule-thread-main">
          <span
            className="schedule-thread-status"
            data-status={props.status}
            role="status"
            aria-label="Task status"
          >
            <StatusIcon
              className={props.status === 'running' ? 'schedule-thread-spinner' : undefined}
              size={15}
              aria-hidden="true"
            />
            <strong>{visual.label}</strong>
          </span>
          {props.status === 'idle' && props.nextRunLabel ? (
            <span className="schedule-thread-next">{props.nextRunLabel}</span>
          ) : null}
          {operationLabel(operation) ? (
            <span className="schedule-thread-operation" role="status" aria-label="Task operation status">
              <LoaderCircle className="schedule-thread-spinner" size={14} aria-hidden="true" />
              {operationLabel(operation)}
            </span>
          ) : null}
        </div>
        <div className="schedule-thread-actions">
          <button
            type="button"
            aria-label="Run task now"
            title="Run now"
            disabled={actionsBusy}
            onClick={() => void runNow()}
          >
            {operation === 'run' ? (
              <LoaderCircle className="schedule-thread-spinner" size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={props.schedule.enabled ? 'Pause task' : 'Resume task'}
            title={props.schedule.enabled ? 'Pause' : 'Restore'}
            disabled={actionsBusy}
            onClick={() => void toggleEnabled()}
          >
            {operation === 'toggle' ? (
              <LoaderCircle className="schedule-thread-spinner" size={15} aria-hidden="true" />
            ) : props.schedule.enabled ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            ref={editButtonRef}
            type="button"
            aria-label="Edit task"
            title="Edit"
            disabled={actionsBusy}
            onClick={() => void openEditor()}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
        </div>
        <IssueList
          issues={pageIssues.issues}
          actions={{ retryOperations: {
            'schedule-thread.run-now': runNow,
            'schedule-thread.toggle': toggleEnabled,
            'schedule-thread.load-editor': openEditor,
            'schedule-thread.save-editor': () => editorValues === undefined ? undefined : saveEditor(editorValues)
          } }}
          onDismiss={pageIssues.dismissIssue}
          compact
        />
      </section>

      {editorOpen ? createPortal((
        <div
          className="schedule-thread-editor-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <section
            ref={editorDialogRef}
            className="schedule-thread-editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit task ${props.schedule.name}`}
          >
            {editorValues === undefined ? (
              <div className="schedule-thread-editor-loading">
                <header>
                  <strong>Edit scheduled task</strong>
                  <button
                    type="button"
                    aria-label="Cancel editing"
                    title="Close"
                    onClick={closeEditor}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </header>
                {editorErrors.form ? (
                  <p role="alert">{editorErrors.form}</p>
                ) : (
                  <span role="status">
                    <LoaderCircle className="schedule-thread-spinner" size={17} aria-hidden="true" />
                    Loading schedule details
                  </span>
                )}
              </div>
            ) : (
              <ScheduleEditor
                mode="edit"
                initialValues={editorValues}
                projects={props.projects}
                saving={operation === 'save_editor'}
                errors={editorErrors}
                onCancel={closeEditor}
                onSubmit={values => void saveEditor(values)}
              />
            )}
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}

function statusVisual(status: ScheduleSidebarTaskStatus) {
  switch (status) {
    case 'idle':
      return { label: 'Enabled', icon: CircleCheck };
    case 'running':
      return { label: 'Running', icon: LoaderCircle };
    case 'queued':
      return { label: 'Queued', icon: Clock3 };
    case 'waiting_approval':
      return { label: 'Awaiting approval', icon: ShieldAlert };
    case 'failed':
      return { label: 'Last run failed', icon: CircleAlert };
    case 'paused':
      return { label: 'Paused', icon: CirclePause };
    case 'repair_required':
      return { label: 'Needs attention', icon: Wrench };
  }
}

function operationLabel(operation: Operation | undefined): string | undefined {
  switch (operation) {
    case 'run':
      return 'Starting';
    case 'toggle':
      return 'Updating';
    case 'load_editor':
    case 'save_editor':
    case undefined:
      return undefined;
  }
}
