import { creatorPromptMaxLength, createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCreatorPresetRegistry } from '../../src/creator/presets/catalog.js';
import { canonicalJson, sha256, validateCreatorPresets } from '../../src/creator/presets/compiler.js';
import { getCreatorPresetModuleDefinition } from '../../src/creator/presets/module-schemas.js';
import { mergeCreatorPresetState } from '../../src/creator/presets/requirements.js';
import type { CreatorPresetRegistry } from '../../src/creator/presets/types.js';
import { createDefaultCreatorTemplateRegistry } from '../../src/creator/templates/registry.js';

const sourceRoot = fileURLToPath(new URL('../../../../template/', import.meta.url));
const baseline = JSON.parse(readFileSync(
  new URL('../fixtures/creator-prompt-localization.json', import.meta.url), 'utf8'
)) as Array<{
  module: 'image-generation' | 'video-generation';
  id: string;
  version: number;
  zhSha256: string;
  enSha256: string;
  originalLanguage?: string;
  sourceUrl?: string;
  adapted?: boolean;
  sharedOriginal: boolean;
}>;
let registry: CreatorPresetRegistry;

beforeAll(async () => {
  const catalog = await validateCreatorPresets({ sourceRoot });
  registry = createCreatorPresetRegistry({ catalog, catalogHash: sha256(canonicalJson(catalog)) });
});

describe('official Creator prompt localization', () => {
  it('preserves Chinese prompts and the verified English source text', () => {
    const zh = registry.listPublished('zh-CN');
    const en = registry.listPublished('en-US');
    for (const row of baseline) {
      const chinese = zh.find(preset => preset.id === row.id && preset.module === row.module);
      const english = en.find(preset => preset.id === row.id && preset.module === row.module);
      expect(sha256(chinese!.prompt!), row.id).toBe(row.zhSha256);
      expect(sha256(english!.prompt!), row.id).toBe(row.enSha256);
    }
    expect(baseline.filter(row => row.originalLanguage === 'en')).toHaveLength(30);
  });

  it('does not reuse Chinese prose in the English catalog', () => {
    const sharedOriginals = new Set(baseline.filter(row => row.sharedOriginal).map(row => row.id));
    expect([...sharedOriginals].sort()).toEqual([
      'vr-headset-exploded-interface-diagram', 'weekly-outfit-infographic'
    ]);
    const zh = registry.listPublished('zh-CN');
    for (const english of registry.listPublished('en-US')) {
      if (!english.prompt) continue;
      const chinese = zh.find(preset => preset.id === english.id && preset.module === english.module);
      if (sharedOriginals.has(english.id)) {
        expect(english.prompt).toBe(chinese?.prompt);
        expect(() => JSON.parse(english.prompt!)).not.toThrow();
      } else {
        expect(english.prompt, english.id).not.toBe(chinese?.prompt);
      }
    }
  });

  it('passes the exact localized prompt into valid Runtime state, including long originals', () => {
    const templates = createDefaultCreatorTemplateRegistry();
    const services = createDefaultCreatorServicesConfig();
    let longOriginals = 0;
    for (const locale of ['zh-CN', 'en-US'] as const) {
      for (const summary of registry.listPublished(locale)) {
        if (summary.prompt === null) continue;
        const preset = registry.get(summary);
        const state = mergeCreatorPresetState({
          definition: getCreatorPresetModuleDefinition(preset.module),
          defaults: preset.defaults,
          defaultsByLocale: preset.defaultsByLocale,
          locale,
          requirement: preset.requirements,
          services
        });
        expect(state.prompt, summary.id).toBe(summary.prompt);
        const parsed = templates.get(preset.runtimeTemplate.id, preset.runtimeTemplate.version)
          .inputSchema.parse(state) as { prompt: string };
        expect(parsed.prompt, summary.id).toBe(summary.prompt);
        if (locale === 'en-US' && summary.prompt.length > 4000) longOriginals += 1;
      }
    }
    expect(longOriginals).toBeGreaterThanOrEqual(3);
  });

  it('uses the same bounded length for preset and generation Runtime validation', () => {
    const templates = createDefaultCreatorTemplateRegistry();
    for (const module of ['image-generation', 'video-generation'] as const) {
      const definition = getCreatorPresetModuleDefinition(module);
      const template = templates.get(module);
      for (const schema of [definition.defaultsSchema, definition.localeDefaultsSchema, template.inputSchema]) {
        expect(schema.safeParse({ prompt: 'a'.repeat(creatorPromptMaxLength) }).success).toBe(true);
        expect(schema.safeParse({ prompt: 'a'.repeat(creatorPromptMaxLength + 1) }).success).toBe(false);
      }
    }
  });
});
