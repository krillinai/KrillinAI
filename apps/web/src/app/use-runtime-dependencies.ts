import type { CreatorRuntimeComponentsResponse, CreatorYtDlpStatus, OpenCreatorIssue } from '@opencreator/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageIssueState } from '../features/issues/page-issue-state.js';
import type { RuntimeDependencyService } from '../services/runtime-dependency-service.js';

export type RuntimeDependencyPhase =
  | 'idle'
  | 'loading'
  | 'checking'
  | 'updating';

export type RuntimeDependenciesController = {
  componentsStatus?: CreatorRuntimeComponentsResponse;
  componentError?: string;
  refreshComponents?(): Promise<void>;
  downloadComponents?(): Promise<void>;
  ytDlpStatus?: CreatorYtDlpStatus;
  phase: RuntimeDependencyPhase;
  /** @deprecated Runtime failures are exposed through issues. */
  error?: string;
  issues?: OpenCreatorIssue[];
  dismissIssue?(issueId: string): void;
  checkYtDlpUpdate(force?: boolean): Promise<CreatorYtDlpStatus>;
  updateYtDlp(): Promise<CreatorYtDlpStatus>;
};

export function useRuntimeDependencies(input: {
  connected: boolean;
  service: RuntimeDependencyService | null;
}): RuntimeDependenciesController {
  const [ytDlpStatus, setYtDlpStatus] = useState<CreatorYtDlpStatus>();
  const [componentsStatus, setComponentsStatus] = useState<CreatorRuntimeComponentsResponse>();
  const [componentError, setComponentError] = useState<string>();
  const componentsRef = useRef<CreatorRuntimeComponentsResponse>();
  const componentDownloadActive = componentsStatus?.components.some(component => ['downloading', 'verifying', 'extracting'].includes(component.state)) ?? false;
  const [phase, setPhase] = useState<RuntimeDependencyPhase>('idle');
  const pageIssues = usePageIssueState('runtime');
  const refreshComponents = useCallback(async () => {
    if (!input.connected || !input.service?.getComponentsStatus) return;
    try {
      const status = await input.service.getComponentsStatus();
      componentsRef.current = status;
      setComponentsStatus(status);
      setComponentError(undefined);
    } catch (error) {
      setComponentError(error instanceof Error ? error.message : 'Unable to read local components');
    }
  }, [input.connected, input.service]);

  useEffect(() => {
    if (!input.connected) { setComponentsStatus(undefined); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refreshComponents();
      const busy = componentsRef.current?.components.some(component => ['downloading', 'verifying', 'extracting'].includes(component.state));
      if (!stopped) timer = setTimeout(() => { void poll(); }, busy ? 1000 : 15_000);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [input.connected, refreshComponents, componentDownloadActive]);

  const downloadComponents = useCallback(async () => {
    if (!input.connected || !input.service?.downloadComponents) return;
    try {
      setComponentsStatus(await input.service.downloadComponents());
      setComponentError(undefined);
    } catch (error) {
      setComponentError(error instanceof Error ? error.message : 'Unable to download local components');
    }
  }, [input.connected, input.service]);

  useEffect(() => {
    let active = true;
    let operationId = 'runtime.load-yt-dlp';
    if (!input.connected || input.service === null) {
      setYtDlpStatus(undefined);
      setPhase('idle');
      pageIssues.clearIssues();
      return () => {
        active = false;
      };
    }

    setPhase('loading');
    void input.service.getYtDlpStatus()
      .then(async response => {
        if (!active) return;
        setYtDlpStatus(response.ytDlp);
        pageIssues.resolveOperation('runtime.load-yt-dlp');
        if (!response.ytDlp.checkDue) return;
        operationId = 'runtime.auto-check-yt-dlp';
        setPhase('checking');
        const checked = await input.service?.checkYtDlpUpdate(false);
        if (active && checked !== undefined) {
          setYtDlpStatus(checked.ytDlp);
          pageIssues.resolveOperation('runtime.auto-check-yt-dlp');
        }
      })
      .catch(caught => {
        if (active) {
          pageIssues.captureOperationFailure(
            operationId,
            caught,
            '无法读取或检查运行组件，请确认本地 Runtime 已连接后重试。',
            { retryable: true }
          );
        }
      })
      .finally(() => {
        if (active) setPhase('idle');
      });

    return () => {
      active = false;
    };
  }, [
    input.connected,
    input.service,
    pageIssues.captureOperationFailure,
    pageIssues.clearIssues,
    pageIssues.resolveOperation
  ]);

  const checkYtDlpUpdate = useCallback(async (force = true) => {
    if (!input.connected || input.service === null) {
      throw new Error('runtime_dependency_unavailable');
    }
    setPhase('checking');
    try {
      const response = await input.service.checkYtDlpUpdate(force);
      setYtDlpStatus(response.ytDlp);
      pageIssues.resolveOperation('runtime.check-yt-dlp');
      pageIssues.resolveOperation('runtime.auto-check-yt-dlp');
      pageIssues.resolveOperation('runtime.load-yt-dlp');
      return response.ytDlp;
    } catch (caught) {
      pageIssues.captureOperationFailure(
        'runtime.check-yt-dlp',
        caught,
        '检查运行组件更新失败，请稍后重试。',
        { retryable: true }
      );
      throw caught;
    } finally {
      setPhase('idle');
    }
  }, [input.connected, input.service, pageIssues.captureOperationFailure, pageIssues.resolveOperation]);

  const updateYtDlp = useCallback(async () => {
    if (!input.connected || input.service === null) {
      throw new Error('runtime_dependency_unavailable');
    }
    setPhase('updating');
    try {
      const response = await input.service.updateYtDlp();
      setYtDlpStatus(response.ytDlp);
      pageIssues.resolveOperation('runtime.update-yt-dlp');
      return response.ytDlp;
    } catch (caught) {
      pageIssues.captureOperationFailure(
        'runtime.update-yt-dlp',
        caught,
        '运行组件更新失败，请检查网络和磁盘空间后重试。',
        { retryable: true }
      );
      throw caught;
    } finally {
      setPhase('idle');
    }
  }, [input.connected, input.service, pageIssues.captureOperationFailure, pageIssues.resolveOperation]);

  return {
    componentsStatus, componentError, refreshComponents, downloadComponents,
    ytDlpStatus,
    phase,
    issues: pageIssues.issues,
    dismissIssue: pageIssues.dismissIssue,
    checkYtDlpUpdate,
    updateYtDlp
  };
}
