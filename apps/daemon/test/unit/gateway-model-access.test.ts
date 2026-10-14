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
const success = () => Response.json({ status: 'completed', output: [{ type: 'function_call', name: 'oc_access_check', arguments: '{"ready":true}' }] });
const denied = () => Response.json({ error: { message: 'The request is prohibited due to a violation of provider Terms Of Service.' } }, { status: 403 });
async function fixture(models: GatewayModel[], reply: (id: string) => Response | Promise<Response> = success) {
  const root = await mkdtemp(join(tmpdir(), 'oc-model-access-')); roots.push(root);
  let proxy = 'http://127.0.0.1:7897'; let ip = '203.0.113.1'; let country = 'JP';
  let catalogIDs = models.map(model => model.id);
  const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (target, options) => {
    if (String(target).endsWith('/cdn-cgi/trace')) return new Response(`ip=${ip}\nloc=${country}\n`);
    if (String(target).includes('/models/user?')) {
      expect(new Headers(options?.headers).get('authorization')).toBe('Bearer private-model-key');
      return Response.json({ data: catalogIDs.map(id => ({ id })) });
    }
    const body = JSON.parse(String(options?.body)); calls.push(body.model);
    expect(body).toMatchObject({ store: false, stream: false, max_output_tokens: 512 });
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer platform-probe-key');
    return reply(body.model);
  });
  const readProbeCredentials = vi.fn(async () => ({
    costBearer: 'platform' as const, modelKey: 'platform-probe-key', keyVersion: 'probe-v1',
    baseUrl: 'https://openrouter.ai/api/v1' as const, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  }));
  const input = { dataDir: root, fetcher, readProxy: async () => proxy, readProbeCredentials };
  const access = createOfficialModelAccess(input); const value = bootstrap(models);
  const run = (target = value) => access.refresh(target, new AbortController().signal, async () => undefined);
  return { root, input, access, value, run, calls, fetcher, readProbeCredentials, setIP(value: string) { ip = value; }, setProxy(value: string) { proxy = value; }, setCountry(value: string) { country = value; }, setCatalogIDs(ids: string[]) { catalogIDs = ids; } };
}

it('keeps hosted GPT and Gemini separate from open weight models and removes unsupported catalog entries', () => {
  expect(modelAccessGroup(text('openai/gpt-6-sol'))).toBe('openai');
  expect(modelAccessGroup(text('~openai/gpt-6-sol'))).toBe('openai');
  expect(modelAccessGroup(text('openai/gpt-oss-20b'))).toBe('openai-oss');
  expect(modelAccessGroup(text('google/gemma-3-12b-it'))).toBe('google-gemma');
  expect(modelAccessGroup(text('google/gemini-2.5-flash'))).toBe('google-gemini');
  expect(officialModelPolicy(['anthropic/claude-sonnet-4.6', '~anthropic/claude-opus-4.6', 'openai/gpt-4.1:batch', 'openrouter/auto', 'deepseek/deepseek-v3.2'].map(text)).map(model => model.id)).toEqual(['deepseek/deepseek-v3.2']);
});

it('requires exact media verification in the current country and subtitle-compatible ASR', async () => {
  const verification = { adapterVersion: 2, verifiedAt: '2026-10-14T00:00:00Z', countries: ['JP'] };
  const media: GatewayModel[] = [
    { id: 'openai/image-ok', modality: 'image', capabilities: [], verification },
    { id: 'openai/video-ok', modality: 'video', capabilities: [], verification },
    { id: 'openai/tts-ok', modality: 'speech', capabilities: [], verification },
    { id: 'openai/asr-ok', modality: 'transcription', capabilities: ['subtitle_timestamps'], verification },
    { id: 'openai/asr-json-only', modality: 'transcription', capabilities: [], verification },
    { id: 'openai/image-untested', modality: 'image', capabilities: [] },
    { id: 'openai/image-other-country', modality: 'image', capabilities: [], verification: { ...verification, countries: ['US'] } }
  ];
  const f = await fixture([text('openai/text-denied'), ...media], denied);
  await f.run();
  expect(f.access.filter(f.value).models.map(model => model.id)).toEqual(media.slice(0, 4).map(model => model.id));
  expect(f.calls).toEqual(['openai/text-denied']);
  expect(f.access.filter(f.value).defaults).not.toHaveProperty('text');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
  f.setCountry('US'); await f.run();
  expect(f.access.filter(f.value).models.map(model => model.id)).toEqual(['openai/image-other-country']);
  clock.mockRestore();
});

it('intersects verification with the actual customer key catalog and removes stale defaults', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]);
  await f.run();
  f.setCatalogIDs(['vendor/two']);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001);
  await f.run();
  expect(f.access.filter(f.value)).toMatchObject({ models: [text('vendor/two')], defaults: { text: 'vendor/two' } });
});

