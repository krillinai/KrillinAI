import type {
  CreateScheduleRequest,
  ScheduleDetailResponse,
  ScheduleResponse,
  UpdateScheduleRequest,
} from '@opencreator/protocol';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../runtime/errors.js';
import {
  SchedulesView,
  type ScheduleViewService,
} from './SchedulesView.js';

describe('SchedulesView', () => {
  it('opens the manual editor directly without a OpenCreator creation menu', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole('button', { name: /Create/ }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('使用 OpenCreator 创建')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Create scheduled task' })).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Frequency' })).toBeInTheDocument();
    expect(screen.getByLabelText('Task instructions')).toHaveAttribute(
      'placeholder',
      'Describe what you need done...'
    );
    expect(screen.queryByRole('heading', { name: 'details' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Scheduled task title')).toHaveAttribute('placeholder', 'Enter task title');
    expect(screen.getByRole('heading', { name: 'Select access permissions' })).toBeInTheDocument();
    expect(screen.getByText('Select access permissions').closest('details')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Create scheduled task' })).not.toBeInTheDocument();
  });

  it('renders a simple searchable list with friendly schedules and status filters', async () => {
    const user = userEvent.setup();
    renderView({
      service: createService({
        listSchedules: vi.fn(async () => ({
          schedules: [
            schedule(),
            schedule({
              id: 'paused',
              name: '每周回顾',
              cron: '0 16 * * 5',
              enabled: false,
              promptPreviewRedacted: '整理本周工作',
            }),
          ],
        })),
      }),
    });

    expect(await screen.findByRole('heading', { name: 'Scheduled tasks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '每日总结' })).toBeInTheDocument();
    expect(screen.getByText('Daily at 18:00')).toBeInTheDocument();
    expect(screen.queryByText('0 18 * * *')).not.toBeInTheDocument();
    expect(screen.getByText('Suggestions')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search scheduled tasks' }), '每周');
    expect(screen.getByRole('heading', { name: '每周回顾' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '每日总结' })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search scheduled tasks' }));
    await user.click(screen.getByRole('button', { name: 'Paused' }));
    expect(screen.getByRole('heading', { name: '每周回顾' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '每日总结' })).not.toBeInTheDocument();
  });

  it('creates a schedule manually with friendly frequency controls', async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    const onScheduleChanged = vi.fn();
    const createSchedule = vi.fn(async (input: CreateScheduleRequest) => schedule({
      id: 'schedule-created',
      threadId: 'thread-created',
      name: input.name,
      cron: input.cron,
      timezone: input.timezone ?? 'Asia/Shanghai',
      enabled: input.enabled ?? true,
      promptPreviewRedacted: input.prompt,
      profile: input.profile ?? 'default',
      cwd: input.cwd ?? '/workspace/current',
      canonicalCwd: input.cwd ?? '/workspace/current',
      model: input.model ?? null,
      reasoning: input.reasoning ?? null,
      sandbox: input.sandbox ?? 'workspace-write',
      timeoutMs: input.timeoutMs ?? null,
      concurrencyPolicy: input.concurrencyPolicy ?? 'skip',
      misfirePolicy: input.misfirePolicy ?? 'skip',
    }));
    renderView({
      onOpenTask,
      onScheduleChanged,
      service: createService({
        listSchedules: vi.fn(async () => ({ schedules: [] })),
        createSchedule,
      }),
    });

    await openCreateEditor(user);
    expect(screen.queryByLabelText('Cron 表达式')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('运行配置')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('推理')).not.toBeInTheDocument();
    expect(screen.queryByText('运行于')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('时区')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('最长运行分钟')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('任务重叠时')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Scheduled task title'), '每日简报');
    await user.type(screen.getByLabelText('Task instructions'), '总结今天的项目进展');
    await user.selectOptions(screen.getByLabelText('Repeat'), 'weekdays');
    await user.click(screen.getByRole('button', { name: 'Run time' }));
    expect(screen.getByRole('dialog', { name: 'Select run time' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'hours 08' }));
    await user.click(screen.getByRole('option', { name: 'minutes 00' }));
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(createSchedule).toHaveBeenCalledWith({
      name: '每日简报',
      cron: '0 8 * * 1-5',
      timezone: 'Asia/Shanghai',
      enabled: true,
      prompt: '总结今天的项目进展',
      profile: 'default',
      cwd: '/workspace/current',
      sandbox: 'workspace-write',
      concurrencyPolicy: 'skip',
      misfirePolicy: 'skip',
    });
    expect(await screen.findByRole('heading', { name: '每日简报' })).toBeInTheDocument();
    expect(onScheduleChanged).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-created',
      threadId: 'thread-created'
    }));
    expect(onOpenTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Create scheduled task' })).not.toBeInTheDocument();
  });

  it('prefills suggested tasks without creating them immediately', async () => {
    const user = userEvent.setup();
    const createSchedule = vi.fn(async () => schedule());
    renderView({
      service: createService({
        listSchedules: vi.fn(async () => ({ schedules: [] })),
        createSchedule,
      }),
    });

    await user.click(await screen.findByRole('button', { name: /Daily briefing/ }));
    expect(screen.getByLabelText('Scheduled task title')).toHaveValue('Daily briefing');
    expect(screen.getByLabelText('Repeat')).toHaveValue('weekdays');
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('validates the simple fields and maps daemon errors to project selection', async () => {
    const user = userEvent.setup();
    const createSchedule = vi.fn(async () => {
      throw new ApiClientError({
        status: 422,
        code: 'SCHEDULE_INVALID',
        message: 'cwd must exist: path not found',
      });
    });
    renderView({
      service: createService({
        listSchedules: vi.fn(async () => ({ schedules: [] })),
        createSchedule,
      }),
    });

    await openCreateEditor(user);
    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByText('Enter a task title')).toBeInTheDocument();
    expect(screen.getByText('Describe what you need done')).toBeInTheDocument();
    expect(screen.getByLabelText('Scheduled task title')).toHaveFocus();
    expect(createSchedule).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Scheduled task title'), '目录检查');
    await user.type(screen.getByLabelText('Task instructions'), '检查项目状态');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The project directory is missing or inaccessible');
    expect(within(screen.getByRole('dialog')).queryByText('The project directory is missing or inaccessible')).not.toBeInTheDocument();
  });

  it('loads full details, preserves legacy schedules, and saves advanced edits', async () => {
    const user = userEvent.setup();
    const onScheduleChanged = vi.fn();
    const updateSchedule = vi.fn(async (_id: string, input: UpdateScheduleRequest) => (
      schedule({ name: input.name ?? '每日总结', enabled: input.enabled ?? true })
    ));
    renderView({
      onScheduleChanged,
      service: createService({
        listSchedules: vi.fn(async () => ({
          schedules: [schedule({ cron: '0 9 1 * *' })],
        })),
        getSchedule: vi.fn(async () => scheduleDetail({
          cron: '0 9 1 * *',
          profile: 'review',
          model: 'gpt-5.6',
          reasoning: 'high',
          timeoutMs: 120_000,
          concurrencyPolicy: 'queue',
        })),
        updateSchedule,
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit 每日总结' }));
    expect(await screen.findByText('Edit scheduled task')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('完整的每日总结执行指令')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat')).toHaveValue('advanced');
    expect(screen.getByText(/legacy advanced schedule/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Scheduled task title'));
    await user.type(screen.getByLabelText('Scheduled task title'), '每月总结');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(updateSchedule).toHaveBeenCalledWith('schedule-1', expect.objectContaining({
      name: '每月总结',
      prompt: '完整的每日总结执行指令',
      cron: '0 9 1 * *',
      concurrencyPolicy: 'queue',
      profile: 'review',
      model: 'gpt-5.6',
      reasoning: 'high',
      timeoutMs: 120_000,
    }));
    expect(onScheduleChanged).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-1',
      name: '每月总结'
    }));
  });

  it('opens the targeted schedule editor from an external task action', async () => {
    const getSchedule = vi.fn(async () => scheduleDetail());
    renderView({
      editScheduleId: 'schedule-1',
      service: createService({
        listSchedules: vi.fn(async () => ({ schedules: [schedule()] })),
        getSchedule
      })
    });

    expect(await screen.findByDisplayValue('完整的每日总结执行指令')).toBeInTheDocument();
    expect(getSchedule).toHaveBeenCalledWith('schedule-1');
  });

  it('opens task titles and previous runs in the bound task thread', async () => {
    const user = userEvent.setup();
    const onOpenTask = vi.fn();
    renderView({
      onOpenTask,
      service: createService({
        listSchedules: vi.fn(async () => ({ schedules: [schedule()] })),
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Open task conversation 每日总结' }));
    expect(onOpenTask).toHaveBeenLastCalledWith('thread-schedule-1');

    await user.click(screen.getByRole('button', { name: 'View last run' }));
    expect(onOpenTask).toHaveBeenLastCalledWith('thread-schedule-1', 'run-previous');
  });

  it('toggles, starts a run in the task thread, and deletes a schedule', async () => {
    const user = userEvent.setup();
    const updateSchedule = vi.fn(async (_id: string, input: UpdateScheduleRequest) => (
      schedule({ enabled: input.enabled ?? true })
    ));
    const onRunNow = vi.fn(async (_schedule: ScheduleResponse): Promise<void> => undefined);
    const onScheduleChanged = vi.fn();
    const onScheduleDeleted = vi.fn();
    const deleteSchedule = vi.fn(async () => ({ deleted: true as const }));
    renderView({
      onRunNow,
      onScheduleChanged,
      onScheduleDeleted,
      confirmDelete: () => true,
      service: createService({
        listSchedules: vi.fn(async () => ({ schedules: [schedule()] })),
        updateSchedule,
        deleteSchedule,
      }),
    });

    const toggle = await screen.findByRole('switch', { name: 'Pause 每日总结' });
    await user.click(toggle);
    expect(updateSchedule).toHaveBeenCalledWith('schedule-1', { enabled: false });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(onScheduleChanged).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-1',
      enabled: false
    }));

    await user.click(screen.getByRole('button', { name: 'Run now 每日总结' }));
    expect(onRunNow).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-1',
      threadId: 'thread-schedule-1'
    }));

    await user.click(screen.getByRole('button', { name: 'Delete 每日总结' }));
    expect(deleteSchedule).toHaveBeenCalledWith('schedule-1');
    expect(onScheduleDeleted).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-1',
      threadId: 'thread-schedule-1'
    }));
    expect(screen.queryByRole('heading', { name: '每日总结' })).not.toBeInTheDocument();
  });

  it('shows disconnected and load error states', async () => {
    const { rerender } = renderView({ connected: false, service: null });
    expect(screen.getByText('Connect the local Runtime to create and manage tasks')).toBeInTheDocument();

    rerender(createView({
      service: createService({
        listSchedules: vi.fn(async () => {
          throw new Error('failed');
        }),
      }),
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load scheduled tasks');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });
});

async function openCreateEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Create/ }));
}

function renderView(overrides: Partial<Parameters<typeof createView>[0]> = {}) {
  return render(createView(overrides));
}

function createView(overrides: {
  connected?: boolean;
  service?: ScheduleViewService | null;
  editScheduleId?: string;
  onOpenTask?(threadId: string, runId?: string): void;
  onRunNow?(schedule: ScheduleResponse): Promise<void> | void;
  onScheduleChanged?(schedule: ScheduleResponse): void;
  onScheduleDeleted?(schedule: ScheduleResponse): void;
  confirmDelete?(schedule: ScheduleResponse): boolean;
} = {}) {
  return (
    <SchedulesView
      connected={overrides.connected ?? true}
      service={overrides.service ?? createService()}
      projects={[
        {
          id: 'current',
          name: '当前项目',
          cwd: '/workspace/current',
          sandbox: 'workspace-write',
          profile: 'default',
          model: null,
          reasoning: null,
        },
      ]}
      currentProjectId="current"
      editScheduleId={overrides.editScheduleId}
      profiles={[
        {
          name: 'review',
          status: 'valid',
          config: {},
          diagnostics: [],
          source: 'review.config.toml',
          codexHomeMode: 'isolated',
        },
      ]}
      defaultTimezone="Asia/Shanghai"
      pollIntervalMs={0}
      onOpenTask={overrides.onOpenTask ?? vi.fn()}
      onRunNow={overrides.onRunNow ?? vi.fn()}
      onScheduleChanged={overrides.onScheduleChanged ?? vi.fn()}
      onScheduleDeleted={overrides.onScheduleDeleted ?? vi.fn()}
      confirmDelete={overrides.confirmDelete}
    />
  );
}

function createService(
  overrides: Partial<ScheduleViewService> = {}
): ScheduleViewService {
  return {
    listSchedules: async () => ({ schedules: [] }),
    getSchedule: async () => scheduleDetail(),
    createSchedule: async () => schedule(),
    updateSchedule: async () => schedule(),
    deleteSchedule: async () => ({ deleted: true }),
    listOperations: async () => ({ operations: [] }),
    ...overrides,
  };
}

function schedule(overrides: Partial<ScheduleResponse> = {}): ScheduleResponse {
  return {
    id: 'schedule-1',
    threadId: 'thread-schedule-1',
    name: '每日总结',
    cron: '0 18 * * *',
    timezone: 'Asia/Shanghai',
    enabled: true,
    promptPreviewRedacted: '总结今天的项目进展',
    profile: 'default',
    cwd: '/workspace/current',
    canonicalCwd: '/workspace/current',
    model: null,
    reasoning: null,
    sandbox: 'workspace-write',
    timeoutMs: null,
    concurrencyPolicy: 'skip',
    misfirePolicy: 'skip',
    nextRunAt: '2026-07-13T10:00:00.000Z',
    lastRunAt: '2026-07-12T10:00:00.000Z',
    lastRunId: 'run-previous',
    lastStatus: 'succeeded',
    pendingTrigger: false,
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    ...overrides,
  };
}

function scheduleDetail(
  overrides: Partial<ScheduleDetailResponse> = {}
): ScheduleDetailResponse {
  return {
    ...schedule(overrides),
    prompt: '完整的每日总结执行指令',
    ...overrides,
  };
}
