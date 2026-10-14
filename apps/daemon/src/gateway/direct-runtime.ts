import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { errorFacts, statelessResponses, type OfficialModelFailureReporter } from './direct-transport.js';
import { officialEventStream } from './official-stream.js';
import { GatewayError } from './client.js';
import type { GatewayModel } from '@opencreator/protocol';
import { creatorServiceFailureFacts } from '../creator-services/upstream-fetch.js';

export type DirectRuntimeUse = { key: string; keyVersion?: string; release(): Promise<void>; models?: GatewayModel[]; onModelFailure?: OfficialModelFailureReporter };

export async function createDirectRuntime(key: string, fetcher: typeof fetch = fetch, beginUse?: () => Promise<DirectRuntimeUse>, recoverKey?: (keyVersion: string) => Promise<{ key: string; keyVersion: string }>) {
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
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024 * 1024) throw new Error('Request too large'); chunks.push(Buffer.from(chunk)); }
      const body = statelessResponses(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      const use = await beginUse?.(); release = use?.release;
      if (use?.models && !use.models.some(model => model.modality === 'text' && model.id === body.model && model.capabilities.includes('responses'))) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { code: 'invalid_model', message: 'The selected model is unavailable' } })); return;
      }
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
      const submit = (modelKey: string) => {
        signal.throwIfAborted();
        return fetcher('https://openrouter.ai/api/v1/responses', { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${modelKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      };
      let modelKey = use?.key ?? key;
      let response = await submit(modelKey);
      if (response.status === 401 && use?.keyVersion && recoverKey) {
        await response.body?.cancel();
        let updated: { key: string; keyVersion: string };
        try { updated = await recoverKey(use.keyVersion); }
        catch (error) {
          signal.throwIfAborted();
          throw error instanceof GatewayError && [401, 403].includes(error.status) ? error : new GatewayError('model_auth_required', 401);
        }
        if (updated.keyVersion !== use.keyVersion) { modelKey = updated.key; response = await submit(modelKey); }
      }
      if (!response.ok || !response.body) {
        const facts = await errorFacts(response, modelKey, signal);
        if (typeof body.model === 'string') { try { await use?.onModelFailure?.(body.model, 'text', facts); } catch {} }
        res.writeHead([401, 402].includes(response.status) ? response.status : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: response.status === 401 ? 'The official model credentials expired. Sign in again.' : response.status === 402 ? 'Insufficient credits' : 'The official model service is unavailable' } })); return;
      }
      res.writeHead(200, { 'Content-Type': response.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-store' });
      const bodyStream = response.headers.get('content-type')?.includes('text/event-stream') ? officialEventStream(response.body, async error => {
        if (typeof body.model === 'string') await use?.onModelFailure?.(body.model, 'text', creatorServiceFailureFacts(error));
      }) : response.body;
      await pipeline(Readable.fromWeb(bodyStream as import('node:stream/web').ReadableStream), res);
    } catch (error) {
      const status = error instanceof GatewayError && [401, 403].includes(error.status) ? error.status : 503;
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: status === 401 ? 'The official model credentials expired. Sign in again.' : status === 403 ? 'The official model service is unavailable. Check your account status.' : 'The official model service is unavailable' } }));
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
