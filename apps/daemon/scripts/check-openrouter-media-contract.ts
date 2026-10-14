import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gatewayVideoSizes } from '@opencreator/protocol';
import { createDirectTransport } from '../src/gateway/direct-transport.js';
import { mediaProfile, profileOperations, type MediaCatalogItem } from './openrouter-media-profiles.js';

const [schemaPath, catalogPath] = process.argv.slice(2);
if (!schemaPath || !catalogPath) throw new Error('Supply the official openapi.json and catalog.json paths');
type Schema = { properties?: Record<string, unknown>; [key: string]: unknown };
const contract = JSON.parse(await readFile(schemaPath, 'utf8')) as { components: { schemas: Record<string, Schema> } };
const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as Record<'image' | 'video', MediaCatalogItem[]>;
const schemas = contract.components.schemas;
const fields = {
  ImageGenerationRequest: ['model', 'prompt', 'n', 'stream', 'aspect_ratio', 'resolution', 'quality', 'output_format', 'input_references'],
  VideoGenerationRequest: ['model', 'prompt', 'duration', 'size', 'resolution', 'aspect_ratio', 'frame_images']
};
const requestSchemas = Object.fromEntries(Object.entries(fields).map(([name, properties]) => {
  const schema = schemas[name];
  assert(schema?.properties, `Official schema missing: ${name}`);
  // Validate the normalized fields this adapter owns, excluding unused provider passthrough.
  return [name, { ...schema, additionalProperties: false, properties: Object.fromEntries(properties.map(field => {
    assert(schema.properties![field], `Official request field missing: ${field}`);
    return [field, schema.properties![field]];
  })) }];
}));
const server = Fastify({ ajv: { customOptions: { strict: false, coerceTypes: false, removeAdditional: false, useDefaults: false } } });
server.addSchema({ $id: 'openrouter-media-contract', components: { schemas: { ...requestSchemas, ContentPartImage: schemas.ContentPartImage, FrameImage: schemas.FrameImage } } });
for (const [path, schema] of [['images', 'ImageGenerationRequest'], ['videos', 'VideoGenerationRequest']]) {
  server.post(`/${path}`, { schema: { body: { $ref: `openrouter-media-contract#/components/schemas/${schema}` } } }, async () => ({ valid: true }));
}
const root = await mkdtemp(join(tmpdir(), 'oc-openrouter-contract-'));
let checked = 0;
const fetcher: typeof fetch = async (url, options) => {
  const path = new URL(String(url)).pathname.replace('/api/v1', '');
  assert(['images', 'videos'].some(kind => String(url) === `https://openrouter.ai/api/v1/${kind}`));
  const result = await server.inject({ method: 'POST', url: path, payload: JSON.parse(String(options?.body)) });
  assert.equal(result.statusCode, 200, `Official schema rejected the emitted request: ${result.body}`);
  checked++;
  return Response.json(path === '/images'
    ? { created: 1, data: [{ b64_json: 'aW1hZ2U=', media_type: 'image/png' }] }
    : { id: 'gen-vid-1791880000-a1B2c3D4e5F6g7H8i9J0', status: 'pending', polling_url: '/api/v1/videos/gen-vid-1791880000-a1B2c3D4e5F6g7H8i9J0' });
};
const transport = createDirectTransport(root, fetcher);
try {
  assert.equal((await server.inject({ method: 'POST', url: '/images', payload: { model: 'test', prompt: 'test', response_format: 'b64_json' } })).statusCode, 400);
  assert.equal((await server.inject({ method: 'POST', url: '/videos', payload: { model: 'test', duration: '4' } })).statusCode, 400);
  for (const kind of ['image', 'video'] as const) for (const item of catalog[kind]) {
    const profile = mediaProfile(item, kind);
    const model = profile.model;
    if (!model) continue;
    for (const operation of profileOperations(profile)) {
      let resource: string;
      let body: unknown;
      let contentType = 'application/json';
      if (kind === 'image') {
        const options = model.imageOptions!;
        const fields = { model: model.id, prompt: 'A ceramic cup on a white table.', n: 1, size: '1024x1024', response_format: 'b64_json', aspect_ratio: options.aspectRatios?.[0], resolution: options.resolutions?.[0], quality: options.qualities?.[0] };
        resource = operation === 'image-edit' ? 'images/edits' : 'images/generations';
        body = fields;
        if (operation === 'image-edit') {
          const form = new FormData();
          for (const [name, value] of Object.entries(fields)) if (value !== undefined) form.append(name, String(value));
          form.append('image', new Blob(['test image'], { type: 'image/png' }), 'reference.png');
          const request = new Request('http://localhost', { method: 'POST', body: form });
          contentType = request.headers.get('content-type')!;
          body = Buffer.from(await request.arrayBuffer());
        }
      } else {
        resource = 'video/jobs';
        body = { model: model.id, prompt: 'A ceramic cup on a white table.', duration: model.durations![0], size: gatewayVideoSizes(model)[0], ...(operation === 'image-to-video' ? { image: 'data:image/png;base64,aW1hZ2U=' } : {}) };
      }
      await transport.request({ account: 'contract-check', key: 'no-real-credentials', resource, method: 'POST', body, contentType, identity: `${model.id}:${operation}`, fingerprint: `${model.id}:${operation}`, signal: AbortSignal.timeout(10_000), model });
    }
  }
  process.stdout.write(`${JSON.stringify({ source: 'https://openrouter.ai/openapi.json', schemaPath, checkedOperations: checked, paidSubmissions: 0 })}\n`);
} finally {
  await transport.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
