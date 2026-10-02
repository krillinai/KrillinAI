import { ApiClientError } from './errors.js';
import { createRequestDeadline } from './request-deadline.js';

export type CreatorConnectionState = {
  status: 'connecting' | 'connected' | 'reconnecting' | 'failed';
  attempt: number;
  error?: unknown;
};

export function createCreatorSnapshotSubscription<T, Event = unknown>(input: {
  loadSnapshot(options: { signal: AbortSignal }): Promise<T>;
  subscribe(onEvent: (event: Event) => void, onDisconnect: (error?: unknown) => void): { close(): void };
  onSnapshot(snapshot: T): void;
  onEvent?(event: Event): void;
  shouldReloadSnapshot?(event: Event): boolean;
  onError?(error: unknown): void;
  onState?(state: CreatorConnectionState): void;
  reconnectDelays?: readonly number[];
}) {
  const reconnectDelays = input.reconnectDelays ?? [250, 500, 1_000, 2_000, 5_000];
  let closed = false;
  let connection: { close(): void } | undefined;
  let work: Promise<void> = Promise.resolve();
  let reloadRequested = false;
  let reloadScheduled = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let lastError: unknown;

  const reloadSnapshot = async () => {
    if (closed) return;
    const deadline = createRequestDeadline(15_000, controller.signal);
    let snapshot: T;
    try {
      snapshot = await input.loadSnapshot({ signal: deadline.signal });
    } finally {
      deadline.dispose();
    }
    if (closed) return;
    input.onSnapshot(snapshot);
  };

  const connect = async () => {
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    await reloadSnapshot();
    if (closed) return;
    connection?.close();
    connection = input.subscribe(
      event => {
        reconnectAttempt = 0;
        input.onEvent?.(event);
        if (input.shouldReloadSnapshot?.(event) ?? true) scheduleReload();
      },
      error => error === undefined ? scheduleReconnect() : handleFailure(error)
    );
    input.onState?.({ status: 'connected', attempt: 0 });
  };

  const scheduleReload = () => {
    if (closed) return;
    reloadRequested = true;
    if (reloadScheduled) return;
    reloadScheduled = true;
    work = work
      .then(async () => {
        try {
          while (!closed && reloadRequested) {
            reloadRequested = false;
            await reloadSnapshot();
          }
        } finally {
          reloadScheduled = false;
        }
      })
      .catch(error => {
        handleFailure(error);
      });
  };

  const handleFailure = (error: unknown) => {
    if (closed) return;
    lastError = error;
    input.onError?.(error);
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500
      && ![408, 429].includes(error.status)) {
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      reloadRequested = false;
      connection?.close();
      connection = undefined;
      input.onState?.({ status: 'failed', attempt: reconnectAttempt, error });
      return;
    }
    scheduleReconnect();
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== undefined) return;
    connection?.close();
    connection = undefined;
    const delayIndex = Math.min(reconnectAttempt, Math.max(0, reconnectDelays.length - 1));
    const delay = reconnectDelays[delayIndex] ?? 5_000;
    reconnectAttempt += 1;
    input.onState?.({ status: 'reconnecting', attempt: reconnectAttempt, error: lastError });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      if (closed) return;
      work = work
        .then(connect)
        .catch(handleFailure);
    }, delay);
  };

  return {
    async start(): Promise<void> {
      input.onState?.({ status: 'connecting', attempt: 0 });
      work = connect().catch(handleFailure);
      await work;
    },
    async retry(): Promise<void> {
      if (closed) return;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      reconnectAttempt = 0;
      lastError = undefined;
      work = work.then(connect).catch(handleFailure);
      await work;
    },
    async whenIdle(): Promise<void> {
      await work;
    },
    close(): void {
      closed = true;
      controller.abort();
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      connection?.close();
      connection = undefined;
    }
  };
}
