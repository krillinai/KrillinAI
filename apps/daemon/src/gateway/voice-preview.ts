import type { CreatorTtsPreviewRequest, GatewayAccountState } from '@opencreator/protocol';
import { KrillinTtsServiceError, type KrillinTtsSynthesisResult } from '../creator/krillin/tts-service.js';

export function createOfficialVoicePreviewLanguages(input: { origin: string; fetcher?: typeof fetch }) {
  return async (model: string): Promise<Record<string, string[]>> => {
    const url = new URL('/api/v1/voice-previews/languages', input.origin);
    url.search = new URLSearchParams({ model }).toString();
    const response = await (input.fetcher ?? fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new KrillinTtsServiceError('creator_tts_upstream_error', 'Voice preview languages are temporarily unavailable', 503);
    const payload = await response.json() as { voices?: Record<string, unknown> };
    if (!payload.voices || typeof payload.voices !== 'object' || Array.isArray(payload.voices)) {
      throw new KrillinTtsServiceError('creator_tts_upstream_error', 'Invalid voice preview languages', 503);
    }
    return Object.fromEntries(Object.entries(payload.voices).map(([voice, languages]) => [voice,
      Array.isArray(languages) ? [...new Set(languages.filter((language): language is string => typeof language === 'string' && /^[a-z]{2,3}$/.test(language)))] : []]));
  };
}

export function createOfficialVoicePreview(input: {
  origin: string;
  getState(): GatewayAccountState;
  fetcher?: typeof fetch;
}) {
  return async (request: CreatorTtsPreviewRequest): Promise<KrillinTtsSynthesisResult | undefined> => {
    const state = input.getState();
    if (state.source !== 'gateway') return undefined;
    if (state.authState !== 'signed_in') {
      throw new KrillinTtsServiceError('creator_tts_config_missing', 'Sign in before previewing a voice', 401);
    }
    const model = state.models.find(candidate => candidate.id === (request.model || state.selectedModels?.speech)
      && candidate.modality === 'speech');
    if (!model || !model.voices?.includes(request.voiceId)) {
      throw new KrillinTtsServiceError('VALIDATION_FAILED', 'Select a voice supported by this model', 400);
    }
    const url = new URL('/api/v1/voice-previews', input.origin);
    url.search = new URLSearchParams({ model: model.id, voice: request.voiceId, language: request.language || 'en' }).toString();
    // This public content request needs no model key, wallet admission or paid fallback.
    const response = await (input.fetcher ?? fetch)(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/mpeg')) {
      await response.body?.cancel();
      throw new KrillinTtsServiceError('creator_tts_upstream_error', 'This voice sample is temporarily unavailable', 503);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 1_000_000) throw new Error('Voice sample exceeds the size limit');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
    }
    if (!bytes) throw new KrillinTtsServiceError('creator_tts_upstream_error', 'This voice sample is empty', 503);
    const language = response.headers.get('content-language') ?? '';
    return { content: Buffer.concat(chunks), mime: 'audio/mpeg', provider: 'openai', model: model.id,
      voiceId: request.voiceId, format: 'mp3',
      ...(/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(language) ? { language } : {}) };
  };
}
