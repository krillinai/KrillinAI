import { EventEmitter } from 'node:events';
import { net } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BootstrapController } from '../src/main/bootstrap-controller.js';
import type { DaemonManager, DaemonStartInput } from '../src/main/daemon-manager.js';
import type { DesktopLogger } from '../src/main/logger.js';
import type { SettingsStore } from '../src/main/settings-store.js';
import type { DaemonConnection } from '../src/shared/types.js';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));

vi.mock('../src/main/codex-resolver.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/main/codex-resolver.js')>(),
  resolveCodexEnvironment: vi.fn(async () => ({
    codexBin: 'codex',
    codexHome: 'codex-home',
    defaultCwd: '.',
    env: {},
    source: 'bundled',
    version: 'test',
    commit: null,
    runtimeRoot: null
  }))
}));

class FakeDaemon extends EventEmitter {
  connection: DaemonConnection | undefined;
  get currentConnection() { return this.connection; }
  get pid() { return 1234; }
  start = vi.fn(async (_input: DaemonStartInput) => {
    this.connection = { address: 'http://127.0.0.1:60764', token: 'test' };
    this.emit('connection', this.connection);
    return this.connection;
  });
  stop = vi.fn(async () => {
    this.connection = undefined;
    this.emit('connection', null);
  });
}

function setup(probeHealth?: (connection: DaemonConnection) => Promise<boolean>) {
  const daemon = new FakeDaemon();
  const logger: DesktopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    warnRateLimited: vi.fn(),
    flush: vi.fn(async () => undefined)
  };
  const controller = new BootstrapController({
    daemon: daemon as unknown as DaemonManager,
    settings: { read: () => ({ codexRuntimeMode: 'bundled' }) } as SettingsStore,
    logger,
    daemonEntryPath: 'daemon.js',
    appHome: '.',
    dataDir: '.',
    codexRuntimeRoot: '.',
    creatorRuntimeRoot: '.',
    stickmanRuntimeRoot: '.',
    defaultProjectRoot: '.',
    development: true,
    automaticRestartDelays: [0, 0],
    probeHealth
  });
  controller.on('ready', () => controller.markWorkspaceReady());
  return { controller, daemon, logger };
}

