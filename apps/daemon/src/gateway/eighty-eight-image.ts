import type { GatewayModel } from '@opencreator/protocol';
import { GatewayError } from './client.js';
import { publicMediaReference, type MediaUploader } from './supplier-media.js';

const imageSizes: Record<string, string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };
const unsupported = () => new GatewayError('capability_unsupported', 400);

export async function eightyEightImageRequest(resource: string, body: unknown, contentType: string, model?: GatewayModel, upload?: MediaUploader) {
  const form = resource === 'images/edits' && Buffer.isBuffer(body)
    ? await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) }).formData() : undefined;
  const fields: Record<string, unknown> = form ? Object.fromEntries([...form].filter(([, v]) => typeof v === 'string')) : { ...(body as Record<string, unknown>) };
  if (form) fields.n = Number(form.get('n') ?? 1);
  const { aspect_ratio, resolution, size, ...native } = fields;
  const options = model?.imageOptions;
  const id = String(native.model ?? ''); const lower = id.toLowerCase();
  const count = native.n ?? 1;
  const valid = (v: unknown, allowed?: string[]) => v === undefined || v === '' || typeof v === 'string' && !!allowed?.includes(v);
  if (!id || model && id !== model.id || typeof native.prompt !== 'string' || !native.prompt.trim()
    || native.stream !== undefined && native.stream !== false || typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > (options?.maxImages ?? 10)
    || options && (!valid(aspect_ratio, options.aspectRatios) || !valid(resolution, options.resolutions) || !valid(native.quality, options.qualities) || !valid(native.output_format, options.outputFormats))) throw unsupported();
  const files = form ? [...form].filter(([name, value]) => ['image', 'image[]'].includes(name) && typeof value !== 'string').map(([, v]) => v as File) : [];
  const refs = Array.isArray(native.images) ? native.images : native.image ? [native.image] : [];
  if (files.length + refs.length > (options?.maxReferences ?? 16) || (files.length + refs.length > 0 && model && !model.capabilities.includes('edit'))
    || (resource === 'images/edits' || model?.capabilities.includes('reference_required')) && !files.length && !refs.length) throw unsupported();
  delete native.stream; delete native.image; delete native.images;
  if (lower.startsWith('gemini-')) {
    if (count !== 1 || aspect_ratio || resolution || native.quality || native.output_format) throw unsupported();
    const images = [...refs];
    for (const file of files) images.push(`data:${file.type || 'image/png'};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`);
    if (images.some(v => typeof v !== 'string')) throw unsupported();
    return { resource: 'chat/completions', body: { model: id, stream: false, messages: [{ role: 'user', content: images.length
      ? [{ type: 'text', text: native.prompt }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] : native.prompt }] }, contentType: 'application/json' };
  }
  if (lower.startsWith('midjourney-')) {
    if (count !== 1 || files.length || refs.length || resolution || native.quality || native.output_format) throw unsupported();
    let prompt = native.prompt;
    const existing = /--(?:ar|aspect)\s+(\d+:\d+)\b/.exec(prompt)?.[1];
    if (aspect_ratio && existing && aspect_ratio !== existing) throw unsupported();
    if (aspect_ratio && !existing) prompt += ` --ar ${aspect_ratio}`;
    return { resource: 'images/generations', body: { model: id, prompt }, contentType: 'application/json' };
  }
  native.n = count; native.response_format = 'b64_json';
  if (lower.includes('seedream')) {
    if (resolution && native.quality && resolution !== native.quality) throw unsupported();
    native.size = resolution || (['1K', '2K'].includes(String(size)) ? size : undefined) || native.quality || '1K';
    if (files.length > 1 || refs.length) {
      if (!upload) throw unsupported();
      const images = await Promise.all(refs.map(ref => publicMediaReference(ref, upload)));
      for (const file of files) images.push(await upload(Buffer.from(await file.arrayBuffer()), file.type || 'image/png'));
      native.images = images;
      return { resource: 'images/generations', body: native, contentType: 'application/json' };
    }
  } else if (lower.startsWith('gpt-image-')) {
    if (resolution && resolution !== '1K' || aspect_ratio && !imageSizes[String(aspect_ratio)]) throw unsupported();
    native.size = aspect_ratio ? imageSizes[String(aspect_ratio)] : size || '1024x1024';
    if (!['auto', ...Object.values(imageSizes)].includes(String(native.size))) throw unsupported();
  } else if (lower.startsWith('grok-imagine-')) {
    if (resolution || aspect_ratio || native.quality || native.output_format) throw unsupported();
    if (size) native.size = size;
  } else throw unsupported();
  if (refs.length) native.images = refs;
  if (!files.length) return { resource, body: native, contentType: 'application/json' };
  const converted = new FormData();
  for (const [name, value] of Object.entries(native)) converted.set(name, String(value));
  for (const file of files) converted.append(files.length > 1 ? 'image[]' : 'image', file);
  const request = new Request('http://localhost', { method: 'POST', body: converted });
  return { resource: 'images/edits', body: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get('content-type')! };
}

export function eightyEightImageResult(payload: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(payload.data)) return payload;
  const data: Array<{ b64_json?: string; url?: string }> = [];
  const seen = new Set<string>();
  const address = (value: unknown) => {
    if (typeof value !== 'string' || seen.has(value)) return;
    const match = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(value);
    if (match) data.push({ b64_json: match[1] });
    else if (value.startsWith('https://')) data.push({ url: value });
    else return;
    seen.add(value);
  };
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || !value) return;
    if (typeof value === 'string') {
      if (value.startsWith('data:image/')) address(value);
      for (const match of value.matchAll(/!\[[^\]]*\]\((data:image\/[^\s)]+|https:\/\/[^\s)]+)\)/g)) address(match[1]);
    } else if (Array.isArray(value)) value.forEach(v => visit(v, depth + 1));
    else if (typeof value === 'object') {
      const item = value as Record<string, any>;
      if (typeof item.b64_json === 'string') data.push({ b64_json: item.b64_json });
      if ((item.inlineData?.mimeType ?? item.inline_data?.mime_type)?.startsWith('image/')) data.push({ b64_json: item.inlineData?.data ?? item.inline_data?.data });
      address(typeof item.image_url === 'string' ? item.image_url : item.image_url?.url);
      if (['image_url', 'output_image', 'image'].includes(item.type)) address(item.url);
      for (const key of ['content', 'images', 'parts']) visit(item[key], depth + 1);
    }
  };
  const choices = payload.choices as Array<{ message?: unknown }> | undefined;
  visit(choices?.[0]?.message);
  return { ...payload, data };
}
