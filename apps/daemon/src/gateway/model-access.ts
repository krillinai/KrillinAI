import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';
import type { GatewayModel, PublicErrorFacts } from '@opencreator/protocol';
import { readPrivateJsonFile, writePrivateJsonFile } from '../config/private-json-file.js';
import { probeCredentialsSchema, type GatewayBootstrap, type GatewayProbeCredentials } from './client.js';

const allowedTTL = 24 * 60 * 60_000;
const blockedTTL = 60 * 60_000;
const retryTTL = 5 * 60_000;
const entrySchema = z.object({
  status: z.enum(['allowed', 'blocked', 'unknown']), profile: z.string(),
  nextCheck: z.number(), validUntil: z.number()
});
const cacheSchema = z.object({
  version: z.literal(2), base: z.string(), network: z.string(), country: z.string(),
  models: z.record(entrySchema), catalogIDs: z.array(z.string()), catalogExpiresAt: z.number()
});
type AccessCache = z.infer<typeof cacheSchema>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modelKey = (model: Pick<GatewayModel, 'id' | 'modality'>) => `${model.modality}:${model.id}`;
const profileKey = ({ name: _name, ...model }: GatewayModel) => digest(model);
const emptyCache = (base = ''): AccessCache => ({ version: 2, base, network: '', country: '', models: {}, catalogIDs: [], catalogExpiresAt: 0 });

export function modelAccessGroup(model: GatewayModel): string | undefined {
  const [vendor, slug] = model.id.replace(/^~/, '').split('/');
  if (!slug) return undefined;
  if (vendor === 'openai') return slug.startsWith('gpt-oss') ? 'openai-oss' : 'openai';
  if (vendor === 'google') return slug.startsWith('gemma') ? 'google-gemma' : 'google-gemini';
  return vendor;
}

export function officialModelPolicy(models: GatewayModel[]) {
  return models.filter(model => modelAccessGroup(model) !== 'anthropic'
    && !model.id.endsWith(':batch')
    && !(model.modality === 'text' && modelAccessGroup(model) === 'openrouter'));
}

export function withModelCatalog(bootstrap: GatewayBootstrap, models: GatewayModel[]): GatewayBootstrap {
  const defaults: Record<string, string> = {};
  for (const model of models) {
    if (model.modality === 'text' && !model.capabilities.includes('responses')) continue;
    if (!defaults[model.modality] || bootstrap.defaults[model.modality] === model.id) defaults[model.modality] = model.id;
  }
  return { ...bootstrap, models, defaults };
}

// Only model access failures affect admission. Quota, content policy and outages do not.
export function isModelAccessFailure(facts: PublicErrorFacts): boolean {
  const status = facts.httpStatus ?? Number(facts.upstreamCode);
  const message = facts.upstreamMessage ?? '';
  if (/key limit|balance|credits|quota|rate limit|moderation|content policy|safety filter/i.test(message)) return false;
  const regionOrTerms = /provider terms of service|(?:country|region|location).{0,80}(?:not supported|restricted|not allowed|unavailable|prohibited)|(?:not available|unavailable|unsupported|restricted).{0,80}(?:country|region|location)/i.test(message);
  if (facts.kind === 'provider-failed' && !Number.isFinite(status) && regionOrTerms) return true;
  if (![400, 403, 404].includes(status)) return false;
  return regionOrTerms || /no (?:available )?endpoints found|(?:model|provider).{0,80}(?:permission denied|not allowed|not found|not available|unavailable)|(?:permission denied|not allowed).{0,80}(?:model|provider)|does not support response_format/i.test(message);
}

