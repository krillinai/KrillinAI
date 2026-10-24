import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { GatewayModel } from '@opencreator/protocol';
import type { GatewayBootstrap } from '../../src/gateway/client.js';
import { createOfficialModelAccess, isModelAccessFailure, modelAccessGroup, officialModelPolicy } from '../../src/gateway/model-access.js';

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const text = (id: string): GatewayModel => ({ id, modality: 'text', capabilities: ['responses'] });
const bootstrap = (models: GatewayModel[]): GatewayBootstrap => ({
  schemaVersion: 1, transport: 'openrouter-direct', account: { id: 'account-a', email: 'a@test', verified: true },
  modelKey: 'private-model-key', keyVersion: 'key-v1', bindingVersion: 'binding-v1', baseUrl: 'https://openrouter.ai/api/v1',
  models, defaults: { text: models.find(model => model.modality === 'text')!.id }
});
const facts = { kind: 'http-rejected' as const, httpStatus: 403, upstreamMessage: 'Model unavailable in this country' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function fixture(models: GatewayModel[]) {
  const root = await mkdtemp(join(tmpdir(), 'oc-model-access-')); roots.push(root);
  let proxy = 'http://127.0.0.1:7897'; let ip = '203.0.113.1'; let country = 'JP';
  let catalogIDs = models.map(model => model.id);
  let imageProfiles: unknown[] = []; let videoProfiles: unknown[] = [];
  let catalogReply = (_url: URL): Response | Promise<Response> => Response.json({ data: catalogIDs.map(id => ({ id })) });
  const fetcher = vi.fn<typeof fetch>(async (target, options) => {
    expect(options?.method ?? 'GET').toBe('GET');
    expect(options?.body).toBeUndefined();
    if (String(target).endsWith('/cdn-cgi/trace')) return new Response(`ip=${ip}\nloc=${country}\n`);
    const url = new URL(String(target));
    if (url.pathname === '/api/v1/images/models') return Response.json({ data: imageProfiles });
    if (url.pathname === '/api/v1/videos/models') return Response.json({ data: videoProfiles });
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/api/v1/models/user');
    expect(url.searchParams.get('output_modalities')).toBe('all');
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer private-model-key');
    return catalogReply(url);
  });
  const input = { dataDir: root, fetcher, readProxy: async () => proxy };
  const access = createOfficialModelAccess(input); const value = bootstrap(models);
  const run = (target = value) => access.refresh(target, new AbortController().signal, async () => undefined);
  const catalogCalls = () => fetcher.mock.calls.filter(([url]) => String(url).includes('/models/user?'));
  return { root, input, access, value, run, fetcher, catalogCalls,
    setIP(value: string) { ip = value; }, setProxy(value: string) { proxy = value; }, setCountry(value: string) { country = value; },
    setImageProfiles(profiles: unknown[]) { imageProfiles = profiles; }, setVideoProfiles(profiles: unknown[]) { videoProfiles = profiles; },
    setCatalogIDs(ids: string[]) { catalogIDs = ids; }, setCatalogReply(reply: typeof catalogReply) { catalogReply = reply; } };
}

it.each([undefined, 2])('excludes retired image models even when catalog schema %s advertises them', catalogSchema => {
  const models: GatewayModel[] = ['gpt-image-1', 'openai/gpt-image-1', 'gpt-image-2'].map(id => ({ id, catalogSchema, modality: 'image', capabilities: ['generate'] }));
  expect(officialModelPolicy(models).map(model => model.id)).toEqual(['gpt-image-2']);
});

it('retains unsupported Anthropic, router and batch filtering', () => {
  expect(modelAccessGroup(text('~openai/gpt-6-sol'))).toBe('openai');
  expect(modelAccessGroup(text('openai/gpt-oss-20b'))).toBe('openai-oss');
  expect(modelAccessGroup(text('google/gemma-3-12b-it'))).toBe('google-gemma');
  expect(modelAccessGroup(text('google/gemini-2.5-flash'))).toBe('google-gemini');
  expect(officialModelPolicy(['anthropic/claude-sonnet-4.6', '~anthropic/claude-opus-4.6', 'openai/gpt-4.1:batch', 'openrouter/auto', 'deepseek/deepseek-v3.2'].map(text)).map(model => model.id))
    .toEqual(['deepseek/deepseek-v3.2']);
});

it('immediately admits every compatible catalog model without paid inference or per-model limits', async () => {
  const models = [text('deepseek/deepseek-v3.2'), ...Array.from({ length: 20 }, (_, i) => text(`vendor/model-${i}`))];
  const f = await fixture(models);
  expect((await f.access.prepare(f.value)).models).toEqual(models);
  await f.run();
  expect(f.catalogCalls()).toHaveLength(1);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  const saved = await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8');
  expect(saved).not.toMatch(/private-model-key|203\.0\.113|a@test/);
});

it('excludes Anthropic from fresh and cached catalogs and replaces an unsupported default', async () => {
  const supported = [text('deepseek/deepseek-v3.2')];
  const f = await fixture([text('anthropic/claude-sonnet-4.6'), text('~anthropic/claude-opus-4.6'), ...supported]);
  expect(f.value.defaults.text).toBe('anthropic/claude-sonnet-4.6');
  expect(await f.access.prepare(f.value)).toMatchObject({ models: supported, defaults: { text: supported[0]!.id } });
  expect(f.access.filter(f.value)).toMatchObject({ models: supported, defaults: { text: supported[0]!.id } });
  f.setCatalogReply(() => Response.json({}, { status: 503 }));
  const restored = createOfficialModelAccess(f.input);
  expect(await restored.prepare(f.value)).toMatchObject({ models: supported, defaults: { text: supported[0]!.id } });
});

it('admits all catalog media independently of internal verification and subtitle-specific capabilities', async () => {
  const verification = { adapterVersion: 2, verifiedAt: '2026-10-14T00:00:00Z', countries: ['JP'] };
  const media: GatewayModel[] = [
    { id: 'vendor/image', modality: 'image', capabilities: [], verification },
    { id: 'vendor/video', modality: 'video', capabilities: [], verification },
    { id: 'vendor/tts', modality: 'speech', capabilities: [], verification },
    { id: 'vendor/asr', modality: 'transcription', capabilities: ['subtitle_timestamps'], verification },
    { id: 'vendor/asr-json-only', modality: 'transcription', capabilities: [], verification },
    { id: 'vendor/image-untested', modality: 'image', capabilities: [] },
    { id: 'vendor/image-other-country', modality: 'image', capabilities: [], verification: { ...verification, countries: ['US'] } },
    { id: 'vendor/image-no-country', modality: 'image', capabilities: [], verification: { ...verification, countries: [] } },
    { id: 'vendor/image-old-adapter', modality: 'image', capabilities: [], verification: { ...verification, adapterVersion: 1 } },
    { id: 'vendor/text-without-responses', modality: 'text', capabilities: [] }
  ];
  const f = await fixture([text('vendor/text'), ...media]);
  const approved = ['vendor/text', ...media.filter(model => model.modality !== 'text').map(model => model.id)];
  await f.run();
  expect(f.access.filter(f.value).models.map(model => model.id)).toEqual(approved);
  f.setCountry('US'); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001); await f.run();
  expect(f.access.filter(f.value).models.map(model => model.id)).toEqual(approved);
});

