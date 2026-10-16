import { GatewayError } from './client.js';
import { createHash } from 'node:crypto';

const deliveryHosts = new Set(['assets.88api.ai', 'cg-comfyui-prod.tos-cn-beijing.volces.com', 'store.vod-qcloud.com',
  'ark-acg-cn-beijing.tos-cn-beijing.volces.com', 'ark-acg-beijing.tos-cn-beijing.volces.com']);
export const chatAnywhereMediaHosts = new Set(['api.chatanywhere.tech', 'api.chatanywhere.org', 'oaidalleapiprodscus.blob.core.windows.net']);

function mediaURL(address: string, upload = false, hosts = deliveryHosts) {
  let url: URL;
  try { url = new URL(address); } catch { throw new GatewayError('invalid_gateway_response'); }
  if (url.protocol !== 'https:' || !(upload ? url.hostname === 'assets.88api.ai' : hosts.has(url.hostname))
    || (url.port && url.port !== '443') || url.username || url.password) throw new GatewayError('unsupported_media_origin');
  return url;
}

export async function downloadSupplierMedia(fetcher: typeof fetch, address: string, signal: AbortSignal, maxBytes = 64 * 1024 * 1024, hosts = deliveryHosts): Promise<Response> {
  let url = mediaURL(address, false, hosts);
  for (let redirects = 0; redirects <= 4; redirects++) {
    mediaURL(url.href, false, hosts);
    const response = await fetcher(url.href, { method: 'GET', redirect: 'manual', signal, headers: {} });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new GatewayError('invalid_gateway_response');
      try { url = new URL(location, url); } catch { throw new GatewayError('invalid_gateway_response'); }
      continue;
    }
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new GatewayError('invalid_gateway_response'); }
    const reader = response.body.getReader(); let bytes = 0;
    return new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const item = await reader.read();
          if (item.done) { if (!bytes) throw new GatewayError('invalid_gateway_response'); controller.close(); return; }
          bytes += item.value.byteLength;
          if (bytes > maxBytes) throw new GatewayError('invalid_gateway_response');
          controller.enqueue(item.value);
        } catch (error) { await reader.cancel().catch(() => undefined); controller.error(error); }
      },
      cancel() { return reader.cancel(); }
    }), { headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream' } });
  }
  throw new GatewayError('invalid_gateway_response');
}

export type MediaUploader = (bytes: Buffer, mime: string) => Promise<string>;

export async function uploadSupplierMedia(bytes: Buffer, mime: string, fetcher: typeof fetch,
  authorize: (body: Record<string, unknown>) => Promise<Response>, signal: AbortSignal): Promise<string> {
  if (!bytes.length || bytes.length > 100_000_000 || !/^(image|audio|video)\/[a-z0-9.+-]+$/i.test(mime)) throw new GatewayError('capability_unsupported', 400);
  const permit = await (await authorize({ size: bytes.length, mime_type: mime, sha256: createHash('sha256').update(bytes).digest('base64url') })).json();
  const target = mediaURL(permit.upload_url, true); const result = mediaURL(permit.url, true);
  const headers = new Headers(permit.headers);
  if (permit.method !== 'PUT' || headers.get('content-type') !== mime || !headers.get('x-media-upload-token')
    || [...headers.keys()].some(name => !['content-type', 'x-media-upload-token'].includes(name))) throw new GatewayError('invalid_gateway_response');
  let uploaded: Response | undefined;
  try { uploaded = await fetcher(target.href, { method: 'PUT', redirect: 'error', signal, headers, body: new Uint8Array(bytes) }); }
  catch { signal.throwIfAborted(); }
  if (uploaded?.status === 201) { await uploaded.body?.cancel(); return result.href; }
  const ambiguous = !uploaded || uploaded.status === 409 || uploaded.status >= 500;
  await uploaded?.body?.cancel();
  if (ambiguous) {
    const existing = await fetcher(result.href, { method: 'HEAD', redirect: 'error', signal, headers: {} });
    if (existing.ok && existing.headers.get('content-length') === String(bytes.length) && existing.headers.get('content-type')?.split(';')[0] === mime) return result.href;
    await existing.body?.cancel();
  }
  throw new GatewayError('media_upload_failed', 503);
}

export async function publicMediaReference(value: unknown, upload: MediaUploader): Promise<string> {
  if (typeof value !== 'string' || !value) throw new GatewayError('capability_unsupported', 400);
  const data = /^data:((?:image|audio|video)\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (data) return upload(Buffer.from(data[2]!, 'base64'), data[1]!);
  let url: URL;
  try { url = new URL(value); } catch { throw new GatewayError('capability_unsupported', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443'
    || /^(localhost|.*\.localhost|.*\.local|\[.*\]|[\d.]+)$/i.test(url.hostname)) throw new GatewayError('capability_unsupported', 400);
  return value;
}
