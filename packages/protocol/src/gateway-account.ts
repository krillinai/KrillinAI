export type ServiceSource = 'manual' | 'gateway';
export const gatewayModelOperations = ['responses', 'chat/completions', 'images/generations', 'images/edits', 'audio/speech', 'audio/transcriptions', 'video/jobs'] as const;
export type GatewayModelOperation = typeof gatewayModelOperations[number];
export type GatewayModelProbeOptions = { textApi?: 'responses' | 'chat/completions' };
export type GatewayModelAvailability = {
  model: string;
  modality: GatewayModel['modality'];
  status: 'unverified' | 'recent_success' | 'restricted';
  operation?: GatewayModelOperation;
  checkedAt?: string;
};
export const gatewayDefaultVoiceId = '__default__';
export const gatewayRecommendedModelId = '__recommended__';
export type GatewayModel = {
  id: string;
  name?: string;
  modality: 'text' | 'image' | 'video' | 'speech' | 'transcription';
  capabilities: string[];
  vendor?: string;
  status?: 'ready' | 'temporarily_unavailable' | 'retired';
  statusReason?: string;
  recommended?: boolean;
  price?: { version: string; billing?: 'usage'; inputPerMillion?: number; cachedInputPerMillion?: number; cacheWritePerMillion?: number; imageInputPerMillion?: number; outputPerMillion?: number; perMinute?: number; perMillionCharacters?: number; perRequest?: number; videoUnitsPerSecond?: Record<string, number> };
  videoOptions?: {
    profile: string;
    maxImages: number; maxVideos: number; maxAudios: number;
    firstLastFrames: boolean; framesExclusive: boolean; generateAudio: boolean;
    referenceDuration?: number;
  };
  voices?: string[];
  sizes?: string[];
  durations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
  verification?: { adapterVersion: number; verifiedAt: string; countries: string[] };
  imageOptions?: {
    aspectRatios?: string[];
    resolutions?: string[];
    qualities?: string[];
    outputFormats?: string[];
    maxImages: number;
    maxReferences: number;
  };
};
export type GatewayModelPurpose = GatewayModel['modality'];
export function gatewayModelSupports(model: GatewayModel, purpose: GatewayModelPurpose): boolean {
  return model.modality === purpose && (purpose !== 'text' || model.capabilities.includes('responses'));
}
export function gatewayModelCompatible(model: GatewayModel): boolean {
  if (model.vendor?.toLowerCase() === 'anthropic' || /^(?:anthropic\/|claude-)/i.test(model.id)) return false;
  if (model.modality === 'text') return model.capabilities.includes('responses') && model.capabilities.includes('chat');
  if (model.modality === 'transcription') return model.capabilities.includes('subtitle_timestamps');
  return true;
}
export function gatewayModelReady(model: GatewayModel): boolean { return !model.status || model.status === 'ready'; }
export type GatewayConnectionDiagnostics = {
  path: string;
  reason: 'timeout' | 'network' | 'http' | 'invalid_response';
  httpStatus?: number;
  networkCode?: string;
};
export type GatewayActivationStage = 'credentials' | 'usage' | 'bootstrap' | 'catalog' | 'runtime' | 'configuration';
export type GatewayAccountState = {
  transport?: 'gateway' | 'openrouter-direct' | 'supplier-direct';
  supplier?: 'openrouter' | '88api' | 'chatanywhere';
  supplierRegion?: 'auto' | 'domestic' | 'overseas';
  source: ServiceSource;
  authState: 'signed_out' | 'authorizing' | 'signed_in' | 'signing_out' | 'expired' | 'disabled';
  activationState: 'inactive' | 'loading' | 'ready' | 'blocked';
  account: { id: string; email: string; verified: boolean; avatarUrl?: string } | null;
  bindingVersion: string | null;
  catalogVersion?: string;
  catalogUpdatedAt?: string;
  catalogRefreshState?: 'ready' | 'stale' | 'unavailable';
  catalogError?: string;
  models: GatewayModel[];
  modelAvailability?: GatewayModelAvailability[];
  selectedModels?: Partial<Record<GatewayModelPurpose, string>>;
  recommendedModels?: Partial<Record<GatewayModelPurpose, string>>;
  modelSelectionModes?: Partial<Record<GatewayModelPurpose, 'recommended' | 'manual'>>;
  modelSelectionNotice?: 'selection_updated';
  activationError: { code: string; message: string; stage?: GatewayActivationStage; request?: GatewayConnectionDiagnostics } | null;
};

export function gatewayVideoSizes(model: GatewayModel | undefined): string[] {
  if (model?.sizes?.length) return model.sizes;
  return (model?.resolutions ?? []).flatMap(resolution =>
    (model?.aspectRatios ?? []).filter(ratio => /^\d+:\d+$/.test(ratio)).map(ratio => `${resolution}@${ratio}`));
}

export function gatewayVideoSizeParameters(model: GatewayModel, value: string): { size: string } | { resolution: string; aspect_ratio: string } | undefined {
  if (!gatewayVideoSizes(model).includes(value)) return undefined;
  if (model.sizes?.includes(value)) return { size: value };
  const [resolution, aspect_ratio] = value.split('@');
  return resolution && aspect_ratio ? { resolution, aspect_ratio } : undefined;
}
export type GatewayAuthorization = { attemptId: string; authorizationUrl: string; expiresAt: string };
export type GatewayBalanceSnapshot = { availableUnits: string; reservedUnits: string; periodEnd: string | null; asOf: string };
export type GatewayBalanceState =
  | { status: 'ready'; value: GatewayBalanceSnapshot }
  | { status: 'unavailable'; lastKnown: GatewayBalanceSnapshot | null; code: string };