export function createOfficialModelAccess(input: {
  dataDir: string; fetcher: typeof fetch; readProxy(): Promise<string>;
  readProbeCredentials(): Promise<GatewayProbeCredentials>;
}) {
  const path = join(input.dataDir, 'config', 'gateway-model-access.json');
  let cache = emptyCache();
  let loaded: Promise<void> | undefined;
  let saving = Promise.resolve();
  let metadataWork: Promise<void> | undefined;
  let metadataCheckedAt = 0;
  let identityValid = false;
  const context = () => identityValid && cache.network ? digest([cache.base, cache.network]) : '';
  function save() {
    const snapshot = structuredClone(cache);
    saving = saving.catch(() => undefined).then(() => writePrivateJsonFile(path, snapshot));
    return saving;
  }
  async function prepare(bootstrap: GatewayBootstrap, signal?: AbortSignal) {
    loaded ??= (async () => {
      try {
        const parsed = cacheSchema.safeParse(await readPrivateJsonFile(path));
        if (parsed.success) cache = parsed.data;
      } catch { /* A broken cache must not prevent sign-in. */ }
    })();
    await loaded;
    if (signal?.aborted) return filter(bootstrap);
    const base = digest([bootstrap.account.id, bootstrap.keyVersion, await input.readProxy()]);
    if (cache.base !== base) { cache = emptyCache(base); identityValid = false; metadataCheckedAt = 0; }
    if (metadataWork) await metadataWork;
    if (Date.now() - metadataCheckedAt >= 60_000 || metadataCheckedAt === 0) {
      metadataCheckedAt = Date.now();
      const expectedBase = cache.base;
      const work = (async () => {
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
        identityValid = false;
        try {
          const response = await input.fetcher('https://openrouter.ai/cdn-cgi/trace', { redirect: 'error', signal: requestSignal });
          const fields = new URLSearchParams((await response.text()).replace(/\r?\n/g, '&'));
          const ip = fields.get('ip') ?? ''; const country = fields.get('loc') ?? '';
          if (!response.ok || !isIP(ip) || !/^[A-Z]{2}$/.test(country)) throw new Error('Unknown network');
          if (cache.base !== expectedBase || signal?.aborted) return;
          const network = digest([ip, country]);
          if (cache.network !== network) cache = { ...emptyCache(expectedBase), network, country };
          identityValid = true;
          cache.catalogExpiresAt = 0;
          const ids: string[] = [];
          let offset = 0;
          for (let page = 0; page < 10; page++) {
            const response = await input.fetcher(`https://openrouter.ai/api/v1/models/user?output_modalities=all&limit=1000&offset=${offset}`, {
              redirect: 'error', signal: requestSignal, headers: { Authorization: `Bearer ${bootstrap.modelKey}` }
            });
            if (!response.ok) throw new Error('Unknown account catalog');
            const value = z.object({ data: z.array(z.object({ id: z.string().min(1) })), links: z.object({ next: z.string().nullable().optional() }).optional() }).parse(await response.json());
            ids.push(...value.data.map(model => model.id));
            if (!value.links?.next) break;
            const next = new URL(value.links.next, 'https://openrouter.ai');
            const nextOffset = Number(next.searchParams.get('offset'));
            if (next.origin !== 'https://openrouter.ai' || next.pathname !== '/api/v1/models/user' || !Number.isInteger(nextOffset) || nextOffset <= offset || page === 9 || !value.data.length) throw new Error('Invalid account catalog pagination');
            offset = nextOffset;
          }
          if (cache.base !== expectedBase || signal?.aborted) return;
          cache.catalogIDs = ids; cache.catalogExpiresAt = Date.now() + retryTTL;
          await save();
        } catch {
          if (cache.base === expectedBase && !signal?.aborted) await save();
        }
      })();
      metadataWork = work;
      try { await work; } finally { if (metadataWork === work) metadataWork = undefined; }
    }
    return filter(bootstrap);
  }
  function filter(bootstrap: GatewayBootstrap) {
    const ids = new Set(cache.catalogExpiresAt > Date.now() ? cache.catalogIDs : []);
    return withModelCatalog(bootstrap, officialModelPolicy(bootstrap.models).filter(model => {
      if (!identityValid || !ids.has(model.id)) return false;
      const entry = cache.models[modelKey(model)];
      const current = entry?.profile === profileKey(model) ? entry : undefined;
      if (current?.status === 'blocked') return false;
      if (model.modality === 'text') return model.capabilities.includes('responses') && current?.status === 'allowed' && current.validUntil > Date.now();
      const verified = model.verification;
      return verified?.adapterVersion === 2 && verified.countries.includes(cache.country)
        && (model.modality !== 'transcription' || model.capabilities.includes('subtitle_timestamps'));
    }));
  }
  async function recordFailure(expectedContext: string, model: GatewayModel, facts: PublicErrorFacts) {
    if (!expectedContext || expectedContext !== context() || !isModelAccessFailure(facts)) return false;
    cache.models[modelKey(model)] = { status: 'blocked', profile: profileKey(model), nextCheck: Date.now() + blockedTTL, validUntil: 0 };
    await save();
    return true;
  }
  async function check(model: GatewayModel, key: string, signal: AbortSignal): Promise<'allowed' | 'blocked' | 'unknown'> {
    try {
      const response = await input.fetcher('https://openrouter.ai/api/v1/responses', {
        method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model.id, input: 'Call oc_access_check with ready true.', store: false, stream: false, max_output_tokens: 512,
          tools: [{ type: 'function', name: 'oc_access_check', description: 'Confirm model access.', parameters: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'], additionalProperties: false } }],
          tool_choice: { type: 'function', name: 'oc_access_check' } })
      });
      const value = await response.json() as { status?: string; error?: { message?: unknown }; output?: Array<{ type?: string; name?: string; arguments?: string }> };
      const message = typeof value.error?.message === 'string' ? value.error.message : '';
      if (isModelAccessFailure({ kind: 'http-rejected', httpStatus: response.status, upstreamMessage: message })) return 'blocked';
      if (!response.ok) return 'unknown';
      const call = value.output?.find(item => item.type === 'function_call' && item.name === 'oc_access_check');
      return value.status === 'completed' && call && JSON.parse(call.arguments ?? '{}').ready === true ? 'allowed' : 'unknown';
    } catch { return 'unknown'; }
  }
  async function refresh(bootstrap: GatewayBootstrap, signal: AbortSignal, onChange: () => Promise<void>) {
    await prepare(bootstrap, signal);
    if (signal.aborted) return;
    await onChange();
    if (!context() || cache.catalogExpiresAt <= Date.now()) return;
    const ids = new Set(cache.catalogIDs);
    const priority = ['openai', 'google-gemini', 'deepseek', 'qwen', 'openai-oss', 'google-gemma'];
    const rank = (model: GatewayModel) => {
      if (model.id === bootstrap.defaults.text) return -1;
      const index = priority.indexOf(modelAccessGroup(model) ?? '');
      return index < 0 ? priority.length : index;
    };
    const pending = officialModelPolicy(bootstrap.models).filter(model => {
      const entry = cache.models[modelKey(model)];
      return model.modality === 'text' && model.capabilities.includes('responses') && ids.has(model.id)
        && (entry?.profile !== profileKey(model) || entry.nextCheck <= Date.now());
    }).sort((a, b) => rank(a) - rank(b)).slice(0, 12);
    const expectedContext = context();
    if (!pending.length || signal.aborted) return;
    const credentials = probeCredentialsSchema.parse(await input.readProbeCredentials());
    if (credentials.modelKey === bootstrap.modelKey || Date.parse(credentials.expiresAt) <= Date.now() || signal.aborted || context() !== expectedContext) return;
    const deadline = Date.now() + 20_000;
    async function worker() {
      while (pending.length && !signal.aborted && Date.now() < deadline && context() === expectedContext) {
        const model = pending.shift()!;
        const key = modelKey(model); const previous = cache.models[key];
        const result = await check(model, credentials.modelKey, signal);
        if (signal.aborted || context() !== expectedContext || cache.models[key] !== previous) continue;
        cache.models[key] = { status: result, profile: profileKey(model),
          validUntil: result === 'allowed' ? Date.now() + allowedTTL : 0,
          nextCheck: Date.now() + (result === 'allowed' ? allowedTTL : result === 'blocked' ? blockedTTL : retryTTL) };
        await save(); await onChange();
      }
    }
    await Promise.all([worker(), worker()]);
  }
  return { prepare, filter, refresh, context, recordFailure };
}

export type OfficialModelAccess = ReturnType<typeof createOfficialModelAccess>;
