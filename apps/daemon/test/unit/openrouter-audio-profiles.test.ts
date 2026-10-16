import { expect, it, vi } from 'vitest';
import { verifiedAudioProfiles } from '../../scripts/openrouter-audio-profiles.js';
import { readVerificationNetwork, verifiedCountries } from '../../scripts/openrouter-verification-network.js';

const passed = { status: 'passed', restartReplay: true, sha256: 'a'.repeat(64), verifiedCountries: ['JP'] };
const exportProfiles = (results: Record<string, unknown>[]) => verifiedAudioProfiles(results, 'report.json', '2026-10-14T00:00:00Z');

it('admits only tested voices and ASR models with subtitle timings', () => {
  const speech = { ...passed, model: 'vendor/tts', modality: 'speech', voice: 'tested', format: 'mp3' };
  const asr = { ...passed, model: 'vendor/asr', modality: 'transcription', subtitleCompatible: true, validTimings: 2 };
  const profiles = exportProfiles([speech, { ...speech, voice: 'another-tested' }, asr,
    { ...asr, model: 'vendor/json', subtitleCompatible: false }, { ...asr, model: 'vendor/warning', status: 'quality-warning' },
    { ...speech, model: 'vendor/untested', restartReplay: false }]);
  expect(profiles).toHaveLength(2);
  expect(profiles[0]).toMatchObject({ voices: ['tested', 'another-tested'], verified_countries: ['JP'] });
  expect(profiles[1]?.capabilities).toEqual(['subtitle_timestamps']);
});

it('does not fabricate regional evidence from old reports or inherit another voice country', () => {
  const speech = { ...passed, model: 'vendor/tts', modality: 'speech', voice: 'tested', format: 'mp3' };
  expect(exportProfiles([{ ...speech, verifiedCountries: undefined }])[0]?.verified_countries).toEqual([]);
  expect(exportProfiles([speech, { ...speech, voice: 'other', verifiedCountries: ['US'] }])[0]?.verified_countries).toEqual([]);
});

it('certifies PCM only for the exact repaired HeyGen model and omits the default voice sentinel', () => {
  const speech = { ...passed, model: 'heygen/heygen-voice-1-turbo', modality: 'speech', voice: 'tested', format: 'wav' };
  const profiles = exportProfiles([speech, { ...speech, model: 'heygen/untested-sibling' }, { ...speech, model: 'vendor/default', voice: '__default__', format: 'mp3' }]);
  expect(profiles).toHaveLength(2);
  expect(profiles[0]?.capabilities).toEqual(['pcm_speech']);
  expect(profiles[1]).toMatchObject({ voices: [], capabilities: ['default_voice'] });
});

it('records the real exit without retaining its IP and rejects unknown or changed exits', async () => {
  const fetcher = vi.fn(async () => new Response('ip=203.0.113.1\nloc=JP\n'));
  const before = await readVerificationNetwork(fetcher);
  expect(JSON.stringify(before)).not.toContain('203.0.113');
  expect(verifiedCountries(before, before)).toEqual(['JP']);
  expect(verifiedCountries(before, { ...before, exitHash: 'different' })).toEqual([]);
  expect(verifiedCountries(before)).toEqual([]);
  fetcher.mockImplementation(async () => new Response('loc=JP\n'));
  await expect(readVerificationNetwork(fetcher)).rejects.toThrow('known OpenRouter exit country');
});
