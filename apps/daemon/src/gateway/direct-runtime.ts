import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { statelessResponses } from './direct-transport.js';
import { officialEventStream } from './official-stream.js';
import { GatewayError } from './client.js';

export async function createDirectRuntime(key: string, fetcher: typeof fetch = fetch, beginUse?: () => Promise<{ key: string; keyVersion?: string; release(): Promise<void> }>, recoverKey?: (keyVersion: string) => Promise<{ key: string; keyVersion: string }>) {
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
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
      const submit = (modelKey: string) => {
        signal.throwIfAborted();
        return fetcher('https://openrouter.ai/api/v1/responses', { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${modelKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      };
      let response = await submit(use?.key ?? key);
      if (response.status === 401 && use?.keyVersion && recoverKey) {
        await response.body?.cancel();
        let updated: { key: string; keyVersion: string };
        try { updated = await recoverKey(use.keyVersion); }
        catch (error) {
          signal.throwIfAborted();
          throw error instanceof GatewayError && [401, 403].includes(error.status) ? error : new GatewayError('model_auth_required', 401);
        }
        if (updated.keyVersion !== use.keyVersion) response = await submit(updated.key);
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        res.writeHead([401, 402].includes(response.status) ? response.status : 503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: response.status === 401 ? '官方模型凭据已失效，请重新连接账号' : response.status === 402 ? '积分不足' : '官方模型服务暂不可用' } })); return;
      }
      res.writeHead(200, { 'Content-Type': response.headers.get('content-type') ?? 'text/event-stream', 'Cache-Control': 'no-store' });
      const bodyStream = response.headers.get('content-type')?.includes('text/event-stream') ? officialEventStream(response.body) : response.body;
      await pipeline(Readable.fromWeb(bodyStream as import('node:stream/web').ReadableStream), res);
    } catch (error) {
      const status = error instanceof GatewayError && [401, 403].includes(error.status) ? error.status : 503;
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: status === 401 ? '官方模型凭据已失效，请重新连接账号' : status === 403 ? '官方模型服务暂不可用，请检查账号状态' : '官方模型服务暂不可用' } }));
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
