import { z } from 'zod/v3';
import type { GatewayModel } from '@opencreator/protocol';

const strings = z.array(z.string().min(1));
const descriptor = z.object({
  type: z.string(), values: strings.optional(), min: z.number().optional(), max: z.number().optional()
});
const parameters = z.record(descriptor);
export const openRouterModelSchema = z.object({
  id: z.string().min(1),
  architecture: z.object({ input_modalities: strings.optional(), output_modalities: strings.optional() }).optional(),
  supported_voices: strings.nullish(),
  supported_parameters: z.union([strings, parameters]).optional()
});
export const imageModelsSchema = z.object({ data: z.array(z.object({
  id: z.string().min(1), supported_parameters: parameters
})) });
export const videoModelsSchema = z.object({ data: z.array(z.object({
  id: z.string().min(1), supported_sizes: strings.nullish(),
  supported_durations: z.array(z.number().int().positive()).nullish(),
  supported_resolutions: strings.nullish(), supported_aspect_ratios: strings.nullish(),
  supported_frame_images: strings.nullish()
})) });

type CatalogModel = z.infer<typeof openRouterModelSchema>;
type ImageModel = z.infer<typeof imageModelsSchema>['data'][number];
type VideoModel = z.infer<typeof videoModelsSchema>['data'][number];

export function officialCatalogModels(
  candidates: GatewayModel[], catalog: CatalogModel[], images: ImageModel[] = [], videos: VideoModel[] = []
): GatewayModel[] {
  const directory = new Map(catalog.map(model => [model.id, model]));
  const imageProfiles = new Map(images.map(model => [model.id, model]));
  const videoProfiles = new Map(videos.map(model => [model.id, model]));
  return candidates.flatMap(candidate => {
    const entry = directory.get(candidate.id);
    if (!entry || (entry.architecture?.output_modalities && !entry.architecture.output_modalities.includes(candidate.modality))) return [];
    const model = structuredClone(candidate);
    const setCapability = (name: string, enabled: boolean) => {
      model.capabilities = model.capabilities.filter(value => value !== name);
      if (enabled) model.capabilities.push(name);
    };
    if (model.modality === 'speech' && entry.supported_voices?.length) {
      model.voices = [...new Set(entry.supported_voices)];
      setCapability('default_voice', false);
    }
    if (model.modality === 'image') {
      const profile = imageProfiles.get(model.id);
      const options = profile?.supported_parameters
        ?? (entry.supported_parameters && !Array.isArray(entry.supported_parameters) ? entry.supported_parameters : undefined);
      if (options) {
        const values = (name: string) => options[name]?.type === 'enum' ? options[name]?.values : undefined;
        const maximum = (name: string, fallback: number, cap: number) => {
          const value = options[name]?.max;
          return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? Math.min(value, cap) : fallback;
        };
        model.imageOptions = {
          aspectRatios: values('aspect_ratio'), resolutions: values('resolution'),
          qualities: values('quality'), outputFormats: values('output_format'),
          maxImages: Math.max(1, maximum('n', 1, 10)), maxReferences: maximum('input_references', 0, 16)
        };
        setCapability('edit', model.imageOptions.maxReferences > 0);
      }
    }
    if (model.modality === 'video') {
      const profile = videoProfiles.get(model.id);
      if (profile) {
        model.sizes = profile.supported_sizes?.filter(value => /^\d+x\d+$/.test(value)) ?? [];
        model.durations = profile.supported_durations ?? [];
        model.resolutions = profile.supported_resolutions ?? [];
        model.aspectRatios = profile.supported_aspect_ratios ?? [];
        setCapability('image_to_video', profile.supported_frame_images?.includes('first_frame') === true);
      }
    }
    return [model];
  });
}
