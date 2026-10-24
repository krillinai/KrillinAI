import { gatewayModelIdMatches } from '@opencreator/protocol';
import { createContext, useContext, useEffect } from 'react';
import { gatewayModelReady, gatewayModelSupports, gatewayTranslationFlashModel, type CreatorJson, type GatewayAccountState, type GatewayModel } from '@opencreator/protocol';
import OfficialModelSelect, { officialModelLabel } from '../../components/forms/OfficialModelSelect.js';
import ModelBrandIcon from '../../components/brand/ModelBrandIcon.js';
import { useLocalizedCopy } from '../../i18n/useLocalizedCopy.js';
import { useOptionalCreatorSession } from './creator-session-store.js';
import './official-services.css';

export const OfficialServicesContext = createContext<GatewayAccountState | null | undefined>(undefined);

export function useOfficialServices(modality: GatewayModel['modality'], enabled = true) {
  const state = useContext(OfficialServicesContext);
  const session = useOptionalCreatorSession();
  const official = state === null || (state !== undefined && (state.source === 'gateway' || state.authState !== 'signed_out'));
  const models = state?.models.filter(model => model.modality === modality
    && (state.transport !== 'gateway' || (gatewayModelSupports(model, modality)
      && (modality !== 'transcription' || model.capabilities.includes('subtitle_timestamps'))))) ?? [];
  const choices = session?.state.officialModels;
  const rawSaved = choices && typeof choices === 'object' && !Array.isArray(choices) ? choices[modality] : undefined;
  const saved = typeof rawSaved === 'string' ? rawSaved : undefined;
  const taskRunning = session?.job.status === 'running' || session?.job.stages.some(stage => stage.status === 'queued' || stage.status === 'running');
  const translationDefault = modality === 'text' && session?.job.templateId === 'video-translation'
    ? gatewayTranslationFlashModel(models)?.id : undefined;
  const selected = saved ?? translationDefault ?? state?.selectedModels?.[modality];
  const model = models.find(candidate => gatewayModelIdMatches(candidate.id, selected)) ?? (!selected && state?.transport !== 'gateway' ? models[0] : undefined);
  const selectable = enabled && state?.authState === 'signed_in' && state.activationState === 'ready' && models.some(gatewayModelReady);
  const ready = selectable && model !== undefined && gatewayModelReady(model);
  useEffect(() => {
    if (ready && official && !taskRunning && model && !gatewayModelIdMatches(saved, model.id)) session?.updateDraft({ officialModels: { [modality]: model.id } });
  }, [official, ready, saved, model?.id, session?.job.id, taskRunning]);
  function selectModel(id: string) {
    if (!selectable || taskRunning || !models.some(candidate => gatewayModelIdMatches(candidate.id, id) && gatewayModelReady(candidate))) return;
    session?.updateDraft({ officialModels: { [modality]: id } });
  }
  const draftPatch: Record<string, CreatorJson> = model ? { officialModels: { [modality]: model.id } } : {};
  return { official, ready, selectable, models, model, selected, selectModel, draftPatch, taskRunning };
}

export function OfficialTaskModelFields(props: { modalities: GatewayModel['modality'][]; disabled?: boolean }) {
  const state = useContext(OfficialServicesContext);
  if (state === undefined || (state !== null && state.source === 'manual' && state.authState === 'signed_out')) return null;
  return <div className="official-task-models">
    {props.modalities.map(modality => <OfficialTaskModelField key={modality} modality={modality} disabled={props.disabled} />)}
  </div>;
}

function OfficialTaskModelField(props: { modality: GatewayModel['modality']; disabled?: boolean }) {
  const l = useLocalizedCopy();
  const service = useOfficialServices(props.modality);
  const labels = {
    text: l('文本模型', 'Text model'), image: l('图片模型', 'Image model'), video: l('视频模型', 'Video model'),
    speech: l('语音合成模型', 'Speech model'), transcription: l('语音识别模型', 'Transcription model')
  };
  return <OfficialModelField label={labels[props.modality]} service={service} disabled={props.disabled} />;
}

export function OfficialModelField(props: { label: string; service: ReturnType<typeof useOfficialServices>; disabled?: boolean }) {
  const l = useLocalizedCopy();
  const { models, model } = props.service;
  const label = model ? officialModelLabel(model, l('自动选择', 'Automatic')) : l('暂不可用', 'Unavailable');
  return <label className="creator-tool-field">
    <span>{props.label}</span>
    {models.length === 1 && props.service.ready ? <output className="official-model-value" aria-label={props.label}><ModelBrandIcon model={model!} />{label}</output> :
      <OfficialModelSelect label={props.label} models={models} value={props.service.selected ?? model?.id ?? ''} disabled={!props.service.selectable || props.disabled || props.service.taskRunning} onChange={props.service.selectModel} />}
  </label>;
}
