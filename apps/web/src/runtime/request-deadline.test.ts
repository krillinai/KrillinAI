import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequestDeadline } from './request-deadline.js';

afterEach(() => vi.useRealTimers());

describe('read-only Runtime request deadlines', () => {
  it('aborts with a timeout reason and releases timers after the request finishes', () => {
    vi.useFakeTimers();
    const deadline = createRequestDeadline(100);
    vi.advanceTimersByTime(100);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.signal.reason.name).toBe('TimeoutError');
    deadline.dispose();
    const completed = createRequestDeadline(100);
    completed.dispose();
    vi.advanceTimersByTime(100);
    expect(completed.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates cancellation, including an already canceled parent', () => {
    const parent = new AbortController();
    const deadline = createRequestDeadline(1_000, parent.signal);
    parent.abort();
    expect(deadline.signal.aborted).toBe(true);
    deadline.dispose();
    const canceled = createRequestDeadline(1_000, parent.signal);
    expect(canceled.signal.aborted).toBe(true);
    canceled.dispose();
  });
});
