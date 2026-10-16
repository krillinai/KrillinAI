import { createHash } from 'node:crypto';
import { gatewayDefaultVoiceId, gatewayModelOperations, gatewayVideoSizeParameters, safePublicRequestId, type GatewayModel, type GatewayModelOperation, type PublicErrorFacts } from '@opencreator/protocol';
import { join } from 'node:path';
import { readPrivateJsonFile, writePrivateJsonFile } from '../config/private-json-file.js';
import { GatewayError } from './client.js';
import { officialEventStream } from './official-stream.js';
import { creatorServiceFailureFacts } from '../creator-services/upstream-fetch.js';
import { publicFactsFromFailure } from '../creator/public-error-facts.js';
import { isKnownDirectBase, isChatAnywhereBase, supplierBases } from './supplier.js';
import { chatAnywhereImage, chatAnywhereTranscription } from './chatanywhere-media.js';
import { chatAnywhereMediaHosts, downloadSupplierMedia, uploadSupplierMedia } from './supplier-media.js';
import { eightyEightImageRequest, eightyEightImageResult } from './eighty-eight-image.js';
import { eightyEightVideoRequest } from './eighty-eight-video.js';
import { eightyEightTranscriptionRequest } from './eighty-eight-audio.js';
import { responsesToChat, chatToResponses } from './chat-responses.js';

type Receipt = { account: string; fingerprint: string; state: 'submitting' | 'waiting_upstream' | 'succeeded' | 'failed' | 'outcome_unknown'; remoteId?: string; status?: number; mime?: string; content?: string; errorCode?: string; errorStatus?: number;
  baseUrl?: string; resultUrl?: string; model?: string; operation?: string; createdAt?: string; updatedAt?: string; upstreamRequestId?: string; upstreamGenerationId?: string; reportedCostUsd?: number; receivedBytes?: number; upstreamError?: PublicErrorFacts };
export const DIRECT_MEDIA_ADAPTER_VERSION = 3;
export const DIRECT_IMAGE_TIMEOUT_MS = 10 * 60_000;

export function directRequestId(account: string, identity: string) {
  return 'ocdir_' + createHash('sha256').update(JSON.stringify([account, identity])).digest('hex').slice(0, 48);
}

class DirectUpstreamError extends GatewayError {
  constructor(code: string, status: number, readonly facts: PublicErrorFacts) { super(code, status); }
}

export type OfficialModelFailureReporter = (id: string, modality: GatewayModel['modality'], facts: PublicErrorFacts) => Promise<void>;
export type OfficialModelSuccessReporter = (id: string, modality: GatewayModel['modality'], operation: GatewayModelOperation) => Promise<void>;

export async function errorFacts(response: Response, key: string, signal?: AbortSignal): Promise<PublicErrorFacts> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  let payload: unknown;
  try {
    if (reader) for (;;) {
      const chunk = await (signal ? abortable(reader.read(), signal) : reader.read());
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 16_384) break;
      chunks.push(chunk.value);
    }
    if (size <= 16_384) payload = JSON.parse(Buffer.concat(chunks).toString('utf8').replaceAll(key, '[redacted]'));
  } catch {} finally { void reader?.cancel().catch(() => undefined); }
  return creatorServiceFailureFacts(payload, undefined, { httpStatus: response.status, requestId: response.headers.get('x-request-id') ?? undefined });
}

function recordUpstreamMetadata(record: Receipt, value: unknown) {
  if (!value || typeof value !== 'object') return;
  const metadata = value as { id?: unknown; generation_id?: unknown; request_id?: unknown; usage?: { cost?: unknown } };
  const generationId = [metadata.generation_id, metadata.id].find(id => typeof id === 'string' && /^gen-[A-Za-z0-9_-]{1,180}$/.test(id));
  if (typeof generationId === 'string') record.upstreamGenerationId = generationId;
  if (typeof metadata.request_id === 'string') record.upstreamRequestId ??= safePublicRequestId(metadata.request_id);
  const cost = metadata.usage?.cost;
  if ((record.baseUrl ?? supplierBases.openrouter) === supplierBases.openrouter && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) record.reportedCostUsd = cost;
}

