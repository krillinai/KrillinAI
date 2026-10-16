import type { GatewayModel } from '@opencreator/protocol';

export type MediaCatalogItem = {
  id: string;
  name?: string;
  architecture?: { input_modalities?: string[] };
  supported_parameters?: Record<string, { min?: number; max?: number; values?: string[] }>;
  supported_sizes?: string[] | null;
  supported_resolutions?: string[] | null;
  supported_aspect_ratios?: string[] | null;
  supported_durations?: number[] | null;
  supported_frame_images?: string[] | null;
  pricing_skus?: Record<string, string>;
};

export type MediaProfile = {
  id: string;
  modality: 'image' | 'video';
  model?: GatewayModel;
  unsupportedReason?: string;
};

const families: Array<{ modality: 'image' | 'video'; name: string; pattern: RegExp; preferred: string[] }> = [
  { modality: 'image', name: 'FLUX', pattern: /^black-forest-labs\/flux/, preferred: ['black-forest-labs/flux-3-image', 'black-forest-labs/flux.2-klein-4b'] },
  { modality: 'image', name: 'Seedream', pattern: /^bytedance-seed\/seedream-/, preferred: ['bytedance-seed/seedream-5-0-flash', 'bytedance-seed/seedream-4.5'] },
  { modality: 'image', name: 'Recraft', pattern: /^recraft\/recraft-/, preferred: ['recraft/recraft-v4.1-flash', 'recraft/recraft-v4'] },
  { modality: 'image', name: 'MAI Image', pattern: /^microsoft\/mai-image-/, preferred: ['microsoft/mai-image-2.6-flash', 'microsoft/mai-image-2.5'] },
  { modality: 'image', name: 'Qwen Image', pattern: /^qwen\/qwen-image-/, preferred: ['qwen/qwen-image-3'] },
  { modality: 'image', name: 'Krea', pattern: /^krea\/krea-/, preferred: ['krea/krea-2-medium-turbo', 'krea/krea-2-medium'] },
  { modality: 'image', name: 'Riverflow', pattern: /^sourceful\/riverflow-/, preferred: ['sourceful/riverflow-v2.5-fast', 'sourceful/riverflow-v2-fast'] },
  { modality: 'image', name: 'Grok Image', pattern: /^x-ai\/grok-imagine-image/, preferred: ['x-ai/grok-imagine-image-2.0'] },
  { modality: 'image', name: 'Gemini Image', pattern: /^google\/gemini-/, preferred: ['google/gemini-3.1-flash-image', 'google/gemini-2.5-flash-image'] },
  { modality: 'image', name: 'GPT Image', pattern: /^openai\/(gpt-image-|gpt-\d.*image)/, preferred: ['openai/gpt-image-1-mini', 'openai/gpt-image-2'] },
  { modality: 'image', name: 'HY Image', pattern: /^tencent\/hy-image-/, preferred: ['tencent/hy-image-v3.5-preview'] },
  { modality: 'image', name: 'Ming Image', pattern: /^inclusionai\/ming-image-/, preferred: ['inclusionai/ming-image-0.1-design'] },
  { modality: 'image', name: 'Muse Image', pattern: /^meta\/muse-image/, preferred: ['meta/muse-image'] },
  { modality: 'video', name: 'Grok Video', pattern: /^x-ai\/grok-imagine-video/, preferred: ['x-ai/grok-imagine-video-1.5-lite'] },
  { modality: 'video', name: 'Seedance', pattern: /^bytedance\/seedance-/, preferred: ['bytedance/seedance-2.0-fast', 'bytedance/seedance-1-5-pro'] },
  { modality: 'video', name: 'Kling', pattern: /^kwaivgi\/kling-/, preferred: ['kwaivgi/kling-v3.0-std'] },
  { modality: 'video', name: 'Wan', pattern: /^alibaba\/wan-/, preferred: ['alibaba/wan-2.6', 'alibaba/wan-3.0'] },
  { modality: 'video', name: 'HappyHorse', pattern: /^alibaba\/happyhorse-/, preferred: ['alibaba/happyhorse-1.1'] },
  { modality: 'video', name: 'Hailuo', pattern: /^minimax\/hailuo-/, preferred: ['minimax/hailuo-2.3'] },
  { modality: 'video', name: 'Veo', pattern: /^google\/veo-/, preferred: ['google/veo-3.1-lite'] },
  { modality: 'video', name: 'Runway', pattern: /^runway\/(gen-|aleph-)/, preferred: ['runway/gen-4.5'] },
  { modality: 'video', name: 'HeyGen', pattern: /^heygen\/(heygen-video-|avatar-)/, preferred: ['heygen/heygen-video-1'] },
  { modality: 'video', name: 'FLUX Video', pattern: /^black-forest-labs\/flux/, preferred: ['black-forest-labs/flux-3-video'] }
];

