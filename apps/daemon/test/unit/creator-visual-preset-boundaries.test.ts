import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDefaultCreatorServicesConfig, videoGenerationModelIds } from '@opencreator/protocol';
import { describe, expect, it } from 'vitest';
import { createCreatorPresetRegistry } from '../../src/creator/presets/catalog.js';
import { canonicalJson, sha256, validateCreatorPresets } from '../../src/creator/presets/compiler.js';
import { getCreatorPresetModuleDefinition } from '../../src/creator/presets/module-schemas.js';
import { createCreatorPresetTags } from '../../src/creator/presets/presentation.js';
import { mergeCreatorPresetState } from '../../src/creator/presets/requirements.js';
import { creatorPresetSourceManifestSchema } from '../../src/creator/presets/schema.js';
import { officialPresetRoot } from '../helpers/creator-preset-fixtures.js';

const visualPresets = [
  { module: 'image-generation', id: 'botanical-plate', capabilities: ['text-to-image'] },
  { module: 'image-generation', id: 'botanical-soda', capabilities: ['text-to-image'] },
  { module: 'image-generation', id: 'coastal-poster', capabilities: ['text-to-image'] },
  { module: 'image-generation', id: 'pear-tart-storyboard', capabilities: ['text-to-image'] },
  { module: 'image-generation', id: 'faithful-vintage-portrait-restoration', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'food-splash-freeze-frame', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'handwritten-photo-annotations', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'inplace-landmark-travel-sticker', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'object-word-doodle-overlay', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'polaroid-clay-travel-portrait', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'vintage-city-travel-collage-portrait', capabilities: ['reference-image', 'image-edit'] },
  { module: 'image-generation', id: 'watercolor-travel-postcard', capabilities: ['reference-image', 'image-edit'] },
  { module: 'video-generation', id: 'khachapuri-overhead-cooking', capabilities: ['text-to-video'] },
  { module: 'video-generation', id: 'sketch-to-real-stop-motion-cooking', capabilities: ['text-to-video'] },
  { module: 'video-generation', id: 'wildflower-seasons-macro-timelapse', capabilities: ['text-to-video'] }
] as const;

const functionalShortcuts = [
  ['video-download', 'audio-download'],
  ['video-download', 'highest-quality-video'],
  ['video-translation', 'bilibili-bilingual'],
  ['video-translation', 'bilingual-interview'],
  ['video-translation', 'vertical-knowledge'],
  ['video-translation', 'youtube-dubbed']
] as const;

function readPreset(module: string, id: string) {
  return creatorPresetSourceManifestSchema.parse(JSON.parse(readFileSync(
    join(officialPresetRoot, module, id, '1', 'template.json'),
    'utf8'
  )));
}

