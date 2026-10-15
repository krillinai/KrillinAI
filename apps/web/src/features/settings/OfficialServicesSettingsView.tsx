import { useEffect, useRef, useState } from 'react';
import { AudioLines, Image, LoaderCircle, Mic, RefreshCw, TextCursorInput, Video, type LucideIcon } from 'lucide-react';
import { gatewayModelCompatible, gatewayModelSupports, gatewayModelReady, type GatewayAccountState, type GatewayModelPurpose } from '@opencreator/protocol';
import type { GatewayAccountSettingsService } from '../../services/gateway-account-service.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import OfficialModelSelect, { officialModelPrice } from '../../components/forms/OfficialModelSelect.js';
import { ApiClientError } from '../../runtime/errors.js';
import './official-services-settings.css';

export function OfficialServicesSettingsView(props: { state: GatewayAccountState; service: GatewayAccountSettingsService; onChange(state: GatewayAccountState): void }) {
  const l = useLocalizedCopy();
  const [pendingModality, setPendingModality] = useState<GatewayModelPurpose | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++; setPendingModality(null); setRefreshing(false);
    setError(props.state.authState === 'expired' ? l('登录已过期，请重新登录', 'Session expired; sign in again') : '');
    return () => { sequence.current++; };
  }, [props.state.account?.id, props.state.authState, props.state.bindingVersion, l]);

  async function refreshModels() {
    const request = ++sequence.current; setRefreshing(true); setError('');
    try { const next = await props.service.getState({ refreshModels: true }); if (sequence.current === request) props.onChange(next); }
    catch { if (sequence.current === request) setError(l('模型列表刷新失败，保留上次结果', 'Could not refresh models. Previous results are retained.')); }
    finally { if (sequence.current === request) setRefreshing(false); }
  }

  async function selectModel(modality: GatewayModelPurpose, id: string) {
    const request = ++sequence.current; setPendingModality(modality); setError('');
    try { const next = await props.service.selectModel(modality, id); if (sequence.current === request) props.onChange(next); }
    catch (cause) {
      if (sequence.current !== request) return;
      if (cause instanceof ApiClientError && cause.code === 'GATEWAY_AUTH_REQUIRED') {
        setError(l('登录已过期，请重新登录', 'Session expired; sign in again'));
        await props.service.getState().then(next => { if (sequence.current === request) props.onChange(next); }).catch(() => undefined);
      } else if (cause instanceof ApiClientError && cause.details?.gatewayCode === 'active_tasks') {
        setError(l('请等待当前任务完成后切换模型', 'Wait for the current task to finish before switching models.'));
      } else if (cause instanceof ApiClientError && cause.details?.gatewayCode === 'invalid_model') {
        setError(l('该模型已不可用，请刷新模型列表后重试', 'This model is unavailable. Refresh the model list and try again.'));
        await props.service.getState().then(next => { if (sequence.current === request) props.onChange(next); }).catch(() => undefined);
      } else if (cause instanceof ApiClientError && cause.details?.gatewayCode === 'services_not_ready') {
        setError(l('模型服务暂不可用，请重新连接后重试', 'Model service is unavailable. Reconnect and try again.'));
      } else {
        setError(l('模型切换失败，请重试', 'Could not switch models. Try again.'));
      }
    } finally { if (sequence.current === request) setPendingModality(null); }
  }

  const modalities: Array<{ id: GatewayModelPurpose; label: string; icon: LucideIcon }> = [
    { id: 'text', label: l('文本模型', 'Text model'), icon: TextCursorInput },
    { id: 'image', label: l('图片模型', 'Image model'), icon: Image },
    { id: 'video', label: l('视频模型', 'Video model'), icon: Video },
    { id: 'speech', label: l('语音合成模型', 'Speech model'), icon: AudioLines },
    { id: 'transcription', label: l('转录模型', 'Transcription model'), icon: Mic },
  ];
  return <div className="official-services-models">
    {props.state.transport === 'gateway' ? <div className="official-catalog-toolbar">
      <a href={l('https://www.open-creator.ai/models?lang=zh', 'https://www.open-creator.ai/models')} target="_blank" rel="noreferrer">{l('模型目录', 'Model catalog')}</a>
      <button type="button" disabled={refreshing || pendingModality !== null} aria-label={l('刷新模型列表', 'Refresh model list')} title={l('刷新模型列表', 'Refresh model list')} onClick={() => void refreshModels()}>
        <RefreshCw size={16} className={refreshing ? 'official-services-spinner' : undefined} />
      </button>
    </div> : null}
    {modalities.map(modality => {
      const models = props.state.models.filter(model => gatewayModelSupports(model, modality.id)
        && (props.state.transport !== 'gateway' || gatewayModelCompatible(model)));
      const selected = props.state.selectedModels?.[modality.id] ?? '';
      const selectedModel = models.find(model => model.id === selected);
      const recommended = models.find(model => model.id === props.state.recommendedModels?.[modality.id] && gatewayModelReady(model));
      const available = props.state.authState === 'signed_in' && props.state.source === 'gateway' && props.state.activationState === 'ready' && models.some(gatewayModelReady);
      const Icon = modality.icon;
      return <div className="official-services-model-row" key={modality.id} aria-busy={pendingModality === modality.id}>
        <span className="official-services-model-label"><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>
          <span className="official-services-model-name">{modality.label}</span>
          <span className="official-services-model-count" id={`official-${modality.id}-count`}>{models.some(gatewayModelReady)
            ? l(`${models.filter(gatewayModelReady).length} 个可用模型`, `${models.filter(gatewayModelReady).length} available models`)
            : l('暂不可用', 'Unavailable')}</span>
          {selectedModel?.price ? <span className="official-model-availability">{officialModelPrice(selectedModel, l)}</span> : null}
          {selected && (!selectedModel || !gatewayModelReady(selectedModel)) ? <span className="official-model-availability">{l('暂不可用，请选择其他模型', 'Unavailable; select another model')}</span> : null}
        </span></span>
        <span className="official-services-model-select">
          <OfficialModelSelect label={modality.label} describedBy={`official-${modality.id}-count`} models={models} value={selected}
            recommendedModel={recommended} followsRecommendation={props.state.modelSelectionModes?.[modality.id] === 'recommended'}
            disabled={refreshing || pendingModality !== null || !available} onChange={id => void selectModel(modality.id, id)} />
          {pendingModality === modality.id ? <span className="official-model-progress" role="status"><LoaderCircle className="official-services-spinner" size={16} aria-hidden="true" />{l('正在保存', 'Saving')}</span> : null}
        </span>
      </div>;
    })}
    {props.state.modelSelectionNotice ? <p role="status">{l('原模型已不可用，已更新为系统推荐模型', 'An unavailable selection was updated to the recommended model.')}</p> : null}
    {props.state.catalogError ? <p className="official-services-error" role="status">{l('模型列表暂未更新，正在显示上次结果', 'Model update unavailable. Showing previous results.')}</p> : null}
    {error ? <p className="official-services-error" role="alert">{error}</p> : null}
  </div>;
}