it('refreshes official media capabilities and persists them without verification metadata', async () => {
  const f = await fixture([text('vendor/text'),
    { id: 'vendor/image', modality: 'image', capabilities: ['edit'] },
    { id: 'vendor/video', modality: 'video', capabilities: ['image_to_video'], sizes: ['1280x720'], durations: [5] },
    { id: 'vendor/speech', modality: 'speech', capabilities: ['default_voice'], voices: ['old'] }
  ]);
  f.setCatalogReply(() => Response.json({ data: [
    { id: 'vendor/text', architecture: { output_modalities: ['text'] } },
    { id: 'vendor/image', architecture: { output_modalities: ['image'] } },
    { id: 'vendor/video', architecture: { output_modalities: ['video'] } },
    { id: 'vendor/speech', architecture: { output_modalities: ['speech'] }, supported_voices: ['native'] }
  ] }));
  f.setImageProfiles([{ id: 'vendor/image', supported_parameters: {
    aspect_ratio: { type: 'enum', values: ['1:1'] }, n: { type: 'range', min: 1, max: 1 }
  } }]);
  f.setVideoProfiles([{ id: 'vendor/video', supported_sizes: null, supported_resolutions: ['1080p'],
    supported_aspect_ratios: ['9:16'], supported_durations: [12], supported_frame_images: [] }]);
  const models = (await f.access.prepare(f.value)).models;
  expect(models.find(model => model.modality === 'image')).toMatchObject({ capabilities: [], imageOptions: { maxImages: 1, maxReferences: 0, aspectRatios: ['1:1'] } });
  expect(models.find(model => model.modality === 'video')).toMatchObject({ capabilities: [], sizes: [], resolutions: ['1080p'], aspectRatios: ['9:16'], durations: [12] });
  expect(models.find(model => model.modality === 'speech')).toMatchObject({ capabilities: [], voices: ['native'] });
  expect(JSON.parse(await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8')).catalogModels).toEqual(models);
  await f.access.recordFailure(f.access.context(), models.find(model => model.modality === 'image')!, facts);
  expect(f.access.filter(f.value).models.some(model => model.modality === 'image')).toBe(false);
});

it('uses existing gateway media parameters when optional official capability discovery fails', async () => {
  const image: GatewayModel = { id: 'vendor/image', modality: 'image', capabilities: [], imageOptions: { maxImages: 1, maxReferences: 0 } };
  const f = await fixture([text('vendor/text'), image]);
  const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => String(url).includes('/images/models')
    ? Promise.reject(new Error('Unavailable metadata')) : original(url, options));
  expect((await f.access.prepare(f.value)).models).toEqual(f.value.models);
  expect(f.access.catalogAvailable()).toBe(true);
});

it('does not admit a model into a modality its official architecture cannot produce', async () => {
  const f = await fixture([text('vendor/text'), { id: 'vendor/image', modality: 'image', capabilities: [] }]);
  f.setCatalogReply(() => Response.json({ data: [{ id: 'vendor/text' }, { id: 'vendor/image', architecture: { output_modalities: ['text'] } }] }));
  expect((await f.access.prepare(f.value)).models.map(model => model.id)).toEqual(['vendor/text']);
});

it('intersects both text and media with the customer catalog and chooses visible defaults', async () => {
  const image: GatewayModel = { id: 'vendor/image', modality: 'image', capabilities: [], verification: { adapterVersion: 2, verifiedAt: '2026-10-14T00:00:00Z', countries: [] } };
  const f = await fixture([text('vendor/one'), text('vendor/two'), image]);
  f.setCatalogIDs(['vendor/two', 'other/unadapted']); await f.run();
  expect(f.access.filter(f.value)).toMatchObject({ models: [text('vendor/two')], defaults: { text: 'vendor/two' } });
});

it('caches complete catalogs for five minutes and supports an immediate explicit refresh', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]);
  const start = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
  await f.run(); f.setCatalogIDs(['vendor/two']);
  clock.mockReturnValue(start + 60_001); await f.run();
  expect(f.catalogCalls()).toHaveLength(1);
  expect(f.access.filter(f.value).models).toHaveLength(2);
  f.access.invalidateCatalog(); await f.run();
  expect(f.catalogCalls()).toHaveLength(2);
  expect(f.access.filter(f.value).defaults.text).toBe('vendor/two');
  clock.mockReturnValue(start + 360_002); await f.run();
  expect(f.catalogCalls()).toHaveLength(3);
});

