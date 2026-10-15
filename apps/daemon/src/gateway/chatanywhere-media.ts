import type { GatewayModel } from '@opencreator/protocol';
import { GatewayError } from './client.js';

const unsupported = () => new GatewayError('capability_unsupported', 400);
const sizes: Record<string, string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };

export async function chatAnywhereTranscription(body: unknown, contentType: string) {
  if (!Buffer.isBuffer(body)) throw unsupported();
  const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) }).formData();
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size || typeof form.get('model') !== 'string') throw unsupported();
  const format = form.get('response_format') ?? 'json';
  if (!['json', 'verbose_json'].includes(String(format))) throw unsupported();
  const native = new FormData();
  for (const [name, value] of form) {
    if (name.startsWith('timestamp_granularities')) {
      // This supplier documents verbose_json segments, not the granularity field.
      if (value !== 'segment') throw unsupported();
      continue;
    }
    if (!['file', 'model', 'prompt', 'language', 'response_format', 'temperature'].includes(name)) throw unsupported();
    if (name === 'temperature' && (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1)) throw unsupported();
    native.append(name, value);
  }
  return multipart(native);
}

export async function chatAnywhereImage(resource: string, body: unknown, contentType: string, model?: GatewayModel) {
  const form = resource === 'images/edits' && Buffer.isBuffer(body)
    ? await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) }).formData() : undefined;
  const fields: Record<string, unknown> = form ? Object.fromEntries([...form].filter(([, v]) => typeof v === 'string')) : { ...(body as Record<string, unknown>) };
  if (form) fields.n = Number(form.get('n') ?? 1);
  const { aspect_ratio, resolution, stream, response_format, ...native } = fields;
  const valid = (v: unknown, options?: string[]) => v === undefined || v === '' || typeof v === 'string' && !!options?.includes(v);
  const count = native.n ?? 1;
  if (!model || model.modality !== 'image' || native.model !== model.id || !model.capabilities.includes(resource === 'images/edits' ? 'edit' : 'generate')
    || typeof native.prompt !== 'string' || !native.prompt.trim() || stream !== undefined && stream !== false
    || typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > (model.imageOptions?.maxImages ?? 1)
    || !valid(aspect_ratio, model.imageOptions?.aspectRatios) || !valid(resolution, model.imageOptions?.resolutions)
    || !valid(native.quality, model.imageOptions?.qualities) || !valid(native.output_format, model.imageOptions?.outputFormats)
    || response_format !== undefined && response_format !== 'b64_json') throw unsupported();
  native.size = aspect_ratio ? sizes[String(aspect_ratio)] : native.size || '1024x1024';
  if (!Object.values(sizes).includes(String(native.size))) throw unsupported();
  native.n = count;
  if (!form) {
    if (resource === 'images/edits') throw unsupported();
    return { body: native, contentType: 'application/json' };
  }
  const files = [...form].filter(([name, value]) => ['image', 'image[]'].includes(name) && typeof value !== 'string').map(([, v]) => v as File);
  if (!model.capabilities.includes('edit') || !files.length || files.length > (model.imageOptions?.maxReferences ?? 0)
    || files.some(file => !file.size || file.size > 25_000_000 || !['image/png', 'image/webp', 'image/jpeg'].includes(file.type))) throw unsupported();
  const converted = new FormData();
  for (const [name, value] of Object.entries(native)) converted.set(name, String(value));
  for (const file of files) converted.append(files.length === 1 ? 'image' : 'image[]', file);
  return multipart(converted);
}

async function multipart(form: FormData) {
  const request = new Request('http://localhost', { method: 'POST', body: form });
  return { body: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get('content-type')! };
}
