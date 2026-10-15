import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { errorFacts, statelessResponses, type OfficialModelFailureReporter, type OfficialModelSuccessReporter } from './direct-transport.js';
import { officialEventStream } from './official-stream.js';
import { GatewayError, validateGatewayOrigin } from './client.js';
import type { GatewayModel } from '@opencreator/protocol';
import { creatorServiceFailureFacts } from '../creator-services/upstream-fetch.js';
import { publicFactsFromFailure } from '../creator/public-error-facts.js';
import { isKnownDirectBase, supplierBases } from './supplier.js';
import { responsesToChat, chatToResponses } from './chat-responses.js';

export type DirectRuntimeUse = { key: string; keyVersion?: string; baseUrl?: string; release(): Promise<void>; models?: GatewayModel[]; onModelFailure?: OfficialModelFailureReporter; onModelSuccess?: OfficialModelSuccessReporter };

export async function createDirectRuntime(key: string, fetcher: typeof fetch = fetch, beginUse?: () => Promise<DirectRuntimeUse>, recoverKey?: (keyVersion: string) => Promise<{ key: string; keyVersion: string }>, baseUrl: string = supplierBases.openrouter, gateway = false) {
  if (gateway) { if (baseUrl !== `${validateGatewayOrigin(new URL(baseUrl).origin)}/v1`) throw new GatewayError('invalid_gateway_response'); }
  else if (!isKnownDirectBase(baseUrl)) throw new GatewayError('invalid_gateway_response');
  const token = `oclocal_${randomBytes(32).toString('base64url')}`;
  const active = new Set<AbortController>();
  const handlers = new Set<Promise<void>>();
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/responses' || req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    const controller = new AbortController(); active.add(controller);
    let complete!: () => void;
    const done = new Promise<void>(resolve => { complete = resolve; }); handlers.add(done);
    const abort = () => controller.abort(); res.once('close', abort);
    let release: (() => Promise<void>) | undefined;
    let use: DirectRuntimeUse | undefined;
    let model: string | undefined;
    let failureReported = false;
    let succeeded = false;
    const reportFailure = async (facts: Parameters<OfficialModelFailureReporter>[2]) => {
      failureReported = true;
      if (model) { try { await use?.onModelFailure?.(model, 'text', facts); } catch {} }
    };
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024 * 1024) throw new Error('Request too large'); chunks.push(Buffer.from(chunk)); }
      const body = statelessResponses(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      model = typeof body.model === 'string' ? body.model : undefined;
      use = await beginUse?.(); release = use?.release;
      if (use?.baseUrl && use.baseUrl !== baseUrl) throw new GatewayError('supplier_binding_changed', 409);
      if (use?.models && !use.models.some(model => model.modality === 'text' && model.id === body.model && model.capabilities.includes('responses'))) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'invalid_model', message: 'The selected model is unavailable' } })); return;
      }
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
      const profile = use?.models?.find(candidate => candidate.id === model && candidate.modality === 'text');
      const bridge = profile?.capabilities.includes('responses_via_chat') ? responsesToChat(body) : undefined;
      const identity = randomUUID();
      const submit = (modelKey: string) => {
        signal.throwIfAborted();
        return fetcher(`${baseUrl}/${bridge ? 'chat/completions' : 'responses'}`, { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${modelKey}`, 'Content-Type': 'application/json', ...(gateway ? { 'Idempotency-Key': identity } : {}) }, body: JSON.stringify(bridge?.body ?? body) });
      };
      let modelKey = use?.key ?? key;
      let response = await submit(modelKey);
      if (response.status === 401 && use?.keyVersion && recoverKey) {
        await response.body?.cancel();
        let updated: { key: string; keyVersion: string };
        try { updated = await recoverKey(use.keyVersion); }
        catch (error) {
          signal.throwIfAborted();
          throw error instanceof GatewayError && [401, 403, 409].includes(error.status) ? error : new GatewayError('model_auth_required', 401);
        }
        if (updated.keyVersion !== use.keyVersion) { modelKey = updated.key; response = await submit(modelKey); }
      }
      if (!response.ok || !response.body) {
        const facts = await errorFacts(response, modelKey, signal);
        await reportFailure(facts);
        const status = response.status >= 400 && response.status <= 599 ? response.status : 502;
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(facts.requestId ? { 'X-Request-ID': facts.requestId } : {}) }).end(JSON.stringify({ error: {
          code: facts.upstreamCode ?? 'official_service_unavailable',
          message: facts.upstreamMessage ?? (status === 401 ? 'The official model credentials expired. Sign in again.' : status === 402 ? 'Insufficient credits' : 'The official model service is unavailable'),
          ...(facts.requestId ? { requestId: facts.requestId } : {})
        } })); return;
      }
      const success = async () => {
        succeeded = true;
        if (model) { try { await use?.onModelSuccess?.(model, 'text', 'responses'); } catch {} }
      };
      if (bridge) response = await chatToResponses(response, bridge.tools, model);
      if (!response.body) throw new GatewayError('invalid_gateway_response');
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        const text = await response.text();
        const payload = JSON.parse(text) as { error?: unknown; status?: string; output?: unknown[] };
        if (payload.error) {
          await reportFailure(creatorServiceFailureFacts(JSON.parse(text.replaceAll(modelKey, '[redacted]'))));
          throw new GatewayError('official_service_unavailable');
        }
        if (payload.status === 'completed' && payload.output?.length) await success();
        res.writeHead(200, { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' }).end(text);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      const bodyStream = officialEventStream(response.body, async error => {
        await reportFailure(creatorServiceFailureFacts(error));
      }, success);
      await pipeline(Readable.fromWeb(bodyStream as import('node:stream/web').ReadableStream), res);
    } catch (error) {
      if (use && !failureReported && !succeeded && !controller.signal.aborted) await reportFailure(publicFactsFromFailure(error));
      const status = error instanceof GatewayError && error.status >= 400 && error.status <= 599 ? error.status : 503;
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { ...(error instanceof GatewayError ? { code: error.code } : {}), message: status === 401 ? 'The official model credentials expired. Sign in again.' : status === 403 ? 'The official model service is unavailable. Check your account status.' : 'The official model service is unavailable' } }));
      else res.destroy();
    } finally {
      try { await release?.(); }
      finally { active.delete(controller); res.removeListener('close', abort); handlers.delete(done); complete(); }
    }
  });
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Local service unavailable');
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, token,
    async close() { for (const controller of active) controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await Promise.all(handlers); key = ''; }
  };
}
