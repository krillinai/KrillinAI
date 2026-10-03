import type { CreatorJson, CreatorLocalComponent, CreatorRuntimeComponentsResponse, CreatorServicesConfig } from '@opencreator/protocol';
import type { KrillinDependencyLoader } from './dependency-loader.js';

type Progress = Record<string, CreatorJson>;
type Operation = { controller: AbortController; promise: Promise<void>; listeners: Set<(progress: Progress) => void>; progress: Progress };

export function manageLocalComponents(input: {
  loader: KrillinDependencyLoader;
  inspect(): Promise<Omit<CreatorRuntimeComponentsResponse, 'selectedProvider' | 'selectedModel'>>;
}) {
  const operations = new Map<string, Operation>();
  const states = new Map<string, Partial<CreatorLocalComponent>>();
  let inspection: Awaited<ReturnType<typeof input.inspect>> | undefined;
  let inspectionPending: ReturnType<typeof input.inspect> | undefined;
  let inspectedAt = 0;

  async function status(config: CreatorServicesConfig): Promise<CreatorRuntimeComponentsResponse> {
    if (inspection === undefined || Date.now() - inspectedAt > 10_000) {
      inspectionPending ??= input.inspect().finally(() => { inspectionPending = undefined; });
      inspection = await inspectionPending;
      inspectedAt = Date.now();
    }
    const selectedModel = localModel(config);
    return {
      ...inspection,
      selectedProvider: config.transcription.provider,
      selectedModel,
      components: inspection.components.map(component => {
        const model = localModel(config, component.id);
        const state = states.get(`${component.id}:${model}`);
        const active = [...operations.keys()].find(key => key.startsWith(`${component.id}:`));
        const activeState = active === undefined ? undefined : states.get(active);
        const installed = component.models.find(candidate => candidate.id === model)?.installed === true;
        const actualState = !component.available ? 'unsupported' : installed && component.version ? 'ready' : installed || component.version ? 'partial' : 'not_installed';
        return { ...component, model, state: actualState, ...state,
          ...(state?.state === 'ready' ? { state: actualState } : {}), ...activeState,
          ...(!component.available ? { state: 'unsupported' as const } : {})
        };
      })
    };
  }

  async function ensure(request: Parameters<KrillinDependencyLoader['ensure']>[0]): Promise<void> {
    const provider = request.config.transcription.provider;
    const model = localModel(request.config);
    if (model === null) return input.loader.ensure(request);
    if (request.signal.aborted) throw Object.assign(new Error('Creator stage was canceled'), { code: 'creator_stage_canceled' });
    const key = `${provider}:${model}`;
    let operation = operations.get(key);
    if (operation === undefined) {
      const preceding = [...operations.entries()].filter(([operationKey]) => operationKey.startsWith(`${provider}:`)).map(([, operation]) => operation.promise.catch(() => {}));
      const listeners = new Set<(progress: Progress) => void>();
      const controller = new AbortController();
      operation = { controller, listeners, promise: Promise.resolve(), progress: {} };
      operations.set(key, operation);
      const current = operation;
      const publish = (progress: Progress) => {
        const phase = typeof progress.phase === 'string' ? progress.phase : 'downloading_dependencies';
        states.set(key, {
          state: phase === 'verifying_dependencies' ? 'verifying' : phase === 'extracting_dependencies' ? 'extracting' : 'downloading',
          model, error: null, message: typeof progress.message === 'string' ? progress.message : undefined,
          item: typeof progress.dependencyItem === 'string' ? progress.dependencyItem : null,
          downloadedBytes: numberValue(progress.downloadedBytes) ?? 0, totalBytes: numberValue(progress.totalBytes),
          percent: numberValue(progress.dependencyPercent), bytesPerSecond: numberValue(progress.bytesPerSecond), remainingSeconds: numberValue(progress.remainingSeconds)
        });
        current.progress = progress;
        for (const listener of listeners) listener(progress);
      };
      publish({ phase: preceding.length > 0 ? 'downloading_dependencies' : 'verifying_dependencies', percent: 2, dependency: provider, dependencyModel: model,
        message: preceding.length > 0 ? '正在等待本地转录引擎的共享组件准备完成，随后会自动准备当前模型并继续转录，无需重新开始。' : '正在检查本地转录引擎和模型是否已安装；缺失时会自动下载，准备完成后会自动继续转录。'
      });
      current.promise = Promise.all(preceding).then(() => input.loader.ensure({
        config: structuredClone(request.config),
        signal: controller.signal,
        reportProgress: publish
      })).then(() => {
        states.set(key, { state: 'ready', model, error: null, percent: 100 });
        inspectedAt = 0;
        const progress: Progress = { phase: 'dependencies_ready', percent: 5, message: '本地转录组件已准备完成，正在开始语音转录', dependency: provider, dependencyModel: model };
        for (const listener of listeners) listener(progress);
      }).catch(error => {
        states.set(key, { ...states.get(key), state: 'failed', error: error instanceof Error ? error.message : String(error) });
        throw error;
      }).finally(() => { operations.delete(key); });
    }
    operation.listeners.add(request.reportProgress);
    if (Object.keys(operation.progress).length > 0) request.reportProgress(operation.progress);
    try {
      await new Promise<void>((resolve, reject) => {
        const canceled = () => reject(Object.assign(new Error('Creator stage was canceled'), { code: 'creator_stage_canceled' }));
        request.signal.addEventListener('abort', canceled, { once: true });
        operation!.promise.then(resolve, reject).finally(() => request.signal.removeEventListener('abort', canceled));
      });
    } finally {
      operation.listeners.delete(request.reportProgress);
    }
  }

  return {
    ...input.loader,
    ensure,
    status,
    async download(config: CreatorServicesConfig, componentId?: CreatorLocalComponent['id']): Promise<CreatorRuntimeComponentsResponse> {
      const downloadConfig = structuredClone(config);
      if (componentId !== undefined) downloadConfig.transcription.provider = componentId;
      if (localModel(downloadConfig) === null) throw new Error('A local transcription provider must be selected');
      const current = await status(config);
      if (!current.components.find(component => component.id === downloadConfig.transcription.provider)?.available) {
        throw new Error('The selected local transcription component is unavailable on this platform');
      }
      void ensure({ config: downloadConfig, signal: new AbortController().signal, reportProgress() {} }).catch(() => {});
      return status(config);
    },
    close() { for (const operation of operations.values()) operation.controller.abort(); }
  };
}

function localModel(config: CreatorServicesConfig, provider = config.transcription.provider): string | null {
  if (provider === 'whisperkit') return config.transcription.whisperKit.model;
  if (provider === 'whisper.cpp') return config.transcription.whisperCpp.model;
  if (provider === 'faster-whisper') return config.transcription.fasterWhisper.model;
  return null;
}

function numberValue(value: CreatorJson | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