it('loads every page atomically, deduplicates IDs and never follows arbitrary next URLs', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]);
  f.setCatalogReply(url => url.searchParams.get('offset') === '0'
    ? Response.json({ data: [{ id: 'vendor/one' }], total_count: 2, links: { next: '/api/v1/models?offset=1000' } })
    : Response.json({ data: [{ id: 'vendor/one' }, { id: 'vendor/two' }], total_count: 2, links: { next: null } }));
  await f.run(); expect(f.catalogCalls()).toHaveLength(2);
  expect(f.access.filter(f.value).models).toEqual(f.value.models);
  const saved = JSON.parse(await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8'));
  expect(saved.catalogIDs).toEqual(['vendor/one', 'vendor/two']);
  f.access.invalidateCatalog();
  f.setCatalogReply(() => Response.json({ data: [{ id: 'vendor/two' }], links: { next: 'https://untrusted.example/api/v1/models/user?offset=1000' } }));
  await f.run();
  expect(f.access.filter(f.value).models).toEqual(f.value.models);
  expect(f.catalogCalls()).toHaveLength(3);
});

it.each(['/api/v1/models/user?offset=0', '/api/v1/other?offset=1000'])('rejects invalid pagination %s without publishing a partial first catalog', async next => {
  const f = await fixture([text('vendor/one')]);
  f.setCatalogReply(() => Response.json({ data: [{ id: 'vendor/one' }], links: { next } }));
  await f.run(); expect(f.access.filter(f.value).models).toEqual([]);
  expect(f.access.catalogAvailable()).toBe(false);
});

