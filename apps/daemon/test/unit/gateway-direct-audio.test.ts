import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDirectTransport } from '../../src/gateway/direct-transport.js';
import { readPrivateJsonFile } from '../../src/config/private-json-file.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(contentType = 'audio/pcm;rate=44100;channels=1') {
  const root = await mkdtemp(join(tmpdir(), 'oc-audio-')); roots.push(root);
  const pcm = Buffer.from([0, 1, 0, 2]);
  const fetcher = vi.fn(async (_url: URL | RequestInfo, _options?: RequestInit) => new Response(pcm, { headers: { 'content-type': contentType, 'x-generation-id': 'gen-tts-audio-test' } }));
  const transport = createDirectTransport(root, fetcher);
  const input = { account: 'audio', key: 'private-test-key', resource: 'audio/speech', method: 'POST', body: { model: 'pcm-model', input: 'Hello', voice: 'voice', response_format: 'wav' }, contentType: 'application/json', identity: 'request', fingerprint: 'fingerprint', signal: AbortSignal.timeout(3_000), model: { id: 'pcm-model', modality: 'speech' as const, capabilities: ['pcm_speech'] } };
  return { root, pcm, fetcher, transport, input };
}

it('wraps documented PCM metadata in a playable WAV and replays without another synthesis', async () => {
  const f = await fixture();
  const response = await f.transport.request(f.input);
  const wav = Buffer.from(await response.arrayBuffer());
  expect(JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ response_format: 'pcm' });
  expect(response.headers.get('content-type')).toBe('audio/wav');
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ');
  expect(wav.readUInt16LE(22)).toBe(1); expect(wav.readUInt32LE(24)).toBe(44100);
  expect(wav.readUInt16LE(34)).toBe(16); expect(wav.readUInt32LE(40)).toBe(f.pcm.length);
  expect(wav.subarray(44)).toEqual(f.pcm);
  const id = response.headers.get('x-request-id')!;
  expect(await readPrivateJsonFile(join(f.root, `${id}.json`))).toMatchObject({ state: 'succeeded', mime: 'audio/wav', upstreamGenerationId: 'gen-tts-audio-test' });
  const replay = await createDirectTransport(f.root, f.fetcher).request(f.input);
  expect(Buffer.from(await replay.arrayBuffer())).toEqual(wav);
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it.each(['audio/pcm', 'audio/pcm;rate=44100', 'audio/pcm;rate=999999;channels=1', 'audio/pcm;rate=44100;channels=3'])('rejects unusable PCM metadata without guessing a playback rate: %s', async mime => {
  const f = await fixture(mime);
  await expect(f.transport.request(f.input)).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  await expect(createDirectTransport(f.root, f.fetcher).request(f.input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('retains real transcription generation identity and reported cost without changing the payload', async () => {
  const f = await fixture();
  const payload = { text: 'Hello', usage: { cost: 0.00015 }, segments: [{ start: 0, end: 1, text: 'Hello' }] };
  f.fetcher.mockImplementation(async () => Response.json(payload, { headers: { 'x-generation-id': 'gen-stt-audio-test' } }));
  const response = await f.transport.request({ ...f.input, resource: 'audio/transcriptions', model: { id: 'asr', modality: 'transcription', capabilities: [] }, body: { model: 'asr', input: 'fixture' } });
  expect(await response.json()).toEqual(payload);
  expect(await readPrivateJsonFile(join(f.root, `${response.headers.get('x-request-id')}.json`))).toMatchObject({ upstreamGenerationId: 'gen-stt-audio-test', reportedCostUsd: 0.00015, state: 'succeeded' });
});

it('does not mark a subtitle transcription successful when timestamps are missing', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ text: 'Hello' }));
  const input = { ...f.input, resource: 'audio/transcriptions', model: { id: 'asr', modality: 'transcription' as const, capabilities: ['subtitle_timestamps'] }, body: { model: 'asr', response_format: 'verbose_json', input_audio: { data: 'YXVkaW8=', format: 'wav' } } };
  await expect(f.transport.request(input)).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  await expect(createDirectTransport(f.root, f.fetcher).request(input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it('rejects voices outside the published catalog even without internal verification', async () => {
  const f = await fixture();
  const model = { ...f.input.model, voices: ['native'] };
  await expect(f.transport.request({ ...f.input, model })).rejects.toMatchObject({ code: 'capability_unsupported' });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it.each(['wav', 'mp3'])('uses native audio encoding for %s synthesis and previews without a gateway format flag', async response_format => {
  const f = await fixture();
  const response = await f.transport.request({ ...f.input, body: { ...f.input.body, response_format }, model: { ...f.input.model, capabilities: [], voices: ['voice'] } });
  expect(JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))).not.toHaveProperty('response_format');
  expect(response.headers.get('content-type')).toBe('audio/wav');
  expect(Buffer.from(await response.arrayBuffer()).subarray(44)).toEqual(f.pcm);
});

it('allows ordinary JSON transcription without timings even when the model can generate subtitles', async () => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ text: 'Hello' }));
  const response = await f.transport.request({ ...f.input, resource: 'audio/transcriptions', model: { id: 'asr', modality: 'transcription', capabilities: ['subtitle_timestamps'] },
    body: { model: 'asr', response_format: 'json', input_audio: { data: 'YXVkaW8=', format: 'wav' } } });
  expect(await response.json()).toEqual({ text: 'Hello' });
});

it.each(['json', 'multipart'])('requires actual timings for a verbose %s transcription independently of catalog flags', async encoding => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ text: 'Hello' }));
  let body: unknown = { model: 'asr', response_format: 'verbose_json', input_audio: { data: 'YXVkaW8=', format: 'wav' } };
  let contentType = 'application/json';
  if (encoding === 'multipart') {
    const form = new FormData(); form.set('model', 'asr'); form.set('response_format', 'verbose_json');
    form.set('file', new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav');
    const request = new Request('http://localhost', { method: 'POST', body: form });
    body = Buffer.from(await request.arrayBuffer()); contentType = request.headers.get('content-type')!;
  }
  const input = { ...f.input, resource: 'audio/transcriptions', model: { id: 'asr', modality: 'transcription' as const, capabilities: [] }, body, contentType };
  await expect(f.transport.request(input)).rejects.toMatchObject({ code: 'invalid_gateway_response' });
  await expect(createDirectTransport(f.root, f.fetcher).request(input)).rejects.toMatchObject({ code: 'request_outcome_unknown' });
  expect(f.fetcher).toHaveBeenCalledOnce();
});

it.each(['speech', 'transcriptions'])('does not record a successful audio/%s result for an HTTP 200 error body', async operation => {
  const f = await fixture();
  f.fetcher.mockImplementation(async () => Response.json({ error: { code: 403, message: 'Model unavailable in this country; private-test-key' } }));
  const onModelFailure = vi.fn(async () => undefined);
  const model = { id: 'model', modality: operation === 'speech' ? 'speech' as const : 'transcription' as const, capabilities: [] };
  await expect(f.transport.request({ ...f.input, resource: `audio/${operation}`, model, onModelFailure })).rejects.toMatchObject({ status: 403 });
  expect(onModelFailure).toHaveBeenCalledWith('model', model.modality, expect.objectContaining({ upstreamCode: '403' }));
  expect(f.fetcher).toHaveBeenCalledOnce();
});
