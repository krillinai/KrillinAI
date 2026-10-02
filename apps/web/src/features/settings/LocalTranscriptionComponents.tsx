import type { CreatorLocalComponent } from '@opencreator/protocol';
import { ChevronDown, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RuntimeDependenciesController } from '../../app/use-runtime-dependencies.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import './local-transcription.css';

export function componentProgressText(component: Pick<CreatorLocalComponent, 'downloadedBytes' | 'totalBytes' | 'bytesPerSecond' | 'remainingSeconds'>): string {
  const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${size(component.downloadedBytes)}${component.totalBytes === null ? '' : ` / ${size(component.totalBytes)}`}${component.bytesPerSecond ? ` · ${size(component.bytesPerSecond)}/s` : ''}${component.remainingSeconds === null ? '' : ` · ~${Math.ceil(component.remainingSeconds / 60)} min`}`;
}

export function LocalTranscriptionComponents({ controller, componentId, onReturn }: {
  controller: RuntimeDependenciesController;
  componentId?: string;
  onReturn?(): void;
}) {
  const localize = useLocalizedCopy();
  const [action, setAction] = useState<{ componentId: string; kind: 'check' | 'download' }>();
  const [checkedComponentId, setCheckedComponentId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const status = controller.componentsStatus;
  const refreshComponents = controller.refreshComponents;
  const downloadComponents = controller.downloadComponents;
  const focused = useRef<string>();
  useEffect(() => { void controller.refreshComponents?.(); }, [controller.refreshComponents]);
  useEffect(() => {
    if (!status || !componentId || focused.current === componentId) return;
    document.getElementById(`component-${componentId}`)?.scrollIntoView?.({ block: 'nearest' });
    focused.current = componentId;
  }, [status, componentId]);

  async function performAction(id: string, kind: 'check' | 'download', run: () => Promise<void>) {
    setAction({ componentId: id, kind });
    setCheckedComponentId(undefined);
    setActionError(undefined);
    try {
      await run();
      if (kind === 'check') setCheckedComponentId(id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setAction(undefined);
    }
  }

  return <div className="local-transcription-components">
    {onReturn ? <button type="button" className="settings-secondary-button" onClick={onReturn}>{localize('返回视频翻译', 'Return to video translation')}</button> : null}
    {controller.componentError ? <p role="alert">{localize('无法读取或下载本地转录组件：', 'Cannot read or download local components: ')}{controller.componentError} <button type="button" onClick={() => void controller.refreshComponents?.()}>{localize('重试', 'Retry')}</button></p> : null}
    {actionError ? <p role="alert">{actionError}</p> : null}
    {!status && !controller.componentError && controller.refreshComponents ? <p role="status">{localize('正在检查本地转录组件', 'Checking local transcription components')}</p> : null}
    {status?.components.filter(component => component.available).map(component => {
      const selected = component.id === status.selectedProvider;
      const busy = ['downloading', 'verifying', 'extracting'].includes(component.state);
      const checking = action?.componentId === component.id && action.kind === 'check';
      const startingDownload = action?.componentId === component.id && action.kind === 'download';
      const canDownload = selected && downloadComponents && component.state !== 'ready';
      const requiredResources = [
        component.version === null ? localize('转录引擎', 'transcription engine') : undefined,
        component.models.find(model => model.id === component.model)?.installed !== true
          ? `${component.model ?? ''} ${localize('模型', 'model')}`.trim() : undefined
      ].filter(Boolean).join(localize('、', ', '));
      const labels = {
        not_installed: localize('尚未安装', 'Not installed'), partial: localize('模型尚未就绪', 'Model not ready'),
        downloading: localize('正在下载', 'Downloading'), verifying: localize('正在校验', 'Verifying'), extracting: localize('正在解压安装', 'Extracting'),
        ready: localize('已就绪', 'Ready'), failed: localize('下载失败', 'Download failed'), unsupported: localize('当前平台不支持受控安装', 'Managed installation unavailable on this platform')
      };
      return <article key={component.id} id={`component-${component.id}`} className="runtime-component-item local-component-item" data-highlight={component.id === componentId || undefined}>
        <div className="runtime-component-heading">
          <div>
            <div className="runtime-component-title">
              <h2>{component.name}</h2>
              <span role="status" data-status={component.state === 'ready' ? 'current' : component.state === 'failed' ? 'update' : 'checking'}>{labels[component.state]}</span>
              {selected ? <span>{localize('当前使用', 'Selected')}</span> : null}
            </div>
            <p>{localize('用于本地语音转录，仅在实际需要转录时使用。', 'Used for local speech transcription only when transcription is needed.')}</p>
          </div>
        </div>
        <dl className="runtime-component-details">
          <div><dt>{localize('已安装引擎版本', 'Installed engine version')}</dt><dd>{component.version ?? localize('未安装', 'Not installed')}</dd></div>
          <div><dt>{localize('当前模型', 'Current model')}</dt><dd>{component.model ?? '—'}</dd></div>
        </dl>
        <details className="local-component-details">
          <summary><ChevronDown size={15} aria-hidden="true" />{localize('组件详情', 'Component details')}</summary>
          <dl className="runtime-component-details">
            <div><dt>{localize('受支持版本', 'Supported version')}</dt><dd>{component.supportedVersion ?? '—'}</dd></div>
            <div><dt>{localize('Runtime 平台', 'Runtime platform')}</dt><dd>{status.platform} / {status.arch}</dd></div>
            <div><dt>{localize('安装位置', 'Install location')}</dt><dd>{component.path}</dd></div>
            <div><dt>{localize('资源来源与校验', 'Source and verification')}</dt><dd>{component.source}</dd></div>
            <div><dt>{localize('安装时间', 'Installed at')}</dt><dd>{component.installedAt ? new Date(component.installedAt).toLocaleString() : '—'}</dd></div>
            <div><dt>{localize('模型列表', 'Models')}</dt><dd><ul className="local-component-models">{component.models.map(model => <li key={model.id}>{model.id} · {model.installed ? localize('已安装并通过检查', 'Installed and checked') : localize('未安装', 'Not installed')}{model.bytes === null ? '' : ` · ${(model.bytes / 1024 ** 3).toFixed(2)} GiB`}</li>)}</ul></dd></div>
          </dl>
        </details>
        {busy ? <div className="local-component-progress" role="status">
          <strong>{component.item ?? (component.state === 'verifying' ? localize('正在检查本地组件', 'Checking local components') : localize('正在连接下载服务器', 'Connecting to download server'))}</strong>
          {component.message ? <p>{component.message}</p> : null}
          {component.state === 'downloading' ? <>
            <progress max={100} value={component.percent ?? undefined} aria-label={localize('组件下载进度', 'Component download progress')} />
            <span>{component.percent === null ? '' : `${Math.floor(component.percent)}% · `}{componentProgressText(component)}</span>
          </> : null}
          <p>{localize('模型文件较大，可能需要较长时间。当前尚未开始转录；准备完成后将自动继续，无需重新开始任务。', 'Models are large and may take time to prepare. Transcription has not started yet; the task continues automatically after preparation.')}</p>
        </div> : null}
        {component.error ? <p role="alert">{component.error}</p> : null}
        {checkedComponentId === component.id && !controller.componentError && !actionError && !busy ? <p className="local-component-check-notice" role="status">{component.state === 'ready' ? localize('检查完成，本地组件已就绪。', 'Check complete. Local components are ready.') : localize('组件状态已刷新，尚未开始下载。', 'Component status refreshed. No downloads have started.')}</p> : null}
        {!busy && canDownload ? <p>{localize('将准备所需资源：', 'Resources to prepare: ')}{requiredResources || localize('当前转录引擎和模型', 'the current transcription engine and model')}{localize('。', '.')}</p> : null}
        {!busy ? <footer className="runtime-component-footer">
          <div className="runtime-component-actions">
            {refreshComponents ? <button type="button" className="settings-secondary-button" disabled={action !== undefined} onClick={() => void performAction(component.id, 'check', refreshComponents)}>
              {checking ? <LoaderCircle className="settings-spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              {checking ? localize('正在检查', 'Checking') : localize('检查状态', 'Check status')}
            </button> : null}
            {canDownload ? <button type="button" className="settings-primary-button" disabled={action !== undefined} onClick={() => void performAction(component.id, 'download', downloadComponents)}>
              {startingDownload ? <LoaderCircle className="settings-spin" size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
              {startingDownload ? localize('正在准备', 'Preparing') : component.state === 'failed' ? localize('重试下载', 'Retry download') : component.state === 'partial' ? localize('补齐组件', 'Complete installation') : localize('下载组件', 'Download components')}
            </button> : null}
          </div>
          {!selected ? <a href="#/settings?tab=ai-services&section=transcription">{localize('调整转录设置', 'Change transcription settings')}</a> : null}
        </footer> : null}
      </article>;
    })}
  </div>;
}
