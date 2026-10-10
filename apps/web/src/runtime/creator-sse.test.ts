import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCreatorSnapshotSubscription } from './creator-sse.js';
import { ApiClientError } from './client.js';

describe('creator snapshot subscription', () => {
  it('reconciles an active task even when its terminal event is lost, then stops loading', async () => {
    vi.useFakeTimers();
    let active = true;
    const loadSnapshot = vi.fn().mockResolvedValueOnce({ status: 'running' }).mockResolvedValue({ status: 'failed' });
    const close = vi.fn();
    const subscribe = vi.fn(() => ({ close }));
    const subscription = createCreatorSnapshotSubscription<{ status: string }>({
      loadSnapshot, subscribe,
      onSnapshot(snapshot) { active = snapshot.status === 'running'; },
      shouldReconcileSnapshot: () => active
    });
    try {
      await subscription.start();
      await vi.advanceTimersByTimeAsync(5_000);
      await subscription.whenIdle();
      expect(loadSnapshot).toHaveBeenCalledTimes(2);
      expect(active).toBe(false);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(2);
      expect(subscribe).toHaveBeenCalledTimes(1);
      subscription.close();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(2);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      subscription.close();
      vi.useRealTimers();
    }
  });

  it('does not overlap periodic snapshot requests or poll a terminal HTTP failure', async () => {
    vi.useFakeTimers();
    const pending = deferred<{ status: string }>();
    const loadSnapshot = vi.fn().mockResolvedValueOnce({ status: 'running' }).mockImplementationOnce(() => pending.promise)
      .mockRejectedValue(new ApiClientError({ status: 403, code: 'FORBIDDEN', message: 'Denied' }));
    const onState = vi.fn();
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot, subscribe: () => ({ close: vi.fn() }), onSnapshot: vi.fn(), onState,
      shouldReconcileSnapshot: () => true
    });
    try {
      await subscription.start();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(2);
      pending.resolve({ status: 'running' });
      await subscription.whenIdle();
      await vi.advanceTimersByTimeAsync(5_000);
      await subscription.whenIdle();
      expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(loadSnapshot).toHaveBeenCalledTimes(3);
    } finally {
      subscription.close();
      vi.useRealTimers();
    }
  });

  it('recovers automatically after the first snapshot fails', async () => {
    vi.useFakeTimers();
    const loadSnapshot = vi.fn().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue({ revision: 2 });
    const subscribe = vi.fn(() => ({ close: vi.fn() }));
    const onState = vi.fn();
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot, subscribe, onSnapshot: vi.fn(), onState, reconnectDelays: [10]
    });
    await subscription.start();
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'reconnecting', attempt: 1 }));
    await vi.advanceTimersByTimeAsync(10);
    await subscription.whenIdle();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'connected' }));
    subscription.close();
  });

  it.each([401, 403, 404])('does not retry terminal HTTP %s until explicitly requested', async status => {
    vi.useFakeTimers();
    const loadSnapshot = vi.fn().mockRejectedValueOnce(new ApiClientError({ status, code: 'FAILED', message: 'unavailable' }))
      .mockResolvedValue({ revision: 2 });
    const onState = vi.fn();
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot, subscribe: () => ({ close: vi.fn() }), onSnapshot: vi.fn(), onState
    });
    await subscription.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }));
    await subscription.retry();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    subscription.close();
  });

  it('aborts an initial snapshot and cancels recovery when closed', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const loadSnapshot = vi.fn((options: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(signal?.reason));
    }));
    const subscription = createCreatorSnapshotSubscription({ loadSnapshot, subscribe: vi.fn(), onSnapshot: vi.fn() });
    const started = subscription.start();
    subscription.close();
    await started;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal?.aborted).toBe(true);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads the latest snapshot before every reconnect subscription', async () => {
    vi.useFakeTimers();
    const snapshots = [{ revision: 1 }, { revision: 3 }];
    const loadSnapshot = vi.fn(async () => snapshots.shift()!);
    const subscribe = vi.fn((_onEvent: () => void, onDisconnect: () => void) => ({
      close: vi.fn(),
      disconnect: onDisconnect
    }));
    const received: number[] = [];
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot,
      subscribe,
      onSnapshot(snapshot) {
        received.push(snapshot.revision);
      }
    });

    await subscription.start();
    subscribe.mock.results[0]!.value.disconnect();
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(250);
    await subscription.whenIdle();

    expect(received).toEqual([1, 3]);
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('reloads a snapshot for an event without replacing the live connection', async () => {
    const snapshots = [{ revision: 1 }, { revision: 2 }];
    const loadSnapshot = vi.fn(async () => snapshots.shift()!);
    let emit!: (event: unknown) => void;
    const subscribe = vi.fn((onEvent: (event: unknown) => void) => {
      emit = onEvent;
      return { close: vi.fn() };
    });
    const received: number[] = [];
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot,
      subscribe,
      onSnapshot(snapshot) {
        received.push(snapshot.revision);
      }
    });

    await subscription.start();
    emit({ id: 'activity:1' });
    await subscription.whenIdle();

    expect(received).toEqual([1, 2]);
    expect(subscribe).toHaveBeenCalledTimes(1);
    subscription.close();
  });

  it('coalesces dense events while a snapshot reload is in flight', async () => {
    const pending = deferred<{ revision: number }>();
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce({ revision: 1 })
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue({ revision: 3 });
    let emit!: (event: unknown) => void;
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot,
      subscribe(onEvent) {
        emit = onEvent;
        return { close: vi.fn() };
      },
      onSnapshot: vi.fn()
    });

    await subscription.start();
    emit({ id: 'agent:1' });
    await waitForMicrotasks(() => loadSnapshot.mock.calls.length === 2);
    emit({ id: 'agent:2' });
    emit({ id: 'agent:3' });
    emit({ id: 'agent:4' });
    pending.resolve({ revision: 2 });
    await subscription.whenIdle();

    expect(loadSnapshot).toHaveBeenCalledTimes(3);
    subscription.close();
  });

  it('can consume an event without reloading the snapshot', async () => {
    const loadSnapshot = vi.fn(async () => ({ revision: 1 }));
    let emit!: (event: { kind: string }) => void;
    const onEvent = vi.fn();
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot,
      subscribe(receive) {
        emit = receive;
        return { close: vi.fn() };
      },
      onSnapshot: vi.fn(),
      onEvent,
      shouldReloadSnapshot: event => event.kind === 'snapshot_changed'
    });

    await subscription.start();
    emit({ kind: 'agent_item_changed' });
    await subscription.whenIdle();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    subscription.close();
  });

  it('backs off repeated disconnects and caps the reconnect delay', async () => {
    vi.useFakeTimers();
    const subscribe = vi.fn((_onEvent: () => void, onDisconnect: () => void) => {
      queueMicrotask(onDisconnect);
      return { close: vi.fn() };
    });
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot: vi.fn(async () => ({ revision: 1 })),
      subscribe,
      onSnapshot: vi.fn(),
      reconnectDelays: [10, 20]
    });

    await subscription.start();
    await Promise.resolve();
    expect(subscribe).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10);
    await subscription.whenIdle();
    expect(subscribe).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(19);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await subscription.whenIdle();
    expect(subscribe).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(20);
    await subscription.whenIdle();
    expect(subscribe).toHaveBeenCalledTimes(4);
    subscription.close();
  });

  it('cancels a pending reconnect when closed', async () => {
    vi.useFakeTimers();
    let disconnect!: () => void;
    const subscribe = vi.fn((_onEvent: () => void, onDisconnect: () => void) => {
      disconnect = onDisconnect;
      return { close: vi.fn() };
    });
    const subscription = createCreatorSnapshotSubscription({
      loadSnapshot: vi.fn(async () => ({ revision: 1 })),
      subscribe,
      onSnapshot: vi.fn()
    });

    await subscription.start();
    disconnect();
    subscription.close();
    await vi.runAllTimersAsync();

    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForMicrotasks(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('Condition was not reached');
}
