import { describe, expect, it } from 'vitest';
import { familyRepresentatives, mediaFamily, mediaProfile, passedProfile, referenceDimensions, videoShapeMismatch, verificationBlockReason } from '../../scripts/openrouter-media-profiles.js';

describe('OpenRouter media verification profiles', () => {
  it('omits undeclared options and does not mistake metadata for edit acceptance', () => {
    const { model } = mediaProfile({ id: 'vendor/image', architecture: { input_modalities: ['text', 'image'] }, supported_parameters: { aspect_ratio: { values: ['1:1'] }, input_references: { max: 5 } } }, 'image');
    expect(model?.imageOptions).toMatchObject({ outputFormats: [], resolutions: [], qualities: [], maxReferences: 1 });
    expect(passedProfile(model!, ['text-to-image'])).toMatchObject({ capabilities: [], imageOptions: { maxReferences: 0 } });
    expect(passedProfile(model!, ['text-to-image', 'image-edit'])).toMatchObject({ capabilities: ['edit'], imageOptions: { maxReferences: 1 } });
  });
  it('supports JPEG-only models and selects an advertised resolution without assuming 1K', () => {
    expect(mediaProfile({ id: 'vendor/jpeg', supported_parameters: { resolution: { values: ['4K', '2K'] }, output_format: { values: ['jpeg'] } } }, 'image').model?.imageOptions).toMatchObject({ resolutions: ['2K'], outputFormats: ['jpeg'], aspectRatios: [] });
  });
  it('reports reference-only and vector-only models as unsupported', () => {
    expect(mediaProfile({ id: 'vendor/style', supported_parameters: { input_references: { min: 1 } } }, 'image').unsupportedReason).toMatch(/Reference-only/);
    expect(mediaProfile({ id: 'vendor/vector', supported_parameters: { output_format: { values: ['svg'] } } }, 'image').unsupportedReason).toMatch(/raster/);
  });
  it('chooses the minimum video duration and a matching low-resolution landscape size', () => {
    const { model } = mediaProfile({ id: 'vendor/video', supported_resolutions: ['1080p', '480p', '720p'], supported_durations: [10, 4, 8], supported_aspect_ratios: ['1:1', '16:9'], supported_sizes: ['1920x1080', '480x480', '854x480'], supported_frame_images: ['first_frame'] }, 'video');
    expect(model).toMatchObject({ durations: [4], sizes: ['854x480'], capabilities: ['image_to_video'] });
    expect(passedProfile(model!, ['text-to-video'])).toMatchObject({ capabilities: [] });
    expect(passedProfile(model!, ['image-to-video'])).toBeUndefined();
  });
  it('handles videos without pixel sizes and excludes specialized video workflows', () => {
    expect(mediaProfile({ id: 'vendor/video', supported_resolutions: ['720p'], supported_durations: [5], supported_aspect_ratios: ['16:9'] }, 'video').model).toMatchObject({ resolutions: ['720p'], aspectRatios: ['16:9'], durations: [5] });
    expect(mediaProfile({ id: 'vendor/upscale' }, 'video').unsupportedReason).toMatch(/separate adapters/);
  });
  it('selects one supported representative per family independent of catalog order', () => {
    const profiles = ['black-forest-labs/flux.2-max', 'black-forest-labs/flux-3-image', 'black-forest-labs/flux.2-klein-4b', 'alibaba/wan-2.6', 'alibaba/happyhorse-1.1', 'new-vendor/new-video'].map(id => mediaProfile({ id, supported_parameters: {}, supported_resolutions: ['480p'], supported_aspect_ratios: ['16:9'], supported_durations: [1] }, id.startsWith('black-forest-labs') ? 'image' : 'video'));
    expect(familyRepresentatives(profiles).map(p => p.id)).toEqual(['black-forest-labs/flux-3-image', 'alibaba/wan-2.6', 'alibaba/happyhorse-1.1']);
    expect(familyRepresentatives(profiles.reverse()).map(p => p.id)).toEqual(['black-forest-labs/flux-3-image', 'alibaba/wan-2.6', 'alibaba/happyhorse-1.1']);
    expect(mediaFamily(profiles[0]!)).toBeUndefined();
  });
  it('preserves the selected video proportions in first-frame verification input', () => {
    expect(referenceDimensions({ id: 'video', modality: 'video', capabilities: [], aspectRatios: ['16:9'] })).toEqual({ width: 512, height: 288 });
    expect(referenceDimensions({ id: 'video', modality: 'video', capabilities: [], sizes: ['720x1280'] })).toEqual({ width: 288, height: 512 });
  });
  it('allows a targeted normalized video profile only when the catalog declares it', () => {
    const item = { id: 'video/model', supported_resolutions: ['480p', '720p'], supported_aspect_ratios: ['16:9'], supported_sizes: ['1280x720'], supported_durations: [4] };
    const { model } = mediaProfile(item, 'video', '720p@16:9');
    expect(model).toMatchObject({ resolutions: ['720p'], aspectRatios: ['16:9'] });
    expect(model?.sizes).toBeUndefined();
    expect(() => mediaProfile(item, 'video', '1080p@16:9')).toThrow(/not declared/);
    expect(() => mediaProfile(item, 'video', '720p@9:16')).toThrow(/not declared/);
  });
  it('separates funding and provider-access blocks from model failures', () => {
    expect(verificationBlockReason([{ upstreamError: { httpStatus: 402 } }])).toBe('funding');
    expect(verificationBlockReason([{ upstreamError: { httpStatus: 403, upstreamMessage: 'Key limit exceeded' } }])).toBe('funding');
    expect(verificationBlockReason([{ upstreamError: { httpStatus: 403, upstreamMessage: 'The request is prohibited' } }])).toBe('provider-access');
    expect(verificationBlockReason([{ upstreamError: { httpStatus: 400 } }])).toBeUndefined();
  });
  it('does not mistake a different resolution or a square first-frame output for the requested profile', () => {
    const model = { id: 'video/model', modality: 'video' as const, capabilities: [], resolutions: ['720p'], aspectRatios: ['16:9'] };
    expect(videoShapeMismatch(model, 1280, 720)).toBeUndefined();
    expect(videoShapeMismatch(model, 1920, 1080)).toMatch(/resolution/);
    expect(videoShapeMismatch(model, 720, 720)).toMatch(/aspect ratio/);
    expect(videoShapeMismatch({ ...model, resolutions: ['480p'] }, 848, 480)).toBeUndefined();
    expect(videoShapeMismatch({ ...model, sizes: ['854x480'] }, 864, 496)).toMatch(/pixel size/);
  });
});