it('quarantines only the exact failed model and ignores stale-network feedback', async () => {
  const f = await fixture([text('vendor/one'), text('vendor/two')]);
  await f.run();
  const before = f.access.context();
  const facts = { kind: 'http-rejected' as const, httpStatus: 403, upstreamMessage: 'Model unavailable in this country' };
  expect(await f.access.recordFailure(before, f.value.models[0]!, facts)).toBe(true);
  expect(f.access.filter(f.value).models.map(model => model.id)).toEqual(['vendor/two']);
  f.setIP('203.0.113.2'); vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_001); await f.run();
  expect(await f.access.recordFailure(before, f.value.models[1]!, facts)).toBe(false);
  expect(f.access.filter(f.value).models).toHaveLength(2);
});

it('rejects old family caches and invalidates proof when the exact model profile changes', async () => {
  const f = await fixture([text('vendor/one')]);
  await mkdir(join(f.root, 'config'), { recursive: true });
  await writeFile(join(f.root, 'config/gateway-model-access.json'), JSON.stringify({ version: 1, base: '', network: '', groups: { vendor: { status: 'allowed', representative: 'vendor/one', nextCheck: Date.now() + 3600000 } } }));
  expect((await f.access.prepare(f.value)).models).toEqual([]);
  await f.run();
  const changed = { ...f.value, models: [{ ...f.value.models[0]!, capabilities: ['responses', 'changed-contract'] }] };
  expect(f.access.filter(changed).models).toEqual([]);
  await f.run(changed);
  expect(f.access.filter(changed).models).toHaveLength(1);
});

it.each([
  [402, 'Insufficient credits', false], [403, 'Key limit exceeded', false],
  [403, 'Content policy violation', false], [403, 'Forbidden', false],
  [429, 'Rate limit exceeded', false], [503, 'Provider unavailable', false],
  [403, 'Model unavailable in this country', true], [403, 'Permission denied for this model', true],
  [404, 'No endpoints found for this model', true],
  [400, 'The selected model does not support response_format "verbose_json"', true]
])('classifies HTTP %s %s without conflating access and request failures', (httpStatus, upstreamMessage, expected) => {
  expect(isModelAccessFailure({ kind: 'http-rejected', httpStatus: httpStatus as number, upstreamMessage: upstreamMessage as string })).toBe(expected);
});

it('recognizes explicit geographic failure from an accepted video job without an HTTP error status', () => {
  expect(isModelAccessFailure({ kind: 'provider-failed', upstreamCode: 'provider_error', upstreamMessage: 'Model unavailable in this country' })).toBe(true);
  expect(isModelAccessFailure({ kind: 'provider-failed', upstreamCode: 'provider_error', upstreamMessage: 'Temporarily unavailable' })).toBe(false);
});

it('checks each text model and never infers sibling or media availability from a representative', async () => {
  const image: GatewayModel = { id: 'openai/gpt-image-1', modality: 'image', capabilities: [] };
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-6-sol'), text('openai/gpt-4.1-mini'), image, text('google/gemini-2.5-flash'), text('google/gemini-2.5-flash-lite'), text('openai/gpt-oss-20b'), text('google/gemma-3-12b-it'), text('anthropic/claude-sonnet-4.6')], id => /gpt-4.1-mini|gemini/.test(id) ? denied() : success());
  expect((await f.access.prepare(f.value)).models).toEqual([]);
  await f.run();
  expect(f.calls).toHaveLength(7);
  expect(f.calls).toContain('openai/gpt-4.1-mini');
  expect(f.calls).toContain('openai/gpt-6-sol');
  expect(f.calls).toContain('google/gemini-2.5-flash-lite');
  expect(f.calls).not.toContain(image.id);
  expect(f.access.filter(f.value).models.map(model => model.id)).toEqual(['deepseek/deepseek-v3.2', 'openai/gpt-6-sol', 'openai/gpt-oss-20b', 'google/gemma-3-12b-it']);
  const saved = await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8');
  expect(saved).not.toMatch(/private-model-key|203\.0\.113|a@test/);
});

it('keeps an unchecked selected model hidden while a verified fallback finishes first', async () => {
  let finishSelected!: () => void;
  const waiting = new Promise<void>(resolve => { finishSelected = resolve; });
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-4.1-mini')], async id => {
    if (id.startsWith('deepseek/')) await waiting;
    return success();
  });
  const work = f.run();
  await expect.poll(() => f.access.filter(f.value).models.length).toBe(1);
  expect(f.access.filter(f.value).defaults.text).toBe('openai/gpt-4.1-mini');
  finishSelected(); await work;
  expect(f.access.filter(f.value).defaults.text).toBe('deepseek/deepseek-v3.2');
});

it.each([429, 503, 403])('does not treat an expired success plus HTTP %s as new availability proof', async status => {
  let failure = false;
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-4.1-mini')], () => failure
    ? Response.json({ error: { message: status === 403 ? 'Key limit exceeded' : 'Temporarily unavailable' } }, { status }) : success());
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  await f.run(); failure = true; clock.mockReturnValue(Date.now() + 24 * 60 * 60_000 + 1);
  await f.run();
  expect(f.access.filter(f.value).models).toHaveLength(0);
});