describe('Desktop Runtime recovery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('uses Electron networking for health probes when Node fetch fails with EINVAL', async () => {
    vi.useFakeTimers();
    const nodeFetch = vi.fn().mockRejectedValue(new Error('setSocketQoS EINVAL'));
    vi.stubGlobal('fetch', nodeFetch);
    vi.mocked(net.fetch).mockImplementation(async () => Response.json({ ok: true }));
    const { controller, daemon } = setup();
    await controller.start();

    try {
      controller.reportProxyFailure(daemon.currentConnection!);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(net.fetch).toHaveBeenCalledExactlyOnceWith(
        'http://127.0.0.1:60764/healthz',
        { signal: expect.any(AbortSignal), cache: 'no-store', credentials: 'omit' }
      );
      expect(nodeFetch).not.toHaveBeenCalled();
      expect(daemon.stop).not.toHaveBeenCalled();
      expect(daemon.start).toHaveBeenCalledTimes(1);
      expect(controller.currentState.phase).toBe('ready');
    } finally {
      await controller.stop();
    }
  });

  it.each([
    ['unhealthy HTTP status', () => Response.json({ ok: true }, { status: 503 })],
    ['unhealthy payload', () => Response.json({ ok: false })],
    ['invalid payload', () => new Response('invalid JSON')],
    ['network failure', () => { throw new Error('connection refused'); }]
  ])('still recovers after two Electron health probe failures: %s', async (_name, response) => {
    vi.useFakeTimers();
    vi.mocked(net.fetch).mockImplementation(async () => response());
    const { controller, daemon } = setup();
    await controller.start();

    try {
      controller.reportProxyFailure(daemon.currentConnection!);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(net.fetch).toHaveBeenCalledTimes(2);
      expect(daemon.stop).toHaveBeenCalledTimes(1);
      expect(daemon.start).toHaveBeenCalledTimes(2);
      expect(controller.currentState.phase).toBe('ready');
    } finally {
      await controller.stop();
    }
  });

  it('keeps a healthy daemon running after a transient proxy failure', async () => {
    const probeHealth = vi.fn(async () => true);
    const { controller, daemon } = setup(probeHealth);
    await controller.start();

    controller.reportProxyFailure(daemon.currentConnection!);
    await vi.waitFor(() => expect(probeHealth).toHaveBeenCalledTimes(1));
    expect(daemon.stop).not.toHaveBeenCalled();
    expect(daemon.start).toHaveBeenCalledTimes(1);
    expect(controller.currentState.phase).toBe('ready');
    await controller.stop();
  });

  it('restarts once after two failed probes despite concurrent request failures', async () => {
    const probeHealth = vi.fn(async () => false);
    const { controller, daemon } = setup(probeHealth);
    await controller.start();

    const connection = daemon.currentConnection!;
    controller.reportProxyFailure(connection);
    controller.reportProxyFailure(connection);
    await vi.waitFor(() => expect(daemon.start).toHaveBeenCalledTimes(2), { timeout: 2_000 });
    expect(daemon.stop).toHaveBeenCalledTimes(1);
    expect(probeHealth).toHaveBeenCalledTimes(2);
    expect(controller.currentState.phase).toBe('ready');
    await controller.stop();
  });

  it('bounds automatic restarts and still permits manual recovery', async () => {
    const { controller, daemon } = setup(vi.fn(async () => false));
    await controller.start();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      daemon.connection = undefined;
      daemon.emit('connection', null);
      daemon.emit('exit', { code: 1, reason: 'unexpected' });
      await vi.waitFor(() => expect(controller.currentState.phase).toBe(
        attempt < 2 ? 'ready' : 'failed'
      ));
    }
    expect(daemon.start).toHaveBeenCalledTimes(3);
    expect(controller.currentState.error?.code).toBe('DAEMON_RESTART_EXHAUSTED');

    await controller.restartRuntime();
    expect(daemon.stop).toHaveBeenCalledTimes(1);
    expect(daemon.start).toHaveBeenCalledTimes(4);
    expect(controller.currentState.phase).toBe('ready');
    await controller.stop();
  });

  it('cancels health recovery while the old daemon is stopping', async () => {
    const { controller, daemon } = setup(vi.fn(async () => false));
    await controller.start();
    const ready = vi.fn();
    controller.on('ready', ready);
    let finishStop!: () => void;
    const oldDaemonStopped = new Promise<void>(resolve => { finishStop = resolve; });
    daemon.stop.mockImplementation(async () => {
      await oldDaemonStopped;
      daemon.connection = undefined;
      daemon.emit('connection', null);
    });

    controller.reportProxyFailure(daemon.currentConnection!);
    await vi.waitFor(() => expect(daemon.stop).toHaveBeenCalled(), { timeout: 2_000 });
    const shutdown = controller.stop();
    finishStop();
    await shutdown;
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(daemon.start).toHaveBeenCalledTimes(1);
    expect(daemon.currentConnection).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();
  });

  it('waits for an in-flight recovery startup and stops its late connection', async () => {
    const { controller, daemon } = setup(vi.fn(async () => true));
    await controller.start();
    const ready = vi.fn();
    controller.on('ready', ready);
    let finishStart!: () => void;
    const startup = new Promise<void>(resolve => { finishStart = resolve; });
    daemon.start.mockImplementationOnce(async () => {
      await startup;
      daemon.connection = { address: 'http://127.0.0.1:60765', token: 'replacement' };
      daemon.emit('connection', daemon.connection);
      return daemon.connection;
    });

    daemon.connection = undefined;
    daemon.emit('connection', null);
    daemon.emit('exit', { code: 1, reason: 'unexpected' });
    await vi.waitFor(() => expect(daemon.start).toHaveBeenCalledTimes(2));
    let stopped = false;
    const shutdown = controller.stop().then(() => { stopped = true; });
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(stopped).toBe(false);
    } finally {
      finishStart();
      await shutdown;
    }

    expect(daemon.currentConnection).toBeUndefined();
    expect(ready).not.toHaveBeenCalled();
  });
});
