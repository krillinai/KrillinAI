import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gatewayVideoSizes, type GatewayConnectionDiagnostics, type GatewayModel, type GatewayModelProbeOptions, type PublicErrorFacts } from '@opencreator/protocol';
import { GatewayError, validateGatewayOrigin } from './client.js';
import { chatAnywhereImage } from './chatanywhere-media.js';
import { createDirectTransport, errorFacts } from './direct-transport.js';
import { modelProbeAudio } from './model-probe-audio.js';
import { isModelAccessFailure } from './model-access.js';
import { isDirectTransport, isKnownDirectBase } from './supplier.js';

export class ModelProbeError extends GatewayError {
  constructor(code: string, readonly publicFacts?: PublicErrorFacts, diagnostics?: GatewayConnectionDiagnostics) {
    super(code, 503, diagnostics);
  }
}

export type ModelProbeScope = { accountId: string; modelKey: string; keyVersion: string; baseUrl: string; transport?: 'gateway' | 'openrouter-direct' | 'supplier-direct'; accessContext?: string };

export function createModelSelectionProbe(input: {
  dataDir: string;
  fetcher: typeof fetch;
  readProxy(): Promise<string>;
  timeoutMs?: number;
  pollMs?: number;
}) {
  const transport = createDirectTransport(join(input.dataDir, 'gateway', 'model-probes'), input.fetcher);
  const passes = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  const controllers = new Set<AbortController>();
  let closed = false;

  async function probe(model: GatewayModel, scope: ModelProbeScope, force = false, options?: GatewayModelProbeOptions) {
    if (closed) throw new ModelProbeError('model_probe_unavailable');
    const gateway = scope.transport === 'gateway' && scope.baseUrl === `${validateGatewayOrigin(new URL(scope.baseUrl).origin)}/v1`;
    if (!scope.modelKey || !gateway && (!isDirectTransport(scope.transport) || !isKnownDirectBase(scope.baseUrl))) {
      throw new ModelProbeError('model_probe_unavailable');
    }
    const fingerprint = createHash('sha256').update(JSON.stringify([
      scope.baseUrl, scope.accountId, scope.modelKey, scope.keyVersion, scope.accessContext, await input.readProxy(), model, options?.textApi ?? 'responses'
    ])).digest('hex');
    const existing = pending.get(fingerprint);
    if (existing) return existing;
    if (!force && (passes.get(fingerprint) ?? 0) > Date.now()) return;
    for (const [key, expiresAt] of passes) if (expiresAt <= Date.now()) passes.delete(key);
    const controller = new AbortController();
    controllers.add(controller);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(input.timeoutMs ?? 5 * 60_000)]);
    const work = (async () => {
      const account = `model-probe:${scope.accountId}:${scope.keyVersion}`;
      let failureFacts: PublicErrorFacts | undefined;
      async function request(resource: string, body: unknown, method = 'POST', contentType = 'application/json'): Promise<Response> {
        if (gateway) {
          if (resource.startsWith('images/') && method === 'POST' && model.catalogSchema !== 2) { const native = await chatAnywhereImage(resource, body, contentType, model); body = native.body; contentType = native.contentType; }
          const response = await input.fetcher(`${scope.baseUrl}/${resource}`, { method, redirect: 'error', signal, headers: { Authorization: `Bearer ${scope.modelKey}`, 'Content-Type': contentType, 'Idempotency-Key': randomUUID() }, ...(method === 'POST' ? { body: Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body) } : {}) });
          if (!response.ok) {
            failureFacts = await errorFacts(response, scope.modelKey, signal);
            throw new GatewayError(response.status === 402 ? 'credits_insufficient' : 'official_service_unavailable', response.status);
          }
          return response;
        }
        return transport.request({ account, baseUrl: scope.baseUrl, key: scope.modelKey, resource, method, body,
          contentType, identity: randomUUID(), fingerprint, signal, model,
          onModelFailure: async (_id, _modality, facts) => { failureFacts = facts; } });
      }
      try {
        switch (model.modality) {
          case 'text': {
            if (options?.textApi === 'chat/completions') {
              const chat = await (await request('chat/completions', { model: model.id,
                messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 256, stream: false })).json() as {
                  choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
                };
              if (!chat.choices?.some(choice => typeof choice.message?.content === 'string' && choice.message.content.trim()
                && choice.finish_reason === 'stop')) throw new ModelProbeError('model_probe_inconclusive');
              break;
            }
            const tools = [{ type: 'function', name: 'model_probe', description: 'Confirm connectivity.',
              parameters: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } }];
            const result = await (await request('responses', { model: model.id, input: 'Call model_probe with ok=true.',
              tools, tool_choice: 'auto', max_output_tokens: 256, stream: false })).json() as {
                status?: string; output?: Array<{ type?: string; name?: string; arguments?: string }>;
              };
            if (result.status !== 'completed' || !result.output?.some(item => {
              try { return item.type === 'function_call' && item.name === 'model_probe' && JSON.parse(item.arguments ?? '').ok === true; }
              catch { return false; }
            })) throw new ModelProbeError('model_probe_inconclusive');
            break;
          }
          case 'image': {
            const { default: sharp } = await import('sharp');
            const options = model.imageOptions;
            let resource = 'images/generations'; let contentType = 'application/json';
            let body: unknown = { model: model.id, prompt: 'A red circle on a white background.', n: 1,
              aspect_ratio: options?.aspectRatios?.includes('1:1') ? '1:1' : options?.aspectRatios?.[0],
              resolution: smallest(options?.resolutions), quality: options?.qualities?.includes('low') ? 'low' : options?.qualities?.[0] };
            if (model.capabilities.includes('reference_required')) {
              const form = new FormData(); form.set('model', model.id); form.set('prompt', 'Make the circle blue.');
              const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer();
              form.set('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'reference.png');
              const multipart = new Request('http://localhost', { method: 'POST', body: form });
              resource = 'images/edits'; contentType = multipart.headers.get('content-type')!; body = Buffer.from(await multipart.arrayBuffer());
            }
            const result = await (await request(resource, body, 'POST', contentType)).json() as {
                data?: Array<{ b64_json?: string }>;
              };
            if (!result.data?.[0]?.b64_json) throw new ModelProbeError('model_probe_inconclusive');
            await sharp(Buffer.from(result.data[0].b64_json, 'base64')).raw().toBuffer();
            break;
          }
          case 'speech': {
            const response = await request('audio/speech', { model: model.id, input: 'Hello.', voice: model.voices?.[0] });
            if (!response.headers.get('content-type')?.startsWith('audio/') || !(await response.arrayBuffer()).byteLength) {
              throw new ModelProbeError('model_probe_inconclusive');
            }
            break;
          }
          case 'transcription': {
            const form = new FormData();
            form.set('model', model.id); form.set('response_format', 'json');
            form.set('file', new Blob([new Uint8Array(modelProbeAudio())], { type: 'audio/wav' }), 'probe.wav');
            const multipart = new Request('http://localhost', { method: 'POST', body: form });
            const response = await request('audio/transcriptions', Buffer.from(await multipart.arrayBuffer()), 'POST', multipart.headers.get('content-type')!);
            const result = await response.json() as { text?: unknown };
            if (typeof result.text !== 'string' || !result.text.trim()) throw new ModelProbeError('model_probe_inconclusive');
            break;
          }
          case 'video': {
            const response = await request('video/jobs', { model: model.id, prompt: 'A red circle moves slowly on a white background.',
              duration: model.durations?.length ? Math.min(...model.durations) : undefined, size: smallest(gatewayVideoSizes(model)) });
            let result = await response.json() as { requestId?: string; state?: string; error?: { status?: number } };
            if (!result.requestId) throw new ModelProbeError('model_probe_inconclusive');
            const resource = `requests/${result.requestId}`;
            while (['submitting', 'waiting_upstream'].includes(result.state ?? '')) {
              await delay(input.pollMs ?? 2000, undefined, { signal });
              result = await (await request(resource, undefined, 'GET')).json();
            }
            if (result.state !== 'succeeded') throw new ModelProbeError(
              failureFacts && isModelAccessFailure(failureFacts) ? 'model_probe_failed' : 'model_probe_inconclusive', failureFacts);
            const content = await request(`${resource}/result`, undefined, 'GET');
            if (!content.headers.get('content-type')?.startsWith('video/') || !(await content.arrayBuffer()).byteLength) {
              throw new ModelProbeError('model_probe_inconclusive');
            }
            break;
          }
        }
        signal.throwIfAborted();
        if (passes.size >= 256) passes.delete(passes.keys().next().value!);
        passes.set(fingerprint, Date.now() + 5 * 60_000);
      } catch (error) {
        passes.delete(fingerprint);
        if (error instanceof ModelProbeError) throw error;
        const facts = (error as { facts?: PublicErrorFacts })?.facts ?? failureFacts;
        if (error instanceof GatewayError && error.code === 'credits_insufficient') {
          throw new ModelProbeError('model_probe_credits_insufficient', facts);
        }
        if (error instanceof GatewayError && [401, 429].includes(error.status)) {
          throw new ModelProbeError(error.status === 401 ? 'model_probe_auth_required' : 'model_probe_unavailable', facts);
        }
        if (facts && isModelAccessFailure(facts)) {
          throw new ModelProbeError('model_probe_failed', facts);
        }
        throw new ModelProbeError('model_probe_inconclusive', facts);
      }
    })();
    pending.set(fingerprint, work);
    try { await work; }
    finally { pending.delete(fingerprint); controllers.delete(controller); }
  }

  return {
    probe,
    async close() { closed = true; for (const controller of controllers) controller.abort(); await Promise.allSettled(pending.values()); await transport.close(); passes.clear(); }
  };
}

function smallest(values: string[] | undefined) {
  return values?.slice().sort((a, b) => (parseFloat(a) || Infinity) - (parseFloat(b) || Infinity))[0];
}
