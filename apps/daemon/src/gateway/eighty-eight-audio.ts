import { GatewayError } from './client.js';

export async function eightyEightTranscriptionRequest(body: unknown, contentType: string) {
  if (!Buffer.isBuffer(body)) throw new GatewayError('capability_unsupported', 400);
  const form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(body) }).formData();
  const file = form.get('file'); const model = form.get('model'); const format = form.get('response_format');
  if (!file || typeof file === 'string' || !file.size || file.size > 15_000_000 || typeof model !== 'string' || !model
    || format && !['json', 'text'].includes(String(format)) || [...form.keys()].some(k => k.startsWith('timestamp_granularities'))) throw new GatewayError('capability_unsupported', 400);
  const converted = new FormData(); converted.set('file', file); converted.set('model', model);
  const prompt = form.get('prompt'); if (typeof prompt === 'string') converted.set('prompt', prompt);
  const request = new Request('http://localhost', { method: 'POST', body: converted });
  return { body: Buffer.from(await request.arrayBuffer()), contentType: request.headers.get('content-type')! };
}
