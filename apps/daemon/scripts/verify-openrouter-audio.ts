import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createDefaultCreatorServicesConfig, type GatewayModel } from '@opencreator/protocol';
import { createGatewayCreatorSource } from '../src/gateway/creator-service-source.js';
import { createDirectTransport } from '../src/gateway/direct-transport.js';
import { createOfficialFetch } from '../src/gateway/official-fetch.js';
import { createKrillinTtsService } from '../src/creator/krillin/tts-service.js';
import { readVerificationNetwork, verifiedCountries } from './openrouter-verification-network.js';
import { verifiedAudioProfiles } from './openrouter-audio-profiles.js';
import { stringify } from '@iarna/toml';

const args = process.argv.slice(2);
const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const outputRoot = resolve(args.find(arg => !arg.startsWith('--')) ?? '.state/audio-verification');
const planOnly = args.includes('--plan');
const budgetUsd = Number(option('budget') ?? 0.25);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 1) throw new Error('Audio verification budget must be within USD 1');
const keyLimitUsd = Number(option('key-limit') ?? budgetUsd);
if (!Number.isFinite(keyLimitUsd) || keyLimitUsd < budgetUsd || keyLimitUsd > 1) throw new Error('Invalid audio test key limit');
await mkdir(outputRoot, { recursive: true, mode: 0o700 });
if (!planOnly && await access(join(outputRoot, 'report.json')).then(() => true, () => false)) throw new Error('Use a fresh report directory; never automatically resubmit a paid run');
const upstream = createOfficialFetch();
const exec = promisify(execFile);
type CatalogItem = { id: string; architecture: { output_modalities: string[] }; supported_voices?: string[] | null };
const catalog = JSON.parse(await readFile(option('catalog')!, 'utf8')) as { data: CatalogItem[] };
const representatives = [
  'hexgrad/kokoro-82m', 'mistralai/voxtral-mini-tts-2603', 'elevenlabs/eleven-flash-v2.5',
  'fish-audio/s2.1-pro', 'microsoft/mai-voice-2.1-flash', 'bytedance-seed/seed-audio-1-0',
  'google/gemini-3.8-flash-lite-tts', 'qwen/qwen-audio-3.0-tts-flash', 'x-ai/grok-voice-tts-1.0',
  'deepgram/aura-2', 'deepgram/flux-tts', 'minimax/speech-2.8-turbo',
  'heygen/heygen-voice-1-turbo', 'canopylabs/orpheus-3b-0.1-ft', 'sesame/csm-1b',
  'openai/whisper-large-v3-turbo', 'openai/gpt-4o-mini-transcribe', 'mistralai/voxtral-mini-transcribe',
  'elevenlabs/scribe-v2', 'deepgram/nova-3', 'qwen/qwen3-asr-0.6b',
  'nvidia/parakeet-tdt-0.6b-v3', 'nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b',
  'google/chirp-3', 'google/gemini-3.5-transcribe', 'microsoft/mai-transcribe-2',
  'assemblyai/universal-3-5-pro', 'fish-audio/transcribe-1', 'meta/muse-voice-transcribe-1.0', 'x-ai/grok-stt-1.0'
];
const requestedModels = args.filter(arg => arg.startsWith('--model=')).map(arg => arg.slice('--model='.length));
const profiles = representatives.filter(id => !requestedModels.length || requestedModels.includes(id)).map<GatewayModel>(id => {
  const item = catalog.data.find(candidate => candidate.id === id);
  if (!item) throw new Error(`Representative absent from current catalog: ${id}`);
  const speech = item.architecture.output_modalities.includes('speech');
  assert(speech || item.architecture.output_modalities.includes('transcription'));
  const voices = item.supported_voices ?? [];
  if (option('voice') && !voices.includes(option('voice')!)) throw new Error('Voice absent from the current model catalog');
  const preferred = option('voice') ?? voices.find(voice => ['af_heart', 'en_paul_neutral'].includes(voice))
    ?? voices.find(voice => voice.startsWith('en-US-')) ?? voices[0];
  return { id, modality: speech ? 'speech' : 'transcription', capabilities: [...(speech && !voices.length ? ['default_voice'] : []), ...(id === 'heygen/heygen-voice-1-turbo' ? ['pcm_speech'] : [])], ...(preferred ? { voices: [preferred] } : {}) };
}).filter(profile => !option('modality') || profile.modality === option('modality'));
if (!profiles.length) throw new Error('No models selected');
const responseFormat = option('asr-format') ?? 'verbose_json';
if (!['json', 'verbose_json'].includes(responseFormat)) throw new Error('Invalid ASR response format');
const schema = JSON.parse(await readFile(option('schema')!, 'utf8'));
const contract = Fastify({ ajv: { customOptions: { strict: false, coerceTypes: false, removeAdditional: false, useDefaults: false } } });
const schemas = schema.components.schemas;
const speechFields = ['model', 'input', 'voice', 'response_format'];
const multipart = schema.paths['/audio/transcriptions'].post.requestBody.content['multipart/form-data'].schema;
contract.addSchema({ $id: 'openrouter-audio-contract', components: { schemas: {
  SpeechInput: schemas.SpeechInput, SpeechTurn: schemas.SpeechTurn,
  Speech: { ...schemas.SpeechRequest, additionalProperties: false, properties: Object.fromEntries(speechFields.map(field => [field, schemas.SpeechRequest.properties[field]])) },
  Multipart: { ...multipart, additionalProperties: false }
} } });
contract.post('/speech', { schema: { body: { $ref: 'openrouter-audio-contract#/components/schemas/Speech' } } }, async () => ({ valid: true }));
contract.post('/transcription', { schema: { body: { $ref: 'openrouter-audio-contract#/components/schemas/Multipart' } } }, async () => ({ valid: true }));
let contractChecks = 0;
async function validateRequest(resource: string, body: BodyInit, contentType: string) {
  let payload: Record<string, unknown>;
  if (resource === 'speech') payload = JSON.parse(String(body));
  else {
    const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body }).formData();
    payload = {};
    for (const [name, value] of form.entries()) {
      if (name.endsWith('[]')) {
        const values = (payload[name] ??= []) as unknown[];
        values.push(value);
      } else payload[name] = typeof value === 'string' ? value : value.name;
    }
    assert(form.get('file') instanceof Blob && (form.get('file') as Blob).size > 0);
  }
  const checked = await contract.inject({ method: 'POST', url: `/${resource}`, payload });
  assert.equal(checked.statusCode, 200, `Official schema rejected emitted request: ${checked.body}`);
  contractChecks++;
}
const text = option('text') ?? 'The red cup is on the table. Today is a sunny day.';
const language = option('language') ?? 'en';
for (const profile of profiles) {
  const response = await upstream(`https://openrouter.ai/${profile.id}/llms.txt`, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Model API documentation unavailable: ${profile.id}`);
  const docs = await response.text();
  const endpoint = profile.modality === 'speech' ? '/audio/speech' : '/audio/transcriptions';
  if (!docs.includes(`POST https://openrouter.ai/api/v1${endpoint}`)) throw new Error(`Model documentation does not confirm the selected endpoint: ${profile.id}`);
  await writeFile(join(outputRoot, `${profile.id.replace('/', '__')}.md`), docs, { mode: 0o600 });
  if (profile.modality === 'speech') await validateRequest('speech', JSON.stringify({ model: profile.id, input: text, response_format: profile.capabilities.includes('pcm_speech') ? 'pcm' : 'mp3', ...(profile.voices?.[0] ? { voice: profile.voices[0] } : {}) }), 'application/json');
  else {
    const form = new FormData();
    form.set('model', profile.id); form.set('file', new Blob(['fixture'], { type: 'audio/wav' }), 'fixture.wav');
    form.set('language', language); form.set('response_format', responseFormat);
    if (responseFormat === 'verbose_json') form.set('timestamp_granularities[]', 'segment');
    const request = new Request('http://localhost', { method: 'POST', body: form });
    await validateRequest('transcription', new Uint8Array(await request.arrayBuffer()), request.headers.get('content-type')!);
  }
}
await writeFile(join(outputRoot, 'plan.json'), JSON.stringify({ text, language, responseFormat, profiles, contractChecks, budgetUsd, keyLimitUsd }, null, 2), { mode: 0o600 });
if (planOnly) { process.stdout.write(`${JSON.stringify({ profiles, contractChecks, paidSubmissions: 0 })}\n`); await contract.close(); process.exit(0); }
await exec(option('ffprobe') ?? 'ffprobe', ['-version']);
await exec(option('ffmpeg') ?? 'ffmpeg', ['-version']);
const chunks: Buffer[] = []; let credentialBytes = 0;
for await (const chunk of process.stdin) {
  credentialBytes += chunk.length; if (credentialBytes > 16_384) throw new Error('Credential input too large');
  chunks.push(Buffer.from(chunk));
}
const credential = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { key?: string; costBearer?: string; name?: string; accountRemainingUsd?: number; productionReserveUsd?: number; balanceCheckedAt?: string };
const key = credential.key;
const checkedAt = Date.parse(credential.balanceCheckedAt ?? '');
if (!key?.startsWith('sk-or-') || credential.costBearer !== 'platform' || !/^OpenCreator platform (?:media|audio) verification/.test(credential.name ?? '')
  || !Number.isFinite(checkedAt) || Date.now() - checkedAt > 60_000 || checkedAt > Date.now() + 5_000
  || !(credential.productionReserveUsd! >= 4) || !(credential.accountRemainingUsd! >= keyLimitUsd + credential.productionReserveUsd!)) throw new Error('Expected a limited platform test key and fresh owner-balance preflight');
async function keyInfo() {
  const response = await upstream('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error('Test key inspection failed');
  const { data } = await response.json() as { data: { limit?: number; usage?: number; is_management_key?: boolean } };
  if (data.is_management_key || !data.limit || data.limit > keyLimitUsd) throw new Error('Invalid test key budget');
  return { limitUsd: data.limit, usageUsd: data.usage ?? 0 };
}
let usage = await keyInfo();
const initialUsage = usage.usageUsd;
const results: Array<Record<string, unknown>> = [];
let fundingBlocked = false;
let reference = option('reference-audio');
const checkpoint = async () => {
  const verifiedAt = new Date().toISOString();
  const evidence = join(outputRoot, 'report.json');
  await writeFile(evidence, JSON.stringify({ updatedAt: verifiedAt, costBearer: 'platform', transport: 'official-fetch', contractChecks, budgetUsd, keyLimitUsd, usage: { ...usage, incrementalUsageUsd: usage.usageUsd - initialUsage }, fundingBlocked, text, language, responseFormat, results }, null, 2), { mode: 0o600 });
  await writeFile(join(outputRoot, 'verified-audio.toml'), stringify({ openrouter: { verified_media_models: verifiedAudioProfiles(results, evidence, verifiedAt) } } as never), { mode: 0o600 });
};
await checkpoint();
try {
  for (const model of profiles) {
    if (fundingBlocked) { results.push({ model: model.id, status: 'untested', reason: 'funding-blocked' }); await checkpoint(); continue; }
    const root = join(outputRoot, model.id.replace('/', '__'));
    const receiptsRoot = join(root, 'receipts');
    await mkdir(root, { recursive: true, mode: 0o700 });
    let submissions = 0;
    const networkBefore = await readVerificationNetwork(upstream);
    const upstreamMetadata: Record<string, unknown> = {};
    const fetcher: typeof fetch = async (url, options) => {
      if (options?.method === 'POST') {
        assert.equal(submissions, 0, 'Blocked duplicate paid submission');
        usage = await keyInfo();
        const reportedCostUsd = results.reduce((sum, result) => sum + (typeof result.reportedCostUsd === 'number' ? result.reportedCostUsd : 0), 0);
        if (Math.max(usage.usageUsd, initialUsage + reportedCostUsd) >= budgetUsd) { fundingBlocked = true; throw new Error('Test budget exhausted'); }
        const resource = String(url).endsWith('/audio/speech') ? 'speech' : 'transcription';
        await validateRequest(resource, options.body!, new Headers(options.headers).get('content-type')!);
        submissions++;
      }
      const response = await upstream(url, options);
      upstreamMetadata.httpStatus = response.status;
      for (const name of ['x-request-id', 'x-generation-id', 'content-type']) upstreamMetadata[name] = response.headers.get(name);
      if (response.status === 402) fundingBlocked = true;
      return response;
    };
    const manual = createDefaultCreatorServicesConfig();
    let origin: string | undefined;
    const source = createGatewayCreatorSource({ directRequestsRoot: receiptsRoot, fetcher,
      account: {
        peekState: () => ({ source: 'gateway', authState: 'signed_in', activationState: 'ready', account: { id: 'platform-audio-verification', email: 'platform-verification@invalid', verified: true }, bindingVersion: 'platform-audio-verification', models: [model], selectedModels: { [model.modality]: model.id }, activationError: null }),
        modelCredentials: async () => ({ accountId: 'platform-audio-verification', bindingVersion: 'platform-audio-verification', keyVersion: 'platform', modelKey: key!, baseUrl: 'https://openrouter.ai/api/v1', transport: 'openrouter-direct', models: [model], defaults: { [model.modality]: model.id } })
      }, manual: { read: async () => structuredClone(manual), write: async value => value, reset: async () => manual }, getLocalOrigin: () => origin });
    const server = Fastify();
    let result: Record<string, unknown> = { model: model.id, modality: model.modality, status: 'failed' };
    process.stderr.write(`${JSON.stringify({ model: model.id, phase: 'submitting' })}\n`);
    try {
      await source.register(server);
      origin = await server.listen({ host: '127.0.0.1', port: 0 });
      let content: Buffer;
      let requestId: string | undefined;
      let outputPath: string;
      if (model.modality === 'speech') {
        const service = createKrillinTtsService({ resourceRoot: root, workRoot: root, configStore: source.store });
        const synthesized = await service.synthesize({ text, model: model.id, format: 'wav', logicalId: `verify-audio:${model.id}`, onGatewayRequest: id => { requestId = id; } });
        content = synthesized.content;
        outputPath = join(root, `speech.${synthesized.format}`);
        await writeFile(outputPath, content, { mode: 0o600 });
        const { stdout } = await exec(option('ffprobe') ?? 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', outputPath]);
        const media = JSON.parse(stdout);
        assert(media.streams?.length === 1 && Number(media.format?.duration) > 0);
        assert.equal(synthesized.format, model.capabilities.includes('pcm_speech') ? 'wav' : 'mp3');
        const decoded = await exec(option('ffmpeg') ?? 'ffmpeg', ['-v', 'error', '-i', outputPath, '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 });
        const samples = decoded.stdout;
        let sum = 0; for (let offset = 0; offset + 1 < samples.length; offset += 2) sum += samples.readInt16LE(offset) ** 2;
        const rms = Math.sqrt(sum / (samples.length / 2));
        assert(samples.length > 1600 && rms > 10, 'Audio is silent or undecodable');
        result = { ...result, format: synthesized.format, voice: synthesized.voiceId, media, rms };
        if (!reference) {
          reference = join(outputRoot, 'reference.wav');
          await exec(option('ffmpeg') ?? 'ffmpeg', ['-v', 'error', '-i', outputPath, '-ar', '16000', '-ac', '1', reference]);
        }
      } else {
        assert(reference, 'No successful TTS fixture available; supply --reference-audio');
        const config = await source.store.read();
        const form = new FormData();
        form.set('model', model.id); form.set('file', new Blob([new Uint8Array(await readFile(reference))], { type: 'audio/wav' }), 'fixture.wav');
        form.set('language', language); form.set('response_format', responseFormat);
        if (responseFormat === 'verbose_json') form.set('timestamp_granularities[]', 'segment');
        const response = await fetch(`${origin}/internal/krillin-llm/gateway/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${config.transcription.openai.apiKey}`, 'Idempotency-Key': `verify-audio:${model.id}` }, body: form, signal: AbortSignal.timeout(120_000) });
        const payload = await response.json();
        if (!response.ok) throw new Error(`Official ASR route failed: HTTP ${response.status}`);
        content = Buffer.from(JSON.stringify(payload));
        requestId = response.headers.get('x-request-id') ?? undefined;
        outputPath = join(root, 'transcript.json');
        await writeFile(outputPath, content, { mode: 0o600 });
        result = { ...result, outputPath, text: payload.text, reportedCostUsd: payload.usage?.cost, deliveryVerified: true };
        assert(typeof payload.text === 'string' && payload.text.trim(), 'No transcription text');
        const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        assert.equal(normalize(payload.text), normalize(text), 'Transcription does not match the known spoken fixture');
        const timings = [...(payload.words ?? []).map((word: { word: string; start: number; end: number }) => ({ ...word, text: word.word })), ...(payload.segments ?? [])];
        const validTimings = timings.filter(item => typeof item.text === 'string' && item.text.trim() && Number.isFinite(item.start) && Number.isFinite(item.end) && item.start >= 0 && item.end > item.start);
        result = { ...result, text: payload.text, validTimings: validTimings.length, reportedCostUsd: payload.usage?.cost, subtitleCompatible: validTimings.length > 0 };
        if (responseFormat === 'verbose_json') assert(validTimings.length > 0, 'Transcription text returned without valid subtitle timestamps');
      }
      assert(requestId && submissions === 1, 'Expected one recoverable paid submission');
      const restarted = createDirectTransport(receiptsRoot, fetcher);
      try {
        const replay = await restarted.request({ account: 'platform-audio-verification', key: key!, method: 'GET', resource: `requests/${requestId}/result`, body: undefined, contentType: 'application/json', identity: '', fingerprint: '', signal: AbortSignal.timeout(10_000) });
        const replayBytes = Buffer.from(await replay.arrayBuffer());
        const matched = model.modality === 'speech' ? content.equals(replayBytes) : JSON.stringify(JSON.parse(content.toString())) === JSON.stringify(JSON.parse(replayBytes.toString()));
        assert(matched && submissions === 1, 'Restart replay failed or caused a second paid call');
      } finally { await restarted.close(); }
      const networkAfter = await readVerificationNetwork(upstream).catch(() => undefined);
      result = { ...result, status: 'passed', outputPath, requestId, sha256: createHash('sha256').update(content).digest('hex'), restartReplay: true,
        verifiedCountries: verifiedCountries(networkBefore, networkAfter), networkBefore, networkAfter, verifiedAt: new Date().toISOString() };
    } catch (error) {
      result.error = (error instanceof Error ? error.message : String(error)).replaceAll(key!, '[redacted]');
      if ([402, 403].includes(Number(upstreamMetadata.httpStatus))) result.status = 'blocked';
    } finally { await source.revoke(); await server.close(); }
    const receipts = await readdir(receiptsRoot).catch(() => [] as string[]);
    const evidence = await Promise.all(receipts.map(async file => {
      const { content: _content, ...receipt } = JSON.parse(await readFile(join(receiptsRoot, file), 'utf8'));
      return receipt;
    }));
    usage = await keyInfo();
    result = { ...result, submissions, upstreamMetadata, evidence };
    results.push(result); await checkpoint();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} finally { await checkpoint(); await contract.close(); }