it('bounds pagination and rejects catalogs that remain incomplete after ten pages', async () => {
  const f = await fixture([text('vendor/one')]);
  f.setCatalogReply(url => Response.json({ data: [{ id: 'vendor/one' }], links: { next: `/api/v1/models/user?offset=${Number(url.searchParams.get('offset')) + 1000}` } }));
  await f.run(); expect(f.catalogCalls()).toHaveLength(10);
  expect(f.access.filter(f.value).models).toEqual([]);
});

it('does not publish a truncated directory when total_count disagrees with its last page', async () => {
  const f = await fixture([text('vendor/one')]);
  f.setCatalogReply(() => Response.json({ data: [text('vendor/one')], total_count: 2, links: { next: null } }));
  await f.run(); expect(f.access.filter(f.value).models).toEqual([]);
});

it('coalesces concurrent directory requests', async () => {
  const f = await fixture([text('vendor/one')]); const waiting = deferred<Response>();
  f.setCatalogReply(() => waiting.promise);
  const a = f.access.prepare(f.value); const b = f.access.prepare(f.value);
  await expect.poll(() => f.catalogCalls().length).toBe(1);
  waiting.resolve(Response.json({ data: f.value.models }));
  expect((await a).models).toEqual(f.value.models); expect((await b).models).toEqual(f.value.models);
});

it('uses a successful directory even when exit detection fails', async () => {
  const f = await fixture([text('vendor/one')]);
  f.fetcher.mockRejectedValueOnce(new Error('trace unavailable'));
  await f.run(); expect(f.access.filter(f.value).models).toEqual(f.value.models);
  expect(f.access.context()).not.toBe('');
});