export function mediaFamily(profile: MediaProfile): string | undefined {
  return families.find(family => family.modality === profile.modality && family.pattern.test(profile.id))?.name;
}

export function familyRepresentatives(profiles: MediaProfile[]): MediaProfile[] {
  return families.flatMap(family => {
    const candidates = profiles.filter(profile => profile.model && profile.modality === family.modality && family.pattern.test(profile.id));
    const preferred = family.preferred.map(id => candidates.find(profile => profile.id === id)).find(Boolean);
    // Unknown/new families require an explicit selection; aliases never expand acceptance.
    const selected = preferred ?? candidates.sort((a, b) => a.id.localeCompare(b.id))[0];
    return selected ? [selected] : [];
  });
}

export function profileOperations(profile: MediaProfile): string[] {
  if (!profile.model) return [];
  return profile.modality === 'image'
    ? ['text-to-image', ...(profile.model.capabilities.includes('edit') ? ['image-edit'] : [])]
    : ['text-to-video', ...(profile.model.capabilities.includes('image_to_video') ? ['image-to-video'] : [])];
}

export function referenceDimensions(model: GatewayModel): { width: number; height: number } {
  const [a, b] = (model.sizes?.[0] ?? model.aspectRatios?.[0] ?? model.imageOptions?.aspectRatios?.[0] ?? '1:1').split(/[x:]/).map(Number);
  if (!a || !b) throw new Error('Invalid reference aspect ratio');
  return { width: Math.round(512 * a / Math.max(a, b)), height: Math.round(512 * b / Math.max(a, b)) };
}

export type VerificationFailureEvidence = { upstreamError?: { httpStatus?: number; upstreamCode?: string; upstreamMessage?: string } };
export function verificationBlockReason(evidence: VerificationFailureEvidence[]): 'funding' | 'provider-access' | undefined {
  if (evidence.some(({ upstreamError: e }) => e?.httpStatus === 402 || (e?.httpStatus === 403 && /^Key limit exceeded\b/i.test(e.upstreamMessage ?? '')))) return 'funding';
  if (evidence.some(({ upstreamError: e }) => e?.httpStatus === 403)) return 'provider-access';
  return undefined;
}

export function resolutionEdge(value: string): number {
  if (/^\d+(?:\.\d+)?k$/i.test(value)) return Number(value.slice(0, -1)) * 1024;
  return Number(value.replace(/p$/i, '')) || Infinity;
}

export function videoShapeMismatch(model: GatewayModel, width: number, height: number): string | undefined {
  if (model.sizes?.[0]) {
    const [expectedWidth, expectedHeight] = model.sizes[0].split('x').map(Number);
    return width === expectedWidth && height === expectedHeight ? undefined : 'The video does not match the verified pixel size';
  }
  const [a, b] = (model.aspectRatios?.[0] ?? '').split(':').map(Number);
  const edge = resolutionEdge(model.resolutions?.[0] ?? '');
  if (!a || !b || !Number.isFinite(edge) || Math.abs(width / height - a / b) > 0.02 || Math.abs(Math.min(width, height) - edge) > edge * 0.02) return 'The video does not match the verified resolution and aspect ratio';
  return undefined;
}

