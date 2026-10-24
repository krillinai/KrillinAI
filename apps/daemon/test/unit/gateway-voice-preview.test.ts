import { describe, expect, it, vi } from 'vitest';
import { createOfficialVoicePreview, createOfficialVoicePreviewLanguages } from '../../src/gateway/voice-preview.js';
import { createKrillinTtsService } from '../../src/creator/krillin/tts-service.js';

const request = { provider: 'openai' as const, model: 'grok-tts', voiceId: 'eve', language: 'zh-TW' };
function state() {
  return { source: 'gateway', authState: 'signed_in', activationState: 'inactive', selectedModels: { speech: 'grok-tts' },
    models: [{ id: 'grok-tts', modality: 'speech', status: 'ready', capabilities: [], voices: ['eve'] }] } as never;
}

describe('stored official voice previews', () => {
  it('reads per-voice sample languages from the database catalog without credentials or synthesis', async () => {
    const fetcher = vi.fn(async () => Response.json({ voices: { eve: ['en', 'zh', 'en'], rex: ['en'], empty: [] } }));
    const load = createOfficialVoicePreviewLanguages({ origin: 'https://gateway.example', fetcher });
    expect(await load('grok-tts')).toEqual({ eve: ['en', 'zh'], rex: ['en'], empty: [] });
    const [target, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.pathname).toBe('/api/v1/voice-previews/languages');
    expect(target.searchParams.get('model')).toBe('grok-tts');
    expect(init.headers).toBeUndefined();
  });

  it('loads public audio in the selected language without model credentials or wallet admission', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([73, 68, 51]), { headers: { 'content-type': 'audio/mpeg', 'content-language': 'en' } }));
    const read = vi.fn();
    const executeSynthesis = vi.fn();
    const preview = createOfficialVoicePreview({ origin: 'https://gateway.example', getState: state, fetcher });
    const service = createKrillinTtsService({ resourceRoot: '/unused', workRoot: '/unused', configStore: { read }, executeSynthesis, officialPreview: preview });
    expect(await service.preview(request)).toMatchObject({ provider: 'openai', model: 'grok-tts', voiceId: 'eve', format: 'mp3', language: 'en' });
    const [target, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.pathname).toBe('/api/v1/voice-previews');
    expect(target.searchParams.get('language')).toBe('zh-TW');
    expect(init.headers).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(executeSynthesis).not.toHaveBeenCalled();
  });

  it('never falls back to paid synthesis when a sample is missing', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    const executeSynthesis = vi.fn();
    const read = vi.fn();
    const service = createKrillinTtsService({ resourceRoot: '/unused', workRoot: '/unused', configStore: { read }, executeSynthesis,
      officialPreview: createOfficialVoicePreview({ origin: 'https://gateway.example', getState: state, fetcher }) });
    await expect(service.preview(request)).rejects.toMatchObject({ code: 'creator_tts_upstream_error' });
    expect(read).not.toHaveBeenCalled();
    expect(executeSynthesis).not.toHaveBeenCalled();
  });

  it('rejects an unknown voice before fetching and leaves personal providers alone', async () => {
    const fetcher = vi.fn();
    const preview = createOfficialVoicePreview({ origin: 'https://gateway.example', getState: state, fetcher });
    await expect(preview({ ...request, voiceId: 'unknown' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetcher).not.toHaveBeenCalled();
    const manual = createOfficialVoicePreview({ origin: 'https://gateway.example', getState: () => ({ source: 'manual' }) as never, fetcher });
    expect(await manual(request)).toBeUndefined();
  });
});
