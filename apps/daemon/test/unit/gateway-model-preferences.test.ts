import { expect, it } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import { migrateModelPreferences, resolveModelPreferences } from '../../src/gateway/model-preferences.js';

const text = (id: string): GatewayModel => ({ id, modality: 'text', capabilities: ['responses', 'chat', 'tools'], status: 'ready' });

it('removes retired image selections and follows the replacement for an old default', () => {
  const models: GatewayModel[] = ['gpt-image-1', 'gpt-image-2'].map(id => ({ id, modality: 'image', capabilities: ['generate'] }));
  expect(resolveModelPreferences(models, { image: 'gpt-image-1' }, { image: 'gpt-image-1' }))
    .toMatchObject({ models: [models[1]], selected: { image: 'gpt-image-2' }, manual: {}, changed: true });
  expect(resolveModelPreferences([models[0]!], { image: 'gpt-image-1' }, {}).selected).not.toHaveProperty('image');
});

it('migrates old automatic defaults and merges duplicate purposes while retaining distinct manual choices', () => {
  expect(migrateModelPreferences({ text: 'gpt-4o-mini', textProcessing: 'chat-only', subtitle: 'whisper-1', image: 'gpt-image-1' }, { text: 'gpt-6.1-sol' })).toEqual({});
  expect(migrateModelPreferences({ text: 'gpt-5.4', image: 'my-image', transcription: 'plain-asr', subtitle: 'my-timestamp-asr' }, {}))
    .toEqual({ text: 'gpt-5.4', image: 'my-image', transcription: 'my-timestamp-asr' });
});

it('follows new recommendations without overwriting manual selections or hiding temporary outages', () => {
  const models = [text('gpt-6.1-sol'), text('gpt-6.2-sol')];
  expect(resolveModelPreferences(models, { text: 'gpt-6.2-sol' }, {})).toMatchObject({ selected: { text: 'gpt-6.2-sol' }, modes: { text: 'recommended' } });
  expect(resolveModelPreferences(models, { text: 'gpt-6.2-sol' }, { text: 'gpt-6.1-sol' }))
    .toMatchObject({ selected: { text: 'gpt-6.1-sol' }, recommended: { text: 'gpt-6.2-sol' }, modes: { text: 'manual' } });
  models[0]!.status = 'temporarily_unavailable';
  expect(resolveModelPreferences(models, { text: 'gpt-6.2-sol' }, { text: 'gpt-6.1-sol' }).selected.text).toBe('gpt-6.1-sol');
});

it('removes incompatible selections and falls back to a ready recommended model', () => {
  const models: GatewayModel[] = [text('gpt-6.1-sol'), { ...text('claude-future'), vendor: 'Anthropic' },
    { id: 'chat-only', modality: 'text', capabilities: ['chat'] },
    { id: 'plain-asr', modality: 'transcription', capabilities: ['transcribe'] },
    { id: 'whisper-1', modality: 'transcription', capabilities: ['subtitle_timestamps'] }];
  expect(resolveModelPreferences(models, { text: 'gpt-6.1-sol', transcription: 'whisper-1' }, { text: 'claude-future', transcription: 'plain-asr' }))
    .toMatchObject({ selected: { text: 'gpt-6.1-sol', transcription: 'whisper-1' }, manual: {}, changed: true });
});