it('retains a fresh catalog on temporary errors but hides expired results and retries with backoff', async () => {
  const f = await fixture([text('vendor/one')]);
  const start = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
  await f.run();
  f.setCatalogReply(() => { throw new Error('private-model-key'); }); f.access.invalidateCatalog();
  await f.run(); expect(f.access.filter(f.value).models).toEqual(f.value.models);
  const calls = f.catalogCalls().length; await f.run(); expect(f.catalogCalls()).toHaveLength(calls);
  clock.mockReturnValue(start + 300_001); await f.run(); expect(f.access.filter(f.value).models).toEqual([]);
  expect(f.access.catalogAvailable()).toBe(false);
  expect(await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8')).not.toContain('private-model-key');
});

it.each([401, 403])('revokes a cached directory immediately on HTTP %s', async status => {
  const f = await fixture([text('vendor/one')]); await f.run();
  f.setCatalogReply(() => Response.json({ error: { message: 'Forbidden' } }, { status })); f.access.invalidateCatalog();
  await f.run(); expect(f.access.filter(f.value).models).toEqual([]);
  expect(f.access.needsKeyRefresh()).toBe(status === 401);
});

it('distinguishes a successful empty directory from a failed directory', async () => {
  const f = await fixture([text('vendor/one')]); f.setCatalogIDs([]); await f.run();
  expect(f.access.filter(f.value)).toMatchObject({ models: [], defaults: {} });
  expect(f.access.catalogAvailable()).toBe(true);
});

it('reuses an unexpired persisted catalog when a startup refresh is unavailable', async () => {
  const f = await fixture([text('vendor/one')]); await f.run();
  f.setCatalogReply(() => Response.json({}, { status: 503 }));
  const restored = createOfficialModelAccess(f.input);
  expect((await restored.prepare(f.value)).models).toEqual(f.value.models);
});

it('keeps catalog admission separate from successful inference evidence and expires success after five minutes', async () => {
  const f = await fixture([text('vendor/one')]);
  const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  await f.run();
  expect(f.access.availability(f.value)).toEqual([{ model: 'vendor/one', modality: 'text', status: 'unverified' }]);
  await f.access.recordSuccess(f.access.context(), f.value.models[0]!, 'responses');
  expect(f.access.availability(f.value)).toEqual([{ model: 'vendor/one', modality: 'text', status: 'recent_success', operation: 'responses', checkedAt: new Date(now).toISOString() }]);
  clock.mockReturnValue(now + 300_001); await f.run();
  expect(f.access.availability(f.value)[0]?.status).toBe('unverified');
  expect(f.access.filter(f.value).models).toEqual(f.value.models);
});

it('persists safe operation-specific success and discards it when the key, proxy, or exit changes', async () => {
  const f = await fixture([text('vendor/one')]); await f.run();
  await f.access.recordSuccess(f.access.context(), f.value.models[0]!, 'responses');
  const restored = createOfficialModelAccess(f.input); await restored.prepare(f.value);
  expect(restored.availability(f.value)[0]).toMatchObject({ status: 'recent_success', operation: 'responses' });
  expect(await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8')).not.toMatch(/private-model-key|203\.0\.113/);
  f.setProxy('http://127.0.0.1:8999'); await f.run();
  expect(f.access.availability(f.value)[0]?.status).toBe('unverified');
  await f.access.recordSuccess(f.access.context(), f.value.models[0]!, 'chat/completions');
  const previous = f.access.context(); f.setIP('203.0.113.2');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001); await f.run();
  expect(await f.access.recordSuccess(previous, f.value.models[0]!, 'responses')).toBe(false);
  expect(f.access.availability(f.value)[0]?.status).toBe('unverified');
  clock.mockRestore();
  await f.access.recordSuccess(f.access.context(), f.value.models[0]!, 'responses');
  // Fixture expects the original bearer; keep only the directory response for this key-change check.
  f.fetcher.mockImplementation(async target => String(target).endsWith('/trace') ? new Response('ip=203.0.113.2\nloc=JP\n') : Response.json({ data: f.value.models }));
  const changed = { ...f.value, modelKey: 'replacement-key' };
  await f.run(changed);
  expect(f.access.availability(changed)[0]?.status).toBe('unverified');
});

it('keeps explicit access rejections ahead of a parallel success and leaves transient errors selectable', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]); await f.run();
  const context = f.access.context();
  await f.access.recordSuccess(context, f.value.models[0]!, 'responses');
  await f.access.recordFailure(context, f.value.models[0]!, facts);
  expect(await f.access.recordSuccess(context, f.value.models[0]!, 'responses')).toBe(false);
  expect(f.access.availability(f.value)[0]?.status).toBe('restricted');
  expect(await f.access.recordFailure(context, f.value.models[1]!, { kind: 'http-rejected', httpStatus: 429, upstreamMessage: 'Rate limit exceeded' })).toBe(false);
  expect(f.access.availability(f.value)[1]?.status).toBe('unverified');
  expect(f.access.filter(f.value).models).toEqual([text('vendor/two')]);
});