export function mediaProfile(item: MediaCatalogItem, modality: 'image' | 'video', videoShape?: string): MediaProfile {
  const profile: MediaProfile = { id: item.id, modality };
  const unsupported = (reason: string) => ({ ...profile, unsupportedReason: reason });
  if (modality === 'image') {
    const p = item.supported_parameters;
    if (!p) return unsupported('Missing image parameter metadata');
    if ((p.input_references?.min ?? 0) > 0) return unsupported('Reference-only models are outside the current official text-to-image catalog');
    const formats = p.output_format?.values ?? [];
    const format = ['png', 'jpeg', 'webp'].find(value => formats.includes(value));
    if (formats.length && !format) return unsupported('The image adapter requires raster output; this model only advertises other formats');
    const ratios = p.aspect_ratio?.values ?? [];
    const ratio = ratios.includes('1:1') ? '1:1' : ratios.find(value => /^\d+:\d+$/.test(value));
    if (ratios.length && !ratio) return unsupported('No fixed aspect ratio is available for verification');
    const resolutions = [...(p.resolution?.values ?? [])].sort((a, b) => resolutionEdge(a) - resolutionEdge(b));
    const resolution = resolutions.includes('1K') ? '1K' : resolutions[0];
    const qualities = p.quality?.values ?? [];
    const quality = ['low', 'medium', 'auto'].find(value => qualities.includes(value)) ?? qualities[0];
    const edits = item.architecture?.input_modalities?.includes('image') && (p.input_references?.max ?? 0) > 0;
    profile.model = { id: item.id, name: item.name, modality, capabilities: edits ? ['edit'] : [], imageOptions: {
      maxImages: 1, maxReferences: edits ? 1 : 0,
      aspectRatios: ratio ? [ratio] : [], resolutions: resolution ? [resolution] : [],
      qualities: quality ? [quality] : [], outputFormats: format ? [format] : []
    } };
  } else {
    const resolutions = [...(item.supported_resolutions ?? [])].sort((a, b) => resolutionEdge(a) - resolutionEdge(b));
    const durations = (item.supported_durations ?? []).filter(value => Number.isInteger(value) && value > 0);
    const ratios = item.supported_aspect_ratios ?? [];
    if (!resolutions.length || !durations.length) return unsupported('The current adapter requires explicit resolution and duration options; video editing, upscaling and avatar workflows need separate adapters');
    const resolution = resolutions[0]!;
    const ratio = ratios.includes('16:9') ? '16:9' : ratios.find(value => /^\d+:\d+$/.test(value));
    const sizes = [...(item.supported_sizes ?? [])].sort((a, b) => {
      const area = (value: string) => value.split('x').map(Number).reduce((x, y) => x * y, 1);
      return area(a) - area(b);
    });
    if (!sizes.length && !ratio) return unsupported('No fixed video size or aspect ratio is available');
    const selectedSize = sizes.find(value => {
      const [width, height] = value.split('x').map(Number);
      const [a, b] = (ratio ?? '16:9').split(':').map(Number);
      return width && height && a && b && Math.min(width, height) === resolutionEdge(resolution)
        && Math.abs(width / height - a / b) < 0.01;
    }) ?? sizes[0];
    profile.model = { id: item.id, name: item.name, modality,
      capabilities: item.supported_frame_images?.includes('first_frame') ? ['image_to_video'] : [],
      durations: [Math.min(...durations)],
      ...(selectedSize ? { sizes: [selectedSize] } : { resolutions: [resolution], aspectRatios: [ratio!] })
    };
    if (videoShape) {
      const [selectedResolution, selectedRatio, extra] = videoShape.split('@');
      if (extra || !selectedResolution || !selectedRatio || !resolutions.includes(selectedResolution) || !ratios.includes(selectedRatio)) throw new Error('The requested video shape is not declared by the model');
      delete profile.model.sizes;
      profile.model.resolutions = [selectedResolution];
      profile.model.aspectRatios = [selectedRatio];
    }
  }
  return profile;
}

// Each capability is admitted only when its own operation delivered a usable file.
export function passedProfile(model: GatewayModel, passedOperations: string[]): GatewayModel | undefined {
  const base = model.modality === 'image' ? 'text-to-image' : 'text-to-video';
  if (!passedOperations.includes(base)) return undefined;
  const reference = model.modality === 'image' ? 'image-edit' : 'image-to-video';
  const capabilities = passedOperations.includes(reference) ? [...model.capabilities] : [];
  return { ...model, capabilities, ...(model.imageOptions ? { imageOptions: { ...model.imageOptions, maxReferences: capabilities.includes('edit') ? 1 : 0 } } : {}) };
}
