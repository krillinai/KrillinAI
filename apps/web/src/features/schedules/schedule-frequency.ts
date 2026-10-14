export type ScheduleRepeat =
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'custom'
  | 'advanced';

export type ScheduleFrequency = {
  repeat: ScheduleRepeat;
  time: string;
  days: number[];
  legacyCron?: string;
};

export const defaultScheduleFrequency: ScheduleFrequency = {
  repeat: 'daily',
  time: '09:00',
  days: [],
};

export const scheduleRepeatOptions: Array<{ value: ScheduleRepeat; label: string }> = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
];

export const scheduleWeekdays = [
  { value: 1, shortLabel: 'Mon', label: 'Monday' },
  { value: 2, shortLabel: 'Tue', label: 'Tuesday' },
  { value: 3, shortLabel: 'Wed', label: 'Wednesday' },
  { value: 4, shortLabel: 'Thu', label: 'Thursday' },
  { value: 5, shortLabel: 'Fri', label: 'Friday' },
  { value: 6, shortLabel: 'Sat', label: 'Saturday' },
  { value: 0, shortLabel: 'Sun', label: 'Sunday' },
] as const;

export function scheduleFrequencyToCron(frequency: ScheduleFrequency): string {
  if (frequency.repeat === 'advanced') {
    const legacyCron = frequency.legacyCron?.trim();
    if (legacyCron === undefined || legacyCron.length === 0) {
      throw new Error('The advanced schedule is missing its original expression');
    }
    return legacyCron;
  }

  const { hour, minute } = parseTime(frequency.time);
  if (frequency.repeat === 'hourly') return `${minute} * * * *`;
  if (frequency.repeat === 'daily') return `${minute} ${hour} * * *`;
  if (frequency.repeat === 'weekdays') return `${minute} ${hour} * * 1-5`;

  const days = normalizeDays(frequency.days);
  if (days.length === 0) throw new Error('Select at least one day');
  if (frequency.repeat === 'weekly') {
    return `${minute} ${hour} * * ${days[0]}`;
  }
  return `${minute} ${hour} * * ${days.join(',')}`;
}

export function cronToScheduleFrequency(cron: string): ScheduleFrequency {
  const normalized = cron.trim().replace(/\s+/g, ' ');
  const fields = normalized.split(' ');
  if (fields.length !== 5) return advancedFrequency(normalized);
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
  const minute = parseCronNumber(minuteField, 0, 59);
  if (minute === undefined || dayOfMonth !== '*' || month !== '*') {
    return advancedFrequency(normalized);
  }

  if (hourField === '*' && dayOfWeek === '*') {
    return {
      repeat: 'hourly',
      time: `00:${padTime(minute)}`,
      days: [],
    };
  }

  const hour = parseCronNumber(hourField, 0, 23);
  if (hour === undefined) return advancedFrequency(normalized);
  const time = `${padTime(hour)}:${padTime(minute)}`;

  if (dayOfWeek === '*') return { repeat: 'daily', time, days: [] };
  if (dayOfWeek === '1-5') return { repeat: 'weekdays', time, days: [] };

  if (dayOfWeek === undefined) return advancedFrequency(normalized);
  const days = parseCronDays(dayOfWeek);
  if (days === undefined || days.length === 0) return advancedFrequency(normalized);
  return {
    repeat: days.length === 1 ? 'weekly' : 'custom',
    time,
    days,
  };
}

export function formatScheduleFrequency(cron: string): string {
  const frequency = cronToScheduleFrequency(cron);
  switch (frequency.repeat) {
    case 'hourly':
      return `Every hour at minute ${Number(frequency.time.slice(3, 5))}`;
    case 'daily':
      return `Daily at ${frequency.time}`;
    case 'weekdays':
      return `Weekdays at ${frequency.time}`;
    case 'weekly':
    case 'custom':
      return `Every ${frequency.days.map(day => weekdayLabel(day)).join(', ')} at ${frequency.time}`;
    case 'advanced':
      return 'Custom schedule';
  }
}

export function formatScheduleNextRun(
  value: string | null | undefined,
  timezone: string
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (match === null) throw new Error('Select a valid time');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Select a valid time');
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Select a valid time');
  }
  return { hour, minute };
}

function parseCronNumber(
  value: string | undefined,
  minimum: number,
  maximum: number
): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return number >= minimum && number <= maximum ? number : undefined;
}

function parseCronDays(value: string): number[] | undefined {
  const fields = value.split(',');
  const days: number[] = [];
  for (const field of fields) {
    const day = parseCronNumber(field, 0, 7);
    if (day === undefined) return undefined;
    days.push(day === 7 ? 0 : day);
  }
  return normalizeDays(days);
}

function normalizeDays(days: readonly number[]): number[] {
  return Array.from(
    new Set(days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))
  ).sort((left, right) => {
    const leftOrder = left === 0 ? 7 : left;
    const rightOrder = right === 0 ? 7 : right;
    return leftOrder - rightOrder;
  });
}

function advancedFrequency(cron: string): ScheduleFrequency {
  return {
    repeat: 'advanced',
    time: '09:00',
    days: [],
    legacyCron: cron,
  };
}

function weekdayLabel(day: number): string {
  return scheduleWeekdays.find(option => option.value === day)?.label ?? 'Monday';
}

function padTime(value: number): string {
  return String(value).padStart(2, '0');
}