it('clears recent success after a transient failure without quarantining the model', async () => {
  const f = await fixture([text('vendor/one')]); await f.run();
  await f.access.recordSuccess(f.access.context(), f.value.models[0]!, 'responses');
  await f.access.recordFailure(f.access.context(), f.value.models[0]!, { kind: 'http-rejected', httpStatus: 503, upstreamMessage: 'Provider temporarily unavailable' });
  expect(f.access.availability(f.value)[0]?.status).toBe('unverified');
  expect(f.access.filter(f.value).models).toEqual(f.value.models);
});

it('quarantines only the exact failed model until a fresh directory clears an expired rejection', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]);
  const start = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
  await f.run(); const scope = f.access.context();
  expect(await f.access.recordFailure(scope, f.value.models[0]!, facts)).toBe(true);
  await f.run(); expect(f.access.filter(f.value).models).toEqual([text('vendor/two')]);
  clock.mockReturnValue(start + 3_599_999); await f.run();
  clock.mockReturnValue(start + 3_600_001);
  f.setCatalogReply(() => Response.json({}, { status: 503 })); await f.run();
  expect(f.access.filter(f.value).models).toEqual([text('vendor/two')]);
  f.setCatalogReply(() => Response.json({ data: f.value.models })); clock.mockReturnValue(start + 3_630_002); await f.run();
  expect(f.access.filter(f.value).models).toEqual(f.value.models);
});

it('quarantines approved media too without charging a test request', async () => {
  const image: GatewayModel = { id: 'vendor/image', modality: 'image', capabilities: [], verification: { adapterVersion: 2, verifiedAt: '2026-10-14T00:00:00Z', countries: [] } };
  const f = await fixture([text('vendor/one'), image]); await f.run();
  expect(await f.access.recordFailure(f.access.context(), image, facts)).toBe(true);
  await f.run(); expect(f.access.filter(f.value).models).toEqual([text('vendor/one')]);
});

it('rejects stale network feedback and invalidates cached results for accounts, keys and proxies', async () => {
  const f = await fixture([text('vendor/one')]); await f.run(); const previous = f.access.context();
  f.setIP('203.0.113.2'); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001); await f.run();
  expect(await f.access.recordFailure(previous, f.value.models[0]!, facts)).toBe(false);
  const key = { ...f.value, keyVersion: 'key-v2' };
  expect(f.access.filter(key).models).toEqual([]); await f.run(key);
  const account = { ...key, account: { ...key.account, id: 'account-b' } };
  expect(f.access.filter(account).models).toEqual([]); await f.run(account);
  f.setProxy('http://127.0.0.1:8888'); await f.run(account);
  expect(f.catalogCalls()).toHaveLength(5);
});

it('does not let an old account response overwrite a newer account catalog', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]); const old = deferred<Response>();
  f.setCatalogReply(() => old.promise); const first = f.access.prepare(f.value);
  await expect.poll(() => f.catalogCalls().length).toBe(1);
  f.setCatalogReply(() => Response.json({ data: [text('vendor/two')] }));
  const newer = { ...f.value, account: { ...f.value.account, id: 'account-b' } };
  expect((await f.access.prepare(newer)).models).toEqual([text('vendor/two')]);
  old.resolve(Response.json({ data: [text('vendor/one')] }));
  expect((await first).models).toEqual([]);
  expect(f.access.filter(newer).models).toEqual([text('vendor/two')]);
});