describe('visual preset modality boundaries', () => {
  it.each(visualPresets)('$id declares capabilities without selecting a provider', preset => {
    const manifest = readPreset(preset.module, preset.id);
    const definition = getCreatorPresetModuleDefinition(preset.module);
    expect(manifest.runtimeTemplate).toEqual(definition.runtimeTemplate);
    expect(manifest.requirements).toEqual({
      service: preset.module === 'video-generation' ? 'video' : 'image',
      capabilities: [...preset.capabilities]
    });
    expect(() => definition.validateRequirement(manifest.requirements)).not.toThrow();
    expect(definition.defaultsSchema.safeParse(manifest.defaults).success).toBe(true);
    expect(manifest.status).toBe('draft');
    expect(manifest.featured).toBe(false);
    expect(manifest.author?.name).toBeTruthy();
    expect(manifest.author?.url).toMatch(/^https:\/\//);
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const defaults = manifest.defaultsByLocale?.[locale];
      expect(typeof defaults?.prompt).toBe('string');
      expect(String(defaults?.prompt).trim().length).toBeGreaterThan(100);
      expect(definition.localeDefaultsSchema.safeParse(defaults).success).toBe(true);
    }
    expect(createCreatorPresetTags(manifest, 'en-US').join(' ')).not.toMatch(/\p{Script=Han}/u);
  });

  it.each(visualPresets)('$id preserves configured providers, models and transport settings', preset => {
    const manifest = readPreset(preset.module, preset.id);
    const definition = getCreatorPresetModuleDefinition(preset.module);
    for (const profile of ['native', 'openai', 'gemini', 'jimeng'] as const) {
      const services = createDefaultCreatorServicesConfig();
      services.proxy = 'http://user-proxy.invalid:7897';
      services.image.provider = profile === 'native' ? 'codex-native' : profile;
      services.image.openai.baseUrl = 'https://user-image.invalid/v1';
      services.image.openai.model = 'user-image-model';
      services.image.openai.apiKey = 'private-image-key';
      services.image.gemini.baseUrl = 'https://user-gemini.invalid/v1beta';
      services.image.gemini.model = 'user-gemini-model';
      services.image.gemini.apiKey = 'private-gemini-key';
      services.image.jimeng.baseUrl = 'https://user-jimeng.invalid/v3';
      services.image.jimeng.model = 'user-jimeng-model';
      services.image.jimeng.apiKey = 'private-jimeng-key';
      services.video.provider = profile === 'native' ? 'seedance' : profile === 'openai' ? 'kling' : 'veo';
      services.video.seedance.model = videoGenerationModelIds.seedance[1];
      services.video.seedance.baseUrl = 'https://user-video.invalid/v3';
      services.video.seedance.apiKey = 'private-video-key';
      services.video.kling.model = videoGenerationModelIds.kling[0];
      services.video.kling.accessKey = 'private-kling-key';
      services.video.kling.secretKey = 'private-kling-secret';
      services.video.veo.model = videoGenerationModelIds.veo[0];
      services.video.veo.apiKey = 'private-veo-key';
      const configuredServices = structuredClone(services);
      for (const locale of ['zh-CN', 'en-US'] as const) {
        const state = mergeCreatorPresetState({
          definition,
          defaults: manifest.defaults,
          defaultsByLocale: manifest.defaultsByLocale,
          locale,
          requirement: manifest.requirements,
          services
        });
        const localized = definition.localeDefaultsSchema.parse(manifest.defaultsByLocale?.[locale]);
        const expectedDefaults = { ...definition.defaultsSchema.parse(manifest.defaults), ...localized };
        if (preset.module === 'image-generation') {
          expect(state).toEqual({ ...expectedDefaults, provider: services.image.provider });
        } else {
          expect(state).toEqual({
            ...expectedDefaults,
            provider: services.video.provider,
            model: services.video[services.video.provider].model
          });
        }
        expect(services).toEqual(configuredServices);
      }
    }
  });

  it.each(['botanical-plate', 'coastal-poster'])('%s aligns prompt composition with the supported image size', id => {
    const manifest = readPreset('image-generation', id);
    expect(manifest.defaults.size).toBe('1024x1536');
    for (const locale of ['zh-CN', 'en-US'] as const) {
      expect(manifest.defaultsByLocale?.[locale]?.prompt).toContain('2:3');
      expect(manifest.defaultsByLocale?.[locale]?.prompt).not.toContain('3:4');
    }
  });

  it('keeps video presets within existing duration and size capabilities', () => {
    for (const preset of visualPresets.filter(preset => preset.module === 'video-generation')) {
      const manifest = readPreset(preset.module, preset.id);
      expect(manifest.defaults.duration).toBe(10);
      expect(manifest.defaults.size).toBe('1280x720');
      expect(manifest.previewVideo).toBe('example.mp4');
    }
  });

  it('does not restore functional shortcuts or publish unverified source examples', async () => {
    for (const [module, id] of functionalShortcuts) {
      expect(existsSync(join(officialPresetRoot, module, id))).toBe(false);
    }
    const catalog = await validateCreatorPresets({ sourceRoot: officialPresetRoot });
    const registry = createCreatorPresetRegistry({ catalog, catalogHash: sha256(canonicalJson(catalog)) });
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const identities = registry.listPublished(locale).map(preset => `${preset.module}/${preset.id}`);
      for (const preset of visualPresets) {
        expect(identities).not.toContain(`${preset.module}/${preset.id}`);
      }
    }
  });
});