it('hides expired success after a network exception without caching a secret error message', async () => {
  let failed = false;
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('qwen/qwen3-coder')], () => {
    if (failed) throw new Error('private-model-key');
    return success();
  });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  await f.run(); failed = true; clock.mockReturnValue(Date.now() + 24 * 60 * 60_000 + 1); await f.run();
  expect(f.access.filter(f.value).models).toHaveLength(0);
  expect(await readFile(join(f.root, 'config/gateway-model-access.json'), 'utf8')).not.toContain('private-model-key');
});

it('hides cached results when the current network identity cannot be established', async () => {
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-4.1-mini')], id => id.startsWith('openai/') ? denied() : success());
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  await f.run(); const count = f.calls.length;
  clock.mockReturnValue(Date.now() + 60_001);
  f.fetcher.mockRejectedValueOnce(new Error('trace unavailable'));
  await f.run();
  expect(f.calls).toHaveLength(count);
  expect(f.access.filter(f.value).models).toEqual([]);
});

it('reuses persisted results and retries a blocked family after one hour', async () => {
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-4.1-mini')], id => id.startsWith('openai/') ? denied() : success());
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  await f.run(); const count = f.calls.length;
  const restored = createOfficialModelAccess(f.input);
  expect((await restored.prepare(f.value)).models.map(model => model.id)).toEqual(['deepseek/deepseek-v3.2']);
  await restored.refresh(f.value, new AbortController().signal, async () => undefined);
  expect(f.calls).toHaveLength(count);
  clock.mockReturnValue(Date.now() + 60 * 60_000 + 1); await f.run();
  expect(f.calls.slice(count)).toEqual(['openai/gpt-4.1-mini']);
});

it('invalidates results for account, key, proxy and exit changes', async () => {
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-4.1-mini')]);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  await f.run();
  const key = { ...f.value, keyVersion: 'key-v2' };
  expect((await f.access.prepare(key)).models).toHaveLength(0); await f.run(key);
  const account = { ...key, account: { ...key.account, id: 'account-b' } };
  expect((await f.access.prepare(account)).models).toHaveLength(0); await f.run(account);
  f.setProxy('http://127.0.0.1:8888'); expect((await f.access.prepare(account)).models).toHaveLength(0); await f.run(account);
  f.setIP('203.0.113.2'); clock.mockReturnValue(Date.now() + 60_001); await f.run(account);
  expect(f.calls).toHaveLength(10);
});

it('does not promote a missing sibling when another exact model succeeds', async () => {
  const f = await fixture([text('deepseek/deepseek-v3.2'), text('openai/gpt-4.1-mini'), text('openai/gpt-6-sol')], id => id === 'openai/gpt-4.1-mini'
    ? Response.json({ error: { message: 'Model is unavailable' } }, { status: 404 }) : success());
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
  await f.run(); clock.mockReturnValue(Date.now() + 5 * 60_000 + 1); await f.run();
  expect(f.calls.filter(id => id.startsWith('openai/'))).toEqual(['openai/gpt-4.1-mini', 'openai/gpt-6-sol']);
  expect(f.access.filter(f.value).models).toHaveLength(2);
});

it('bounds each background pass and stops starting probes after cancellation', async () => {
  const f = await fixture(Array.from({ length: 20 }, (_, i) => text(`vendor-${i}/model`)));
  await f.run(); expect(f.calls).toHaveLength(12);
  const controller = new AbortController(); controller.abort();
  await f.access.refresh(f.value, controller.signal, async () => undefined);
  expect(f.calls).toHaveLength(12);
});

it('never falls back to the user key when platform credentials are unavailable', async () => {
  const f = await fixture([text('deepseek/deepseek-v3.2')]);
  f.readProbeCredentials.mockRejectedValueOnce(new Error('platform unavailable'));
  await expect(f.run()).rejects.toThrow('platform unavailable');
  expect(f.calls).toEqual([]);
  await f.run();
  expect(f.calls).toHaveLength(1);
});

it.each(['user-key', 'expired'] as const)('does not perform inference with %s platform credentials', async failure => {
  const f = await fixture([text('deepseek/deepseek-v3.2')]);
  const credentials = await f.readProbeCredentials();
  f.readProbeCredentials.mockResolvedValue({
    ...credentials, ...(failure === 'user-key'
      ? { modelKey: f.value.modelKey } : { expiresAt: new Date(Date.now() - 1000).toISOString() })
  });
  await f.run();
  expect(f.calls).toEqual([]);
});

it('keeps cached access results and avoids requesting credentials when no probe is due', async () => {
  const f = await fixture([text('deepseek/deepseek-v3.2')]);
  await f.run();
  f.readProbeCredentials.mockRejectedValue(new Error('platform unavailable'));
  await f.run();
  expect(f.readProbeCredentials).toHaveBeenCalledOnce();
  expect(f.access.filter(f.value).models).toHaveLength(1);
});
