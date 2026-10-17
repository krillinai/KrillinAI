import {
  localWhisperLanguageCapability, normalizeCreatorLanguage, transcriptionLanguageSupport,
  unknownTranscriptionCapability, whisperLanguageCode, creatorTranscriptionModel,
  type CreatorServicesConfig, type TranscriptionLanguageCapability
} from '@opencreator/protocol';
import { gatewayCreatorBinding } from '../../gateway/creator-service-source.js';

/** Must match createKrillinConfigToml and the client constructor, including legacy cpp mapping. */
export function resolveKrillinTranscription(config: CreatorServicesConfig, officialModel?: string) {
  const provider = config.transcription.provider;
  const gateway = gatewayCreatorBinding(config);
  const model = creatorTranscriptionModel(config, gateway ? officialModel ?? gateway.models.transcription : undefined);
  let capability: TranscriptionLanguageCapability = unknownTranscriptionCapability();
  if (['whisperkit', 'whisper.cpp', 'faster-whisper'].includes(provider)) capability = localWhisperLanguageCapability(model);
  // Gateway language coverage is unknown until its model catalog declares it.
  if (gateway) {
    const caps = gateway.catalog?.find(item => item.id === model && item.modality === 'transcription')?.capabilities
      ?? (model === gateway.models.transcription ? gateway.capabilities?.transcription : undefined);
    if (caps) capability.timestamps = caps.includes('subtitle_timestamps') ? 'segment' : 'none';
  }
  const executionModel = provider === 'whisper.cpp' && model !== 'large-v3-turbo' ? 'large-v2' : model;
  return { provider, model, executionModel, capability };
}

export function assessKrillinTranscription(config: CreatorServicesConfig, language: string, officialModel?: string) {
  const resolved = resolveKrillinTranscription(config, officialModel);
  const productLanguage = normalizeCreatorLanguage(language);
  return {
    ...resolved, productLanguage,
    backendLanguage: ['openai', 'whisperkit', 'whisper.cpp', 'faster-whisper'].includes(resolved.provider) ? whisperLanguageCode(productLanguage) : productLanguage,
    support: transcriptionLanguageSupport(productLanguage, resolved.capability)
  };
}
