import { gatewayDefaultVoiceId } from '@opencreator/protocol';
import { DIRECT_MEDIA_ADAPTER_VERSION } from '../src/gateway/direct-transport.js';

export function verifiedAudioProfiles(results: Record<string, unknown>[], evidence: string, verifiedAt: string) {
  const profiles = new Map<string, { id: string; modality: string; capabilities: string[]; voices: string[];
    adapter_version: number; verified_at: string; evidence: string; verified_countries: string[] }>();
  for (const result of results) {
    if (result.status !== 'passed' || result.restartReplay !== true || typeof result.model !== 'string'
      || typeof result.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(result.sha256)) continue;
    const modality = result.modality;
    const speech = modality === 'speech';
    if (!speech && !(modality === 'transcription' && result.subtitleCompatible === true && Number(result.validTimings) > 0)) continue;
    if (speech && (typeof result.voice !== 'string' || !result.voice || (result.format !== 'mp3'
      && !(result.format === 'wav' && result.model === 'heygen/heygen-voice-1-turbo')))) continue;
    const countries = Array.isArray(result.verifiedCountries) ? result.verifiedCountries.filter((country): country is string => typeof country === 'string' && /^[A-Z]{2}$/.test(country)) : [];
    const key = `${modality}:${result.model}`;
    const existing = profiles.get(key);
    const voice = speech ? result.voice as string : undefined;
    if (existing) {
      if (voice && voice !== gatewayDefaultVoiceId && !existing.voices.includes(voice)) existing.voices.push(voice);
      existing.verified_countries = existing.verified_countries.filter(country => countries.includes(country));
      continue;
    }
    profiles.set(key, { id: result.model, modality: modality as string, capabilities: speech
      ? [...(voice === gatewayDefaultVoiceId ? ['default_voice'] : []), ...(result.format === 'wav' ? ['pcm_speech'] : [])]
      : ['subtitle_timestamps'], voices: voice && voice !== gatewayDefaultVoiceId ? [voice] : [],
      adapter_version: DIRECT_MEDIA_ADAPTER_VERSION, verified_at: verifiedAt, evidence, verified_countries: countries });
  }
  return [...profiles.values()];
}
