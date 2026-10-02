import { useEffect } from 'react';
import type { RuntimeDependenciesController } from '../../app/use-runtime-dependencies.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { componentProgressText } from '../settings/LocalTranscriptionComponents.js';

export function LocalTranscriptionNotice({ controller, platformCaptions, importedSubtitle, beforeNavigate }: {
  controller?: RuntimeDependenciesController;
  platformCaptions: boolean;
  importedSubtitle: boolean;
  beforeNavigate(): void;
}) {
  const localize = useLocalizedCopy();
  useEffect(() => { void controller?.refreshComponents?.(); }, [controller?.refreshComponents]);
  if (!controller) return null;
  const status = controller.componentsStatus;
  if (!status) return controller.componentError ? <aside className="local-transcription-notice" role="status">{localize('无法读取本地转录组件状态', 'Cannot read local transcription component status')} <button type="button" onClick={() => void controller.refreshComponents?.()}>{localize('重试', 'Retry')}</button></aside> : null;
  const component = status.components.find(candidate => candidate.id === status.selectedProvider);
  if (!component) return null;
  const busy = ['downloading', 'verifying', 'extracting'].includes(component.state);
  const ready = component.state === 'ready';
  const query = new URLSearchParams({ tab: 'local-components', component: component.id, from: 'video-translation', returnPath: window.location.hash });
  const settingsQuery = new URLSearchParams(query);
  settingsQuery.set('tab', 'ai-services');
  settingsQuery.set('section', 'transcription');
  return <aside className="local-transcription-notice" data-state={component.state} role="status">
    <div>
      <strong>{!component.available ? localize('当前平台不支持此本地转录组件', 'This local transcription component is unavailable on this platform') : busy ? localize('正在准备本地转录组件', 'Preparing local transcription components') : ready ? localize('本地转录已就绪', 'Local transcription ready') : component.state === 'failed' ? localize('本地转录组件下载失败', 'Local transcription component download failed') : localize('本地转录组件尚未就绪', 'Local transcription components are not ready')}</strong>
      <small>{component.name} · {status.selectedModel}</small>
      {!ready || importedSubtitle ? <p>{importedSubtitle ? localize('当前任务使用导入字幕，无需本地语音转录。', 'This task uses imported subtitles and does not need transcription.') : platformCaptions ? localize('将优先使用视频原始字幕；没有可用字幕时才需要本地转录。可提前下载组件，避免任务中等待。', 'Original video captions are used first. Local transcription is needed only when captions are unavailable; prepare components now to avoid waiting during the task.') : localize('此任务需要本地语音转录。模型文件较大，首次执行会自动下载，也可提前准备；下载并校验完成后任务会自动继续。', 'This task requires local transcription. Large models are downloaded automatically when needed, or can be prepared in advance. The task continues automatically after verification.')}</p> : null}
      {busy ? <p>{component.item} {component.state === 'downloading' ? componentProgressText(component) : localize('正在校验或安装，请稍候', 'Verifying or installing; please wait')}</p> : null}
      {component.error ? <p>{component.error}</p> : null}
    </div>
    <div className="local-transcription-notice-actions">
      {component.available ? <a href={`#/settings?${query}`} onClick={beforeNavigate}>{ready ? localize('管理组件', 'Manage components') : busy ? localize('查看下载进度', 'View download progress') : component.state === 'failed' ? localize('前往重试', 'Retry download') : localize('前往组件下载', 'Go to component downloads')}</a> : null}
      <a href={`#/settings?${settingsQuery}`} onClick={beforeNavigate}>{localize('调整转录设置', 'Change transcription settings')}</a>
    </div>
  </aside>;
}