it('reset aborts directory work and prevents a late response from restoring visible models', async () => {
  const f = await fixture([text('vendor/one')]); const waiting = deferred<Response>();
  f.setCatalogReply(() => waiting.promise); const work = f.access.prepare(f.value);
  await expect.poll(() => f.catalogCalls().length).toBe(1);
  const signal = f.catalogCalls()[0]![1]!.signal!;
  f.access.reset(); expect(signal.aborted).toBe(true);
  waiting.resolve(Response.json({ data: f.value.models })); await work;
  expect(f.access.filter(f.value).models).toEqual([]); expect(f.access.context()).toBe('');
});

it('migrates only unexpired exact rejections from version 2, discarding probe admission states', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]); await f.run();
  await f.access.recordFailure(f.access.context(), f.value.models[0]!, facts);
  const path = join(f.root, 'config/gateway-model-access.json'); const saved = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...saved, version: 2, models: {
    'text:vendor/one': { ...saved.models['text:vendor/one'], status: 'blocked', nextCheck: Date.now() + 3_600_000, validUntil: 0 },
    'text:vendor/two': { status: 'unknown', profile: 'old-profile', nextCheck: Date.now() + 3_600_000, validUntil: 0 }
  } }));
  const restored = createOfficialModelAccess(f.input);
  expect((await restored.prepare(f.value)).models).toEqual([text('vendor/two')]);
  const migrated = JSON.parse(await readFile(path, 'utf8'));
  expect(migrated.version).toBe(3); expect(Object.keys(migrated.models)).toEqual(['text:vendor/one']);
});

it('discards obsolete family caches and ignores a rejection for a changed adapter profile', async () => {
  const f = await fixture([text('vendor/one')]); await mkdir(join(f.root, 'config'), { recursive: true });
  await writeFile(join(f.root, 'config/gateway-model-access.json'), JSON.stringify({ version: 1, groups: { vendor: { status: 'blocked' } } }));
  await f.run(); expect(f.access.filter(f.value).models).toEqual(f.value.models);
  await f.access.recordFailure(f.access.context(), f.value.models[0]!, facts);
  const changed = { ...f.value, models: [{ ...f.value.models[0]!, capabilities: ['responses', 'changed-contract'] }] };
  expect(f.access.filter(changed).models).toEqual(changed.models);
});

it.each([
  [402, 'Insufficient credits', false], [403, 'Key limit exceeded', false],
  [403, 'Content policy violation', false], [403, 'Forbidden', false],
  [429, 'Rate limit exceeded', false], [503, 'Provider unavailable', false],
  [403, 'Model unavailable in this country', true], [403, 'Permission denied for this model', true],
  [404, 'No endpoints found for this model', true],
  [400, 'The selected model does not support response_format "verbose_json"', false]
])('classifies HTTP %s %s without conflating access and request failures', (httpStatus, upstreamMessage, expected) => {
  expect(isModelAccessFailure({ kind: 'http-rejected', httpStatus: httpStatus as number, upstreamMessage: upstreamMessage as string })).toBe(expected);
});

it('recognizes explicit geographic failures in accepted jobs and HTTP 200 error bodies', () => {
  expect(isModelAccessFailure({ kind: 'provider-failed', upstreamCode: 'provider_error', upstreamMessage: facts.upstreamMessage })).toBe(true);
  expect(isModelAccessFailure({ kind: 'provider-failed', httpStatus: 200, upstreamCode: '403', upstreamMessage: facts.upstreamMessage })).toBe(true);
  expect(isModelAccessFailure({ kind: 'provider-failed', upstreamCode: 'provider_error', upstreamMessage: 'Temporarily unavailable' })).toBe(false);
});
