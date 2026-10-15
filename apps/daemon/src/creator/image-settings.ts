import type {
  CreatorServicesConfig,
  ImageGenerationProvider
} from '@opencreator/protocol';
import { imageGenerationCapabilities } from '../image-generation/provider.js';
import { gatewayCreatorBinding } from '../gateway/creator-service-source.js';

export type ResolvedCreatorImageSettings = {
  provider: ImageGenerationProvider;
  model: string;
  candidateCount: number;
  supportsReferenceImage: boolean;
  maxReferenceImages: number;
  executionMode: 'local' | 'remote';
};

export function resolveCreatorImageSettings(input: {
  config: CreatorServicesConfig;
  provider?: unknown;
  candidateCount?: unknown;
  fallbackCandidateCount: number;
  maxCandidateCount: number;
}): ResolvedCreatorImageSettings {
  const provider = readImageProvider(input.provider, input.config.image.provider);
  const capabilities = imageGenerationCapabilities(provider);
  const gateway = gatewayCreatorBinding(input.config);
  const options = gateway?.catalog?.find(model => model.modality === 'image' && model.id === gateway.models.image)?.imageOptions;
  const requestedCount = typeof input.candidateCount === 'number'
    ? Math.floor(input.candidateCount)
    : input.fallbackCandidateCount;
  const candidateCount = provider === 'codex-native'
    ? 1
    : Math.min(options?.maxImages ?? input.maxCandidateCount, input.maxCandidateCount, Math.max(1, requestedCount));
  return {
    provider,
    model: provider === 'codex-native' ? 'codex-native' : input.config.image[provider].model,
    candidateCount,
    supportsReferenceImage: gateway ? gateway.capabilities?.image?.includes('edit') === true : capabilities.supportsReferenceImage,
    maxReferenceImages: options?.maxReferences ?? (gateway ? 1 : capabilities.maxReferenceImages),
    executionMode: provider === 'codex-native' ? 'local' : 'remote'
  };
}

export function imageProviderConfigured(
  config: CreatorServicesConfig,
  provider: ImageGenerationProvider
): boolean {
  if (provider === 'codex-native') return true;
  if (provider === 'kling') {
    const settings = config.image.kling;
    return settings.baseUrl.trim().length > 0
      && settings.model.trim().length > 0
      && settings.accessKey.trim().length > 0
      && settings.secretKey.trim().length > 0;
  }
  const settings = config.image[provider];
  if (!settings.baseUrl.trim() || !settings.model.trim()) return false;
  return settings.apiKey.trim().length > 0;
}

export function readImageProvider(
  value: unknown,
  fallback: ImageGenerationProvider
): ImageGenerationProvider {
  return value === 'openai'
    || value === 'jimeng'
    || value === 'kling'
    || value === 'gemini'
    || value === 'codex-native'
    ? value
    : fallback;
}
