import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileCreatorPresets, validateCreatorPresets } from '../../src/creator/presets/compiler.js';
import { loadCreatorPresetCatalog } from '../../src/creator/presets/catalog.js';
import { getCreatorPresetModuleDefinition } from '../../src/creator/presets/module-schemas.js';
import { mergeCreatorPresetState } from '../../src/creator/presets/requirements.js';
import type { CreatorPresetCatalog, CreatorPresetRegistry } from '../../src/creator/presets/types.js';
import { createDefaultCreatorTemplateRegistry } from '../../src/creator/templates/registry.js';
import { copyOfficialPreset } from '../helpers/creator-preset-fixtures.js';

const ref = { module: 'cover-generator', id: 'images-go-hard-thumbnail', version: 1 } as const;
let temporaryRoot = '';
let catalog: CreatorPresetCatalog;
let registry: CreatorPresetRegistry;
const templates = createDefaultCreatorTemplateRegistry();

beforeAll(async () => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'images-go-hard-preset-'));
  const sourceRoot = join(temporaryRoot, 'template');
  const outputRoot = join(temporaryRoot, 'output');
  copyOfficialPreset({ sourceRoot, module: ref.module, sourceId: ref.id });
  catalog = await validateCreatorPresets({ sourceRoot });
  await compileCreatorPresets({ sourceRoot, outputRoot });
  registry = await loadCreatorPresetCatalog({ root: outputRoot, templates });
});

afterAll(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
});

describe('Images Go Hard thumbnail preset', () => {
  it('publishes a featured cover preset with attributed local reference images', () => {
    expect(catalog.presets).toHaveLength(1);
    const preset = registry.get(ref);
    expect(preset.runtimeTemplate).toEqual({ id: 'cover', version: 2 });
    expect(preset.author).toMatchObject({
      name: '@Theoretically Media',
      url: 'https://x.com/TheoMediaAI/status/2097817049472934162#reversed-0'
    });
    expect(preset.cover).toMatchObject({ width: 1280, height: 720, mime: 'image/jpeg' });
    expect(preset.preview).toMatchObject({ width: 900, height: 507, mime: 'image/jpeg' });
    for (const locale of ['zh-CN', 'en-US'] as const) {
      const [summary] = registry.listPublished(locale);
      expect(summary).toMatchObject({ ...ref, featured: true });
      expect(summary?.previewUrl).toMatch(/^\/creator-presets\/[a-f0-9]{64}\.jpg$/);
      expect(summary?.previewUrl).not.toBe(summary?.coverUrl);
    }
  });

  it('packages the attributed author avatar and maps it to a local URL in both locales', () => {
    const preset = registry.get(ref);
    const avatar = preset.author?.avatar;
    expect(avatar).toMatchObject({
      source: 'cover-generator/images-go-hard-thumbnail/1/author-avatar.jpg',
      width: 400,
      height: 400,
      mime: 'image/jpeg'
    });
    for (const locale of ['zh-CN', 'en-US'] as const) {
      expect(registry.listPublished(locale)[0]?.author).toEqual({
        name: '@Theoretically Media',
        url: 'https://x.com/TheoMediaAI/status/2097817049472934162#reversed-0',
        avatarUrl: `/creator-presets/${avatar?.sha256}.jpg`
      });
    }
  });

  it.each(['zh-CN', 'en-US'] as const)('creates valid %s cover state while preserving the English headline and three-line layout', locale => {
    const preset = registry.get(ref);
    const merged = mergeCreatorPresetState({
      definition: getCreatorPresetModuleDefinition(ref.module),
      defaults: preset.defaults,
      defaultsByLocale: preset.defaultsByLocale,
      locale,
      services: createDefaultCreatorServicesConfig()
    });
    const state = templates.get('cover', 2).inputSchema.parse(merged);
    expect(state).toMatchObject({
      sourceType: 'prompt',
      coverStyle: 'custom',
      coverTextLanguage: 'en-US',
      coverHeadline: 'images go hard',
      coverSubheadline: '',
      ratio: '16:9',
      quality: 'high',
      candidateCount: 2
    });
    expect(merged.customStylePrompt).toContain(locale === 'zh-CN' ? '三行' : 'three lines');
    expect(merged.prompt).toContain(locale === 'zh-CN' ? '晚霞' : 'sunset');
    expect(merged).not.toHaveProperty('referenceImageArtifactId');
    expect(registry.listPublished(locale)[0]?.prompt).toBe(merged.prompt);
  });
});
