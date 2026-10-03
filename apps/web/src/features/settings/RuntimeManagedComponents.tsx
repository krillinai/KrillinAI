import type { CreatorRuntimeComponent } from '@opencreator/protocol';
import { ChevronDown, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RuntimeDependenciesController } from '../../app/use-runtime-dependencies.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useAppLanguage } from '../../i18n/LanguageProvider.js';
import { OriginalErrorDetails } from '../issues/OriginalErrorDetails.js';
import { localComponentPreparationMessage } from './local-component-copy.js';
import './local-transcription.css';

export function componentProgressText(component: Pick<CreatorRuntimeComponent, 'downloadedBytes' | 'totalBytes' | 'bytesPerSecond' | 'remainingSeconds'>): string {
  const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${size(component.downloadedBytes)}${component.totalBytes === null ? '' : ` / ${size(component.totalBytes)}`}${component.bytesPerSecond ? ` · ${size(component.bytesPerSecond)}/s` : ''}${component.remainingSeconds === null ? '' : ` · ~${Math.ceil(component.remainingSeconds / 60)} min`}`;
}

export function RuntimeManagedComponents({ controller, componentId, onReturn }: {
  controller: RuntimeDependenciesController;
  componentId?: string;
  onReturn?(): void;
}) {
  const localize = useLocalizedCopy();
  const { language } = useAppLanguage();
  const [action, setAction] = useState<{ componentId: string; kind: 'check' | 'download' }>();
  const [checkedComponentId, setCheckedComponentId] = useState<string>();
  const [actionError, setActionError] = useState<{ kind: 'check' | 'download'; detail: string }>();
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
      setActionError({ kind, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setAction(undefined);
    }
  }

  return <div className="local-transcription-components">
    {onReturn ? <button type="button" className="settings-secondary-button" onClick={onReturn}>{localize('返回视频翻译', 'Return to video translation')}</button> : null}
    {controller.componentError ? <div role="alert"><p>{localize('无法读取第三方组件状态，请检查服务连接后重试。', 'Cannot read third-party component status. Check the service connection and retry.', 'Det går inte att läsa status för tredjepartskomponenter. Kontrollera anslutningen till tjänsten och försök igen.')} <button type="button" onClick={() => void controller.refreshComponents?.()}>{localize('重试', 'Retry')}</button></p><OriginalErrorDetails detail={controller.componentError} /></div> : null}
    {actionError ? <div role="alert"><p>{actionError.kind === 'check'
      ? localize('组件状态检查失败，请检查服务连接后重试。', 'Component status check failed. Check the service connection and retry.', 'Kontrollen av komponentstatus misslyckades. Kontrollera anslutningen till tjänsten och försök igen.')
      : localize('无法启动组件下载，请检查服务连接后重试。', 'Could not start the component download. Check the service connection and retry.', 'Det gick inte att starta komponentnedladdningen. Kontrollera anslutningen till tjänsten och försök igen.')}</p><OriginalErrorDetails detail={actionError.detail} /></div> : null}
    {!status && !controller.componentError && controller.refreshComponents ? <p role="status">{localize('正在检查第三方组件', 'Checking third-party components')}</p> : null}
    {status?.components.filter(component => component.available || component.id === 'remotion').map(component => {
      const rendering = component.id === 'remotion';
      const selected = component.id === status.selectedProvider;
      const busy = ['downloading', 'verifying', 'extracting'].includes(component.state);
      const checking = action?.componentId === component.id && action.kind === 'check';
      const startingDownload = action?.componentId === component.id && action.kind === 'download';
      const canDownload = component.available && downloadComponents !== undefined;
      const updateAvailable = component.version !== null && component.supportedVersion !== null && component.version !== component.supportedVersion;
      const current = component.state === 'ready' && !updateAvailable;
      const updateLabel = localize(`更新到 ${component.supportedVersion}`, `Update to ${component.supportedVersion}`, `Uppdatera till ${component.supportedVersion}`);
      const requiredResources = [
        component.version === null || updateAvailable ? rendering ? localize('渲染引擎、浏览器和模板资源', 'rendering engine, browser, and template resources') : localize('转录引擎', 'transcription engine') : undefined,
        !rendering && component.models.find(model => model.id === component.model)?.installed !== true
          ? `${component.model ?? ''} ${localize('模型', 'model')}`.trim() : undefined
      ].filter(Boolean).join(localize('、', ', '));
      const labels = {
        not_installed: localize('尚未安装', 'Not installed'), partial: localize('模型尚未就绪', 'Model not ready'),
        downloading: localize('正在下载', 'Downloading'), verifying: localize('正在校验', 'Verifying'), extracting: localize('正在解压安装', 'Extracting'),
        ready: localize('已就绪', 'Ready'), failed: localize('下载失败', 'Download failed'), unsupported: rendering ? localize('暂无兼容组件包', 'Compatible component package unavailable') : localize('当前平台不支持受控安装', 'Managed installation unavailable on this platform')
      };
      return <article key={component.id} id={`component-${component.id}`} className="runtime-component-item local-component-item" data-highlight={component.id === componentId || undefined}>
        <div className="runtime-component-heading">
          <div>
            <div className="runtime-component-title">
              <h2>{component.name}</h2>
              <span role="status" data-status={updateAvailable || component.state === 'failed' ? 'update' : component.state === 'ready' ? 'current' : 'checking'}>{updateAvailable && !busy ? localize('有可用更新', 'Update available', 'Uppdatering tillgänglig') : labels[component.state]}</span>
              {selected ? <span>{localize('当前使用', 'Selected')}</span> : null}
            </div>
            <p>{rendering ? localize('用于火柴人动画本地渲染，仅在执行渲染时按需下载，也可提前安装。不影响脚本、角色预览和图片生成。', 'Used for local stickman animation rendering. Downloads only when rendering is requested, or can be installed in advance. Scripts, character previews, and image generation remain available.') : localize('用于本地语音转录，仅在实际需要转录时使用。', 'Used for local speech transcription only when transcription is needed.')}</p>
          </div>
        </div>
        <dl className="runtime-component-details">
          <div><dt>{localize('已安装引擎版本', 'Installed engine version')}</dt><dd>{component.version ?? localize('未安装', 'Not installed')}</dd></div>
          {rendering ? <div><dt>{localize('受支持版本', 'Supported version')}</dt><dd>{component.supportedVersion ?? '—'}</dd></div> : <div><dt>{localize('当前模型', 'Current model')}</dt><dd>{component.model ?? '—'}</dd></div>}
        </dl>
        <details className="local-component-details">
          <summary><ChevronDown size={15} aria-hidden="true" />{localize('组件详情', 'Component details')}</summary>
          <dl className="runtime-component-details">
            <div><dt>{localize('受支持版本', 'Supported version')}</dt><dd>{component.supportedVersion ?? '—'}</dd></div>
            <div><dt>{localize('Runtime 平台', 'Runtime platform')}</dt><dd>{status.platform} / {status.arch}</dd></div>
            <div><dt>{localize('安装位置', 'Install location')}</dt><dd>{component.path}</dd></div>
            <div><dt>{localize('资源来源与校验', 'Source and verification')}</dt><dd>{component.source}</dd></div>
            <div><dt>{localize('安装时间', 'Installed at')}</dt><dd>{component.installedAt ? new Date(component.installedAt).toLocaleString(language) : '—'}</dd></div>
            {!rendering ? <div><dt>{localize('模型列表', 'Models')}</dt><dd><ul className="local-component-models">{component.models.map(model => <li key={model.id}>{model.id} · {model.installed ? localize('已安装并通过检查', 'Installed and checked') : localize('未安装', 'Not installed')}{model.bytes === null ? '' : ` · ${(model.bytes / 1024 ** 3).toFixed(2)} GiB`}</li>)}</ul></dd></div> : null}
          </dl>
        </details>
        {busy ? <div className="local-component-progress" role="status">
          <strong>{component.item ?? (component.state === 'verifying' ? localize('正在检查本地组件', 'Checking local components') : localize('正在连接下载服务器', 'Connecting to download server'))}</strong>
          <p>{rendering ? component.state === 'downloading' ? localize('正在下载 Remotion 渲染组件', 'Downloading Remotion rendering components') : localize('正在校验或安装 Remotion 渲染资源', 'Verifying or installing Remotion rendering resources') : localComponentPreparationMessage(component.state, localize)}</p>
          {component.state === 'downloading' ? <>
            <progress max={100} value={component.percent ?? undefined} aria-label={localize('组件下载进度', 'Component download progress')} />
            <span>{component.percent === null ? '' : `${Math.floor(component.percent)}% · `}{componentProgressText(component)}</span>
          </> : null}
          <p>{rendering ? localize('正在准备渲染组件；准备完成后任务会自动继续，无需重新生成脚本或图片。', 'Preparing rendering components. The task continues automatically; scripts and images do not need to be regenerated.') : localize('模型文件较大，可能需要较长时间。当前尚未开始转录；准备完成后将自动继续，无需重新开始任务。', 'Models are large and may take time to prepare. Transcription has not started yet; the task continues automatically after preparation.')}</p>
        </div> : null}
        {component.error ? <div role="alert"><p>{rendering ? localize('渲染组件尚未就绪，已有脚本和图片不受影响。请检查诊断信息后重试。', 'Rendering components are not ready. Existing scripts and images are unchanged. Check the diagnostics and retry.') : localize('本地转录组件准备失败。已有字幕不受影响，可检查诊断信息后重试下载。', 'Local transcription preparation failed. Existing subtitles are unchanged; check the diagnostics and retry the download.', 'Förberedelsen av lokal transkription misslyckades. Befintliga undertexter är oförändrade; kontrollera diagnostiken och försök ladda ned igen.')}</p><OriginalErrorDetails detail={component.error} /></div> : null}
        {checkedComponentId === component.id && !controller.componentError && !actionError && !busy ? <p className="local-component-check-notice" role="status">{updateAvailable
          ? localize(`检查完成，可更新到受支持版本 ${component.supportedVersion}。`, `Check complete. You can update to the supported version ${component.supportedVersion}.`, `Kontrollen är klar. Du kan uppdatera till den version som stöds: ${component.supportedVersion}.`)
          : current ? localize('检查完成，当前组件无需更新。', 'Check complete. No component update is needed.', 'Kontrollen är klar. Ingen komponentuppdatering behövs.')
          : localize('组件状态已刷新，尚未开始下载。', 'Component status refreshed. No downloads have started.')}</p> : null}
        {!busy && canDownload ? <p>{component.state === 'ready'
          ? updateAvailable ? localize(`可更新到受支持版本 ${component.supportedVersion}，点击更新后开始下载。`, `The supported version ${component.supportedVersion} is available. Click update to start downloading.`, `Den version som stöds, ${component.supportedVersion}, är tillgänglig. Klicka på uppdatera för att börja ladda ned.`) : localize('当前组件无需更新；检查更新不会重新下载组件。', 'No component update is needed. Checking for updates will not download components again.', 'Ingen komponentuppdatering behövs. Att söka efter uppdateringar laddar inte ned komponenter igen.')
          : <>{localize('将准备所需资源：', 'Resources to prepare: ')}{requiredResources || localize('当前转录引擎和模型', 'the current transcription engine and model')}{localize('。', '.')}</>}</p> : null}
        {!busy ? <footer className="runtime-component-footer">
          <div className="runtime-component-actions">
            {refreshComponents ? <button type="button" className="settings-secondary-button" disabled={action !== undefined} onClick={() => void performAction(component.id, 'check', refreshComponents)}>
              {checking ? <LoaderCircle className="settings-spin" size={15} aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
              {checking ? localize('正在检查', 'Checking') : localize('检查更新', 'Check for updates', 'Sök efter uppdateringar')}
            </button> : null}
            {canDownload && !current && downloadComponents ? <button type="button" className="settings-primary-button" disabled={action !== undefined} onClick={() => void performAction(component.id, 'download', () => downloadComponents(component.id))}>
              {startingDownload ? <LoaderCircle className="settings-spin" size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
              {startingDownload ? localize('正在准备', 'Preparing') : component.state === 'failed' ? localize('重试下载', 'Retry download') : updateAvailable ? updateLabel : component.state === 'partial' ? localize('补齐组件', 'Complete installation') : localize('下载组件', 'Download components')}
            </button> : null}
          </div>
          {!selected && !rendering ? <a href="#/settings?tab=ai-services&section=transcription">{localize('调整转录设置', 'Change transcription settings')}</a> : null}
        </footer> : null}
      </article>;
    })}
  </div>;
}