function recordVideoStatus(record: Receipt, value: unknown, key: string) {
  const remote = value as { status?: unknown; url?: string; video_url?: string; result_url?: string } | null;
  if (!remote || typeof remote.status !== 'string' || !['pending', 'queued', 'unknown', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'].includes(remote.status)) throw new GatewayError('invalid_gateway_response');
  if (record.baseUrl === supplierBases['88api'] && remote.status === 'completed') {
    const url = remote.url ?? remote.video_url ?? remote.result_url;
    if (typeof url !== 'string' || !url) throw new GatewayError('invalid_gateway_response');
    record.resultUrl = url;
  }
  record.state = remote.status === 'completed' ? 'succeeded' : ['failed', 'cancelled', 'expired'].includes(remote.status) ? 'failed' : 'waiting_upstream';
  recordUpstreamMetadata(record, remote);
  if (record.state === 'failed') {
    record.errorCode = 'official_service_unavailable';
    record.upstreamError = creatorServiceFailureFacts(JSON.parse(JSON.stringify(remote).replaceAll(key, '[redacted]')));
  }
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function completeImageResponse(content: Buffer): boolean {
  try {
    const value = JSON.parse(content.toString('utf8')) as { data?: Array<{ b64_json?: unknown }> };
    return Array.isArray(value.data) && value.data.length > 0
      && value.data.every(image => typeof image?.b64_json === 'string' && image.b64_json.length > 0);
  } catch { return false; }
}

function pcmWave(content: Buffer, contentType: string): Buffer {
  const rate = Number(/(?:^|;)\s*rate=(\d+)\s*(?:;|$)/i.exec(contentType)?.[1]);
  const channels = Number(/(?:^|;)\s*channels=(\d+)\s*(?:;|$)/i.exec(contentType)?.[1]);
  if (!Number.isInteger(rate) || rate < 8_000 || rate > 192_000 || !Number.isInteger(channels) || channels < 1 || channels > 8
    || !content.length || content.length % (channels * 2) !== 0) throw new GatewayError('invalid_gateway_response');
  // OpenRouter PCM is signed 16-bit little-endian; rate and channels come from its response.
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(content.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(content.length, 40);
  return Buffer.concat([header, content]);
}

function completeEventStream(content: Buffer, resource?: string): boolean {
  let completed = false;
  for (const frame of content.toString('utf8').replace(/\r\n/g, '\n').split('\n\n').slice(0, -1)) {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (data === '[DONE]' && resource !== 'responses') { completed = true; continue; }
    try {
      const event = JSON.parse(data) as { type?: string; error?: unknown; response?: { status?: string; error?: unknown } };
      if (event.error || event.response?.error || ['error', 'response.failed', 'response.incomplete'].includes(event.type ?? '')
        || ['failed', 'incomplete', 'cancelled'].includes(event.response?.status ?? '')) return false;
      if (event.type === 'response.completed' && event.response?.status === 'completed' && resource !== 'chat/completions') completed = true;
    } catch {}
  }
  return completed;
}

function pixelAspectRatio(size: unknown) {
  const match = typeof size === 'string' ? /^(\d+)x(\d+)$/.exec(size) : null;
  if (!match) return undefined;
  const width = Number(match[1]); const height = Number(match[2]);
  if (!width || !height) throw new GatewayError('invalid_media_size', 400);
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export function statelessResponses(body: Record<string, unknown>): Record<string, unknown> {
  if (body.previous_response_id) throw new GatewayError('capability_unsupported', 400);
  const { previous_response_id: _previous, store: _store, ...rest } = body;
  return { ...rest, store: false };
}

export function createDirectTransport(root: string, fetcher: typeof fetch = fetch, recoverKey?: (account: string, failedKey: string, baseUrl: string) => Promise<string | undefined>) {
  const pending = new Map<string, Promise<Response>>();
  const fingerprints = new Map<string, string>();
  const workers = new Map<string, AbortController>();
  const path = (id: string) => join(root, `${id}.json`);
  const read = async (id: string) => {
    const record = await readPrivateJsonFile(path(id)) as Receipt | undefined;
    // Older callers could cancel after completion and overwrite the terminal state.
    if (record?.state === 'outcome_unknown' && record.status !== undefined && record.status >= 200 && record.status < 300
      && record.mime?.includes('text/event-stream') && record.content && completeEventStream(Buffer.from(record.content, 'base64'))) {
      record.state = 'succeeded';
      await write(id, record);
    }
    return record;
  };
  const write = (id: string, record: Receipt) => writePrivateJsonFile(path(id), { ...record, updatedAt: new Date().toISOString() });
  const response = (id: string, record: Receipt) => new Response(Buffer.from(record.content ?? '', 'base64'), { status: record.status ?? 200, headers: { 'Content-Type': record.mime ?? 'application/json', 'X-Request-ID': id } });
  const accepted = (id: string) => Response.json({ requestId: id, state: 'waiting_upstream' }, { status: 202, headers: { 'X-Request-ID': id } });
  async function call(resource: string, options: RequestInit, key: string, account: string, base: string) {
    const submit = async (modelKey: string) => {
      options.signal?.throwIfAborted();
      const work = fetcher(`${base}/${resource}`, { ...options, redirect: 'error', headers: { ...options.headers, Authorization: `Bearer ${modelKey}` } });
      try { return options.signal ? await abortable(work, options.signal) : await work; }
      catch (error) {
        void work.then(value => value.body?.cancel()).catch(() => undefined);
        throw error;
      }
    };
    let modelKey = key;
    let result = await submit(modelKey);
    if (result.status === 401 && recoverKey) {
      await result.body?.cancel();
      const recovery = recoverKey(account, key, base);
      let updated: string | undefined;
      try { updated = options.signal ? await abortable(recovery, options.signal) : await recovery; }
      catch (error) {
        options.signal?.throwIfAborted();
        throw error instanceof GatewayError && [401, 403].includes(error.status) ? error : new GatewayError('model_auth_required', 401);
      }
      if (updated && updated !== key) { modelKey = updated; result = await submit(modelKey); }
    }
    if (!result.ok) {
      const facts = await errorFacts(result, modelKey, options.signal ?? undefined);
      const limitExceeded = result.status === 403 && /^Key limit exceeded\b/i.test(facts.upstreamMessage ?? '');
      throw new DirectUpstreamError(result.status === 401 ? 'model_auth_required' : result.status === 402 || limitExceeded ? 'credits_insufficient' : 'official_service_unavailable', result.status >= 400 && result.status < 500 ? result.status : 503, facts);
    }
    return result;
  }
  return {
    isBusy() { return workers.size > 0; },
    async replay(account: string, identity: string, fingerprint: string): Promise<Response | undefined> {
      const id = directRequestId(account, identity);
      const saved = await read(id);
      if (!saved) return undefined;
      if (saved.account !== account || saved.fingerprint !== fingerprint) throw new GatewayError('operation_conflict', 409);
      if (saved.state === 'succeeded' && !saved.remoteId) return response(id, saved);
      if (saved.remoteId) return Response.json({ requestId: id, state: saved.state }, { status: 202, headers: { 'X-Request-ID': id } });
      if (saved.state === 'failed') return undefined;
      if (pending.has(id)) return accepted(id);
      throw new GatewayError('request_outcome_unknown', 409);
    },
    async close() {
      const work = [...workers.keys()].map(id => pending.get(id));
      for (const controller of workers.values()) controller.abort();
      await Promise.allSettled(work);
    },
    async request(input: { account: string; baseUrl?: string; key: string; resource: string; method: string; body: unknown; contentType: string; identity: string; fingerprint: string; signal: AbortSignal; model?: GatewayModel; asyncImage?: boolean; onModelFailure?: OfficialModelFailureReporter; onModelSuccess?: OfficialModelSuccessReporter }): Promise<Response> {
      const { account, key, resource } = input;
      const base = input.baseUrl ?? supplierBases.openrouter;
      if (!isKnownDirectBase(base)) throw new GatewayError('invalid_gateway_response');
      const eightyEight = base === supplierBases['88api'];
      const chatAnywhere = isChatAnywhereBase(base);
      const openRouter = base === supplierBases.openrouter;
      if (chatAnywhere && /^(?:video|videos)\//.test(resource)) throw new GatewayError('capability_unsupported', 400);
      const notify = async (id: string | undefined, modality: GatewayModel['modality'], facts: PublicErrorFacts | undefined) => {
        if (id && facts) { try { await input.onModelFailure?.(id, modality, facts); } catch {} }
      };
      const success = async (id: string | undefined, modality: GatewayModel['modality'], operation: string | undefined) => {
        if (id && gatewayModelOperations.includes(operation as GatewayModelOperation)) {
          try { await input.onModelSuccess?.(id, modality, operation as GatewayModelOperation); } catch {}
        }
      };
      const asyncImage = input.asyncImage === true && /^images\/(generations|edits)$/.test(resource) && input.method === 'POST';
      const controller = asyncImage ? new AbortController() : undefined;
      const signal = controller ? AbortSignal.any([controller.signal, AbortSignal.timeout(DIRECT_IMAGE_TIMEOUT_MS)]) : input.signal;
      const lookup = /^(?:requests|video\/jobs)\/(ocdir_[a-f0-9]{48})(\/result)?$/.exec(resource);
      if (lookup) {
        const id = lookup[1]!; const record = await read(id);
        if (!record || record.account !== account) throw new GatewayError('request_not_found', 404);
        if (!record.remoteId && ['submitting', 'waiting_upstream'].includes(record.state) && !pending.has(id)) {
          record.state = 'outcome_unknown'; await write(id, record);
        }
        if (record.remoteId) {
          if ((record.baseUrl ?? supplierBases.openrouter) !== base) throw new GatewayError('operation_conflict', 409);
          if (lookup[2]) {
            if (record.state !== 'succeeded') throw new GatewayError('request_outcome_unknown', 409);
            const content = eightyEight
              ? await downloadSupplierMedia(fetcher, record.resultUrl ?? '', signal, 512 * 1024 * 1024)
              : await call(`videos/${encodeURIComponent(record.remoteId)}/content?index=0`, { method: 'GET', signal }, key, account, base);
            if (!content.body || !content.headers.get('content-type')?.startsWith('video/')) throw new GatewayError('invalid_gateway_response');
            const reader = content.body.getReader();
            let bytes = 0;
            return new Response(new ReadableStream<Uint8Array>({
              async pull(controller) {
                try {
                  const item = await abortable(reader.read(), signal);
                  if (item.done) {
                    if (!bytes) throw new GatewayError('invalid_gateway_response');
                    await success(record.model, 'video', 'video/jobs'); controller.close();
                  } else { bytes += item.value.length; controller.enqueue(item.value); }
                } catch (error) { await reader.cancel().catch(() => undefined); controller.error(error); }
              },
              cancel() { return reader.cancel(); }
            }), { status: content.status, headers: content.headers });
          }
          let remote: unknown;
          try { remote = await (await call(`videos/${encodeURIComponent(record.remoteId)}`, { method: 'GET', signal }, key, account, base)).json(); }
          catch (error) { if (error instanceof DirectUpstreamError) await notify(record.model, 'video', error.facts); throw error; }
          recordVideoStatus(record, remote, key);
          await write(id, record);
          if (record.state === 'failed') await notify(record.model, 'video', record.upstreamError);
        }
        if (lookup[2]) { if (record.state !== 'succeeded') throw new GatewayError('request_outcome_unknown', 409); return response(id, record); }
        return Response.json({ requestId: id, state: record.state, ...(record.errorCode ? { error: { code: record.errorCode, status: record.errorStatus } } : {}) }, { headers: { 'X-Request-ID': id } });
      }
      if (input.method !== 'POST') throw new GatewayError('capability_unsupported', 404);
      const id = directRequestId(account, input.identity);
      const existing = pending.get(id);
      if (existing) {
        if (fingerprints.get(id) !== JSON.stringify([base, input.fingerprint])) throw new GatewayError('operation_conflict', 409);
        if (asyncImage) return accepted(id);
        await existing; return this.request(input);
      }
      let registered!: () => void;
      const ready = new Promise<void>(resolve => { registered = resolve; });
      const work = (async () => {
        const saved = await read(id);
        if (saved && (saved.account !== account || saved.fingerprint !== input.fingerprint || (saved.baseUrl ?? supplierBases.openrouter) !== base)) throw new GatewayError('operation_conflict', 409);
        if (saved?.remoteId) return Response.json({ requestId: id, state: saved.state }, { status: 202, headers: { 'X-Request-ID': id } });
        if (saved?.state === 'succeeded') return response(id, saved);
        if (saved && saved.state !== 'failed') throw new GatewayError('request_outcome_unknown', 409);
        let body = input.body;
        let endpoint = resource;
        let contentType = input.contentType;
        let chatBridge: ReturnType<typeof responsesToChat> | undefined;
        const upload = (bytes: Buffer, mime: string) => uploadSupplierMedia(bytes, mime, fetcher,
          body => call('media/uploads', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, key, account, base), signal);
        let requiresTimestamps = false;
        if (resource === 'audio/transcriptions') {
          const transcription = Buffer.isBuffer(body)
            ? await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) }).formData()
            : undefined;
          requiresTimestamps ||= (transcription?.get('response_format') ?? (body as Record<string, unknown>)?.response_format) === 'verbose_json';
          if (eightyEight && requiresTimestamps) throw new GatewayError('capability_unsupported', 400);
          if (eightyEight) {
            const native = await eightyEightTranscriptionRequest(body, contentType);
            body = native.body; contentType = native.contentType;
          }
          if (chatAnywhere) {
            const native = await chatAnywhereTranscription(body, contentType);
            body = native.body; contentType = native.contentType;
          }
        }
        if (resource === 'responses') body = statelessResponses(body as Record<string, unknown>);
        if (resource === 'responses' && input.model?.capabilities.includes('responses_via_chat')) {
          chatBridge = responsesToChat(body as Record<string, unknown>); body = chatBridge.body; endpoint = 'chat/completions';
        }
        if (eightyEight && /^images\/(generations|edits)$/.test(resource)) {
          const native = await eightyEightImageRequest(resource, body, contentType, input.model, upload);
          body = native.body; contentType = native.contentType; endpoint = native.resource;
        }
        if (chatAnywhere && /^images\/(generations|edits)$/.test(resource)) {
          const native = await chatAnywhereImage(resource, body, contentType, input.model);
          body = native.body; contentType = native.contentType;
        }
        if (resource === 'images/edits' && openRouter) {
          const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body as Buffer) }).formData();
          const fields: Record<string, unknown> = {}; const references: unknown[] = [];
          for (const [name, value] of form.entries()) {
            if (typeof value === 'string') fields[name] = name === 'n' ? Number(value) : value;
            else if (name === 'image' || name === 'image[]') references.push({ type: 'image_url', image_url: { url: `data:${value.type || 'image/png'};base64,${Buffer.from(await value.arrayBuffer()).toString('base64')}` } });
          }
          body = { ...fields, input_references: references }; contentType = 'application/json'; endpoint = 'images';
        }
        if (resource === 'images/generations') {
          if (openRouter) endpoint = 'images';
        }
        if (endpoint === 'images') {
          const { response_format: _format, size, quality, aspect_ratio, resolution, output_format, stream, ...fields } = body as Record<string, unknown>;
          const options = input.model?.imageOptions;
          const aspectRatio = aspect_ratio || (options && !options.aspectRatios?.length ? undefined : pixelAspectRatio(size));
          const valid = (value: unknown, allowed?: string[]) => value === undefined || value === '' || (typeof value === 'string' && !!allowed?.includes(value));
          const count = fields.n ?? 1;
          if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 10
            || (stream !== undefined && stream !== false)
            || typeof fields.model !== 'string' || !fields.model || typeof fields.prompt !== 'string' || !fields.prompt.trim()
            || (fields.input_references !== undefined && (!Array.isArray(fields.input_references) || fields.input_references.length > 16
              || fields.input_references.some(ref => !ref || ref.type !== 'image_url' || typeof ref.image_url?.url !== 'string' || !ref.image_url.url)))) throw new GatewayError('capability_unsupported', 400);
          if (options && (!valid(aspectRatio, options.aspectRatios) || !valid(resolution, options.resolutions) || !valid(quality, options.qualities) || !valid(output_format, options.outputFormats)
            || count > options.maxImages || (Array.isArray(fields.input_references) && fields.input_references.length > options.maxReferences))) throw new GatewayError('capability_unsupported', 400);
          if (input.model && Array.isArray(fields.input_references) && fields.input_references.length && !input.model.capabilities.includes('edit')) throw new GatewayError('capability_unsupported', 400);
          if (resource === 'images/edits' && (!Array.isArray(fields.input_references) || !fields.input_references.length)) throw new GatewayError('capability_unsupported', 400);
          const outputFormat = output_format || ['png', 'jpeg', 'webp'].find(format => options?.outputFormats?.includes(format));
          body = { ...fields, stream: false, ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}), ...(resolution ? { resolution } : {}), ...(quality ? { quality } : {}), ...(outputFormat ? { output_format: outputFormat } : {}) };
        }
        if (resource === 'audio/speech') {
          const { voice, response_format: _format, ...fields } = body as Record<string, unknown>;
          // OpenCreator consumes the actual audio MIME; native encoding also supports PCM-only providers.
          const format = eightyEight ? 'wav' : input.model?.capabilities.includes('pcm_speech') ? 'pcm' : undefined;
          if (eightyEight && Buffer.byteLength(String(fields.input ?? '') + String(fields.instructions ?? '') + (fields.speed === undefined ? '' : `Speak at ${fields.speed}x speed.`), 'utf8') > 8000) throw new GatewayError('capability_unsupported', 400);
          if (typeof fields.input !== 'string' || !fields.input.trim()
            || (fields.speed !== undefined && (eightyEight ? typeof fields.speed !== 'number' || fields.speed < 0.25 || fields.speed > 4 : fields.speed !== 1))
            || (fields.instructions !== undefined && (!eightyEight || typeof fields.instructions !== 'string'))
            || (input.model?.voices?.length && !input.model.capabilities.includes('default_voice')
              && (typeof voice !== 'string' || !input.model.voices.includes(voice)))) throw new GatewayError('capability_unsupported', 400);
          if (input.model?.capabilities.includes('default_voice')) {
            if (voice && voice !== gatewayDefaultVoiceId) throw new GatewayError('capability_unsupported', 400);
            body = { ...fields, ...(format ? { response_format: format } : {}) };
          } else body = { ...fields, voice, ...(format ? { response_format: format } : {}) };
        }
        if (resource === 'video/jobs' || resource === 'videos/tasks') {
          if (eightyEight) {
            body = await eightyEightVideoRequest(body as Record<string, unknown>, input.model, upload);
            endpoint = 'videos';
          } else {
          const value = body as { model: string; prompt: string; duration?: number; size?: string; image?: string };
          const sizeParams = input.model ? gatewayVideoSizeParameters(input.model, value.size ?? '') : value.size ? { size: value.size } : {};
          if (!sizeParams || typeof value.model !== 'string' || !value.model || typeof value.prompt !== 'string' || !value.prompt.trim()
            || (value.duration !== undefined && (!Number.isInteger(value.duration) || value.duration < 1))
            || (input.model?.durations && !input.model.durations.includes(value.duration!))) throw new GatewayError('capability_unsupported', 400);
          if (value.image !== undefined && (typeof value.image !== 'string' || !value.image)) throw new GatewayError('capability_unsupported', 400);
          if (value.image && input.model && !input.model.capabilities.includes('image_to_video')) throw new GatewayError('capability_unsupported', 400);
          body = { model: value.model, prompt: value.prompt, duration: value.duration, ...sizeParams, ...(value.image ? eightyEight ? { images: [value.image] } : { frame_images: [{ type: 'image_url', image_url: { url: value.image }, frame_type: 'first_frame' }] } : {}) };
          endpoint = 'videos';
          }
        }
        const record: Receipt = { account, fingerprint: input.fingerprint, state: asyncImage ? 'waiting_upstream' : 'submitting', operation: resource, model: input.model?.id ?? (body && typeof body === 'object' && 'model' in body && typeof body.model === 'string' ? body.model : undefined), createdAt: new Date().toISOString() };
        record.baseUrl = base;
        await write(id, record);
        registered();
        try {
          let remote = await call(endpoint, { method: 'POST', signal, headers: { 'Content-Type': contentType }, body: Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) }, key, account, base);
          if (chatBridge) remote = await chatToResponses(remote, chatBridge.tools, input.model?.id);
          record.upstreamRequestId = safePublicRequestId(remote.headers.get('x-request-id') ?? undefined);
          recordUpstreamMetadata(record, { generation_id: remote.headers.get('x-generation-id') });
          record.status = remote.status;
          await write(id, record);
          if (endpoint === 'videos') {
            const value = await remote.json() as { id?: string };
            if (!value.id || !/^[A-Za-z0-9_-]{1,200}$/.test(value.id)) throw new GatewayError('invalid_gateway_response');
            // Keep the remote ID even if the submit response needs reconciliation.
            record.remoteId = value.id;
            recordVideoStatus(record, value, key);
            await write(id, record);
            if (record.state === 'failed') await notify(record.model, 'video', record.upstreamError);
            return Response.json({ requestId: id, state: record.state }, { status: 202, headers: { 'X-Request-ID': id } });
          }
          record.status = remote.status; record.mime = remote.headers.get('content-type') ?? 'application/json';
          await write(id, record);
          const reader = (record.mime.includes('text/event-stream') && remote.body ? officialEventStream(remote.body, error => notify(record.model, 'text', creatorServiceFailureFacts(error))) : remote.body)?.getReader(); if (!reader) throw new GatewayError('invalid_gateway_response');
          const chunks: Uint8Array[] = []; let size = 0;
          if (!record.mime.includes('text/event-stream')) {
            try {
              for (;;) {
                const item = await abortable(reader.read(), signal); if (item.done) break;
                size += item.value.length; if (size > 64 * 1024 * 1024) throw new GatewayError('invalid_gateway_response');
                chunks.push(item.value);
                // Buffered image JSON can be complete before the upstream closes its HTTP stream.
                if (endpoint === 'images' && Buffer.from(item.value).toString('utf8').trimEnd().endsWith('}') && completeImageResponse(Buffer.concat(chunks))) break;
              }
            } catch (error) {
              if (endpoint === 'images') record.content = Buffer.from(Buffer.concat(chunks).toString('utf8').replaceAll(key, '[redacted]')).toString('base64');
              throw error;
            } finally { record.receivedBytes = size; void reader.cancel().catch(() => undefined); }
            let content: Buffer = Buffer.concat(chunks);
            if (endpoint === 'audio/speech' && /^audio\/pcm(?:;|$)/i.test(record.mime)) {
              content = pcmWave(content, eightyEight ? 'audio/pcm;rate=24000;channels=1' : record.mime); record.mime = 'audio/wav';
            }
            record.content = content.toString('base64');
            let payload: Record<string, unknown> | undefined;
            if (record.mime.includes('application/json')) {
              try { payload = JSON.parse(content.toString('utf8')); } catch {}
              if (payload?.error) {
                record.content = Buffer.from(content.toString('utf8').replaceAll(key, '[redacted]')).toString('base64');
                const facts = creatorServiceFailureFacts(JSON.parse(content.toString('utf8').replaceAll(key, '[redacted]')), undefined, { requestId: record.upstreamRequestId });
                const status = Number(facts.upstreamCode);
                throw new DirectUpstreamError('official_service_unavailable', [400, 401, 402, 403, 404, 422, 429].includes(status) ? status : 503, facts);
              }
            }
            if (endpoint === 'audio/speech' && (!content.length || record.mime.includes('application/json'))) throw new GatewayError('invalid_gateway_response');
            if (endpoint === 'audio/transcriptions') {
              if (!payload || typeof payload.text !== 'string') throw new GatewayError('invalid_gateway_response');
              try { recordUpstreamMetadata(record, JSON.parse(content.toString('utf8'))); } catch {}
              if (requiresTimestamps) {
                const value = JSON.parse(content.toString('utf8')) as { text?: unknown; words?: Array<{ word?: unknown; start?: unknown; end?: unknown }>; segments?: Array<{ text?: unknown; start?: unknown; end?: unknown }> };
                const timings = [...(Array.isArray(value.words) ? value.words.map(word => ({ ...word, text: word.word })) : []), ...(Array.isArray(value.segments) ? value.segments : [])];
                if (typeof value.text !== 'string' || !value.text.trim() || !timings.some(item => typeof item?.text === 'string' && item.text.trim()
                  && typeof item.start === 'number' && Number.isFinite(item.start) && item.start >= 0 && typeof item.end === 'number' && Number.isFinite(item.end) && item.end > item.start)) throw new GatewayError('invalid_gateway_response');
              }
            }
            if (endpoint === 'images' || ((eightyEight || chatAnywhere) && /^images\//.test(resource))) {
              if (eightyEight && payload) payload = eightyEightImageResult(payload);
              if ((eightyEight || chatAnywhere) && payload && Array.isArray(payload.data)) {
                for (const item of payload.data as Array<{ b64_json?: string; url?: string }>) {
                  if (!item.b64_json && typeof item.url === 'string') {
                    const image = await downloadSupplierMedia(fetcher, item.url, signal, 64 * 1024 * 1024, chatAnywhere ? chatAnywhereMediaHosts : undefined);
                    if (!image.headers.get('content-type')?.startsWith('image/')) throw new GatewayError('invalid_gateway_response');
                    item.b64_json = Buffer.from(await image.arrayBuffer()).toString('base64'); delete item.url;
                  }
                }
                content = Buffer.from(JSON.stringify(payload)); record.content = content.toString('base64');
              }
              try { recordUpstreamMetadata(record, JSON.parse(content.toString('utf8'))); } catch {}
              if (!completeImageResponse(content)) {
                record.content = Buffer.from(content.toString('utf8').replaceAll(key, '[redacted]')).toString('base64');
                record.upstreamError = { kind: 'invalid-response', httpStatus: remote.status, upstreamCode: 'invalid_image_response' };
                throw new GatewayError('invalid_gateway_response');
              }
            }
            record.state = 'succeeded'; await write(id, record);
            const validText = resource === 'responses' ? payload?.status === 'completed' && Array.isArray(payload.output) && payload.output.length > 0
              : endpoint === 'chat/completions' ? Array.isArray(payload?.choices) && payload.choices.some(choice => choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') : true;
            if (validText) await success(record.model, input.model?.modality ?? 'text', resource);
            return response(id, record);
          }
          let settlement = Promise.resolve();
          const settleStream = (content?: Buffer) => {
            settlement = settlement.then(async () => {
              if (record.state === 'succeeded') return;
              record.state = content ? 'succeeded' : 'outcome_unknown';
              if (content) record.content = content.toString('base64');
              await write(id, record);
              if (content) await success(record.model, 'text', resource);
            });
            return settlement;
          };
          const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const item = await reader.read();
                if (item.done) {
                  const content = Buffer.concat(chunks);
                  if (!completeEventStream(content, resource)) throw new GatewayError('request_outcome_unknown', 409);
                  await settleStream(content); controller.close(); return;
                }
                size += item.value.length; if (size > 64 * 1024 * 1024) throw new GatewayError('invalid_gateway_response');
                chunks.push(item.value);
                if (completeEventStream(Buffer.from(item.value), resource)) {
                  const content = Buffer.concat(chunks);
                  if (!completeEventStream(content, resource)) throw new GatewayError('request_outcome_unknown', 409);
                  await settleStream(content);
                  controller.enqueue(item.value); controller.close();
                  void reader.cancel().catch(() => undefined);
                  return;
                }
                controller.enqueue(item.value);
              } catch {
                await settleStream(); await reader.cancel().catch(() => undefined);
                if (record.state !== 'succeeded') controller.error(new GatewayError('request_outcome_unknown', 409));
              }
            },
            async cancel() {
              const content = Buffer.concat(chunks);
              await settleStream(completeEventStream(content, resource) ? content : undefined);
              await reader.cancel();
            }
          });
          return new Response(stream, { status: remote.status, headers: { 'Content-Type': record.mime, 'X-Request-ID': id } });
        } catch (error) {
          record.state = error instanceof GatewayError && [400, 401, 402, 403, 404, 422, 429].includes(error.status) ? 'failed' : 'outcome_unknown';
          if (error instanceof GatewayError) { record.errorCode = error.code; record.errorStatus = error.status; }
          if (error instanceof DirectUpstreamError) { record.upstreamError = error.facts; record.upstreamRequestId ??= error.facts.requestId; }
          else record.upstreamError ??= publicFactsFromFailure(error, undefined, { timedOut: signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError' });
          await write(id, record);
          await notify(record.model, input.model?.modality ?? 'text', record.upstreamError);
          throw error;
        }
      })();
      pending.set(id, work);
      fingerprints.set(id, JSON.stringify([base, input.fingerprint]));
      if (controller) workers.set(id, controller);
      void work.finally(() => { pending.delete(id); fingerprints.delete(id); workers.delete(id); }).catch(() => undefined);
      return asyncImage ? Promise.race([ready.then(() => accepted(id)), work]) : work;
    }
  };
}
