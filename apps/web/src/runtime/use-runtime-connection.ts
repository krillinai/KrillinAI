import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostBridge } from '../host/bridge.js';
import { createConnectionService, type ConnectionState } from '../services/connection-service.js';
import { RuntimeClient } from './client.js';
import type { ConnectionConfig } from './types.js';

export type RuntimeRecovery = {
  state: ConnectionState;
  phase: 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'restarting';
  attempt: number;
  epoch: number;
  message?: string;
  retry(): Promise<void>;
  restart?: () => Promise<void>;
};

export function useRuntimeConnection(host: HostBridge, fetchImpl: typeof fetch) {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [state, setState] = useState<ConnectionState>({ status: 'disconnected', message: '正在连接本地服务' });
  const [progress, setProgress] = useState<Omit<RuntimeRecovery, 'state' | 'retry' | 'restart'>>({
    phase: 'connecting', attempt: 0, epoch: 0
  });
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const restartWorkRef = useRef<Promise<void>>();

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let currentConfig: ConnectionConfig | null = null;
    let connected = false;
    let attempt = 0;
    let epoch = 0;
    let version = 0;
    const delays = [500, 1_000, 2_000, 5_000];

    const refresh = async (announcedConfig?: ConnectionConfig | null) => {
      if (closed) return;
      if (timer !== undefined) clearTimeout(timer);
      controller?.abort();
      const activeController = new AbortController();
      controller = activeController;
      const activeVersion = ++version;
      const active = () => !closed && activeVersion === version;
      let next: ConnectionState;
      try {
        const nextConfig = announcedConfig === undefined ? await readConfig(host, activeController.signal) : announcedConfig;
        if (!active()) return;
        if (nextConfig !== null) {
          currentConfig = nextConfig;
          setConfig(previous => sameConfig(previous, nextConfig) ? previous : nextConfig);
        }
        next = currentConfig === null
          ? { status: 'disconnected', message: '正在等待本地服务启动' }
          : await createConnectionService(new RuntimeClient({ ...currentConfig, fetchImpl }))
            .check({ signal: activeController.signal });
      } catch (error) {
        next = { status: 'disconnected', message: error instanceof Error ? error.message : '本地服务连接失败' };
      }
      if (!active()) return;
      setState(next);
      if (next.status === 'connected') {
        if (!connected) epoch += 1;
        connected = true;
        attempt = 0;
        setProgress({ phase: 'connected', attempt, epoch, message: next.codexStatusError });
        const delay = next.codexStatusError !== undefined || next.codexStatus?.availabilityProbe?.status === 'pending'
          ? 1_500 : 15_000;
        timer = setTimeout(() => void refresh(), delay);
      } else {
        connected = false;
        attempt += 1;
        setProgress({ phase: next.status === 'invalid_token' ? 'failed' : 'reconnecting', attempt, epoch, message: next.message });
        if (next.status !== 'invalid_token') {
          timer = setTimeout(() => void refresh(), delays[Math.min(attempt - 1, delays.length - 1)]);
        }
      }
    };
    refreshRef.current = refresh;
    const unsubscribe = host.subscribeConnectionConfig?.(nextConfig => {
      if (closed) return;
      if (nextConfig === null) {
        connected = false;
        setState({ status: 'disconnected', message: '本地服务暂时断开，正在重连' });
        setProgress(previous => ({ ...previous, phase: 'reconnecting' }));
      } else {
        currentConfig = nextConfig;
        setConfig(previous => sameConfig(previous, nextConfig) ? previous : nextConfig);
      }
      void refresh(nextConfig);
    });
    void refresh();
    return () => {
      closed = true;
      version += 1;
      controller?.abort();
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [host, fetchImpl]);

  const retry = useCallback(() => refreshRef.current(), []);
  const restart = useCallback(() => {
    if (restartWorkRef.current !== undefined) return restartWorkRef.current;
    if (host.restartRuntime === undefined) return Promise.resolve();
    setProgress(previous => ({ ...previous, phase: 'restarting', message: undefined }));
    const work = (async () => {
      try {
        const result = await host.restartRuntime!();
        if (!result.ok) throw new Error(result.message);
        await refreshRef.current();
      } catch (error) {
        setProgress(previous => ({ ...previous, phase: 'failed', message: error instanceof Error ? error.message : '重启本地服务失败' }));
      } finally {
        restartWorkRef.current = undefined;
      }
    })();
    restartWorkRef.current = work;
    return work;
  }, [host]);

  return {
    config,
    state,
    recovery: { ...progress, state, retry, ...(host.restartRuntime === undefined ? {} : { restart }) } satisfies RuntimeRecovery
  };
}

function sameConfig(previous: ConnectionConfig | null, next: ConnectionConfig): boolean {
  return previous?.baseUrl === next.baseUrl && previous?.token === next.token;
}

function readConfig(host: HostBridge, signal: AbortSignal): Promise<ConnectionConfig | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => reject(new Error('读取本地服务配置超时'))), 4_000);
    const onAbort = () => finish(() => reject(signal.reason));
    function finish(callback: () => void) {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      callback();
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void host.readConnectionConfig().then(
      value => finish(() => resolve(value)),
      error => finish(() => reject(error))
    );
  });
}
