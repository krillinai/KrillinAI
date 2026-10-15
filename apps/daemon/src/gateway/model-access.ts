import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';
import { gatewayModelOperations, gatewayModelCompatible, gatewayModelReady, type GatewayModel, type GatewayModelAvailability, type GatewayModelOperation, type PublicErrorFacts } from '@opencreator/protocol';
import { readPrivateJsonFile, writePrivateJsonFile } from '../config/private-json-file.js';
import { catalogSchema, type GatewayBootstrap } from './client.js';
import { imageModelsSchema, officialCatalogModels, openRouterModelSchema, videoModelsSchema } from './openrouter-model-catalog.js';

const blockedTTL = 60 * 60_000;
const catalogTTL = 5 * 60_000;
const successTTL = 5 * 60_000;
const retryTTL = 30_000;
const legacyEntrySchema = z.object({
  status: z.enum(['allowed', 'blocked', 'unknown']), profile: z.string(),
  nextCheck: z.number(), validUntil: z.number()
});
const legacyCacheSchema = z.object({
  version: z.literal(2), base: z.string(), network: z.string(), country: z.string(),
  models: z.record(legacyEntrySchema), catalogIDs: z.array(z.string()), catalogExpiresAt: z.number()
});
const cacheSchema = z.object({
  version: z.literal(3), base: z.string(), network: z.string(), country: z.string(),
  models: z.record(z.object({ profile: z.string(), blockedUntil: z.number() })),
  catalogIDs: z.array(z.string()), catalogExpiresAt: z.number(),
  catalogModels: z.array(catalogSchema.shape.models.element).optional(),
  successes: z.record(z.object({ profile: z.string(), operation: z.enum(gatewayModelOperations), checkedAt: z.number(), validUntil: z.number() })).default({})
});
type AccessCache = z.infer<typeof cacheSchema>;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modelKey = (model: Pick<GatewayModel, 'id' | 'modality'>) => `${model.modality}:${model.id}`;
const profileKey = ({ name: _name, ...model }: GatewayModel) => digest(model);
const accountScope = (bootstrap: GatewayBootstrap) => digest([bootstrap.baseUrl, bootstrap.account.id, bootstrap.keyVersion, bootstrap.modelKey]);
const emptyCache = (base = ''): AccessCache => ({ version: 3, base, network: '', country: '', models: {}, successes: {}, catalogIDs: [], catalogExpiresAt: 0 });

export function modelAccessGroup(model: GatewayModel): string | undefined {
  const [vendor, slug] = model.id.replace(/^~/, '').split('/');
  if (!slug) return undefined;
  if (vendor === 'openai') return slug.startsWith('gpt-oss') ? 'openai-oss' : 'openai';
  if (vendor === 'google') return slug.startsWith('gemma') ? 'google-gemma' : 'google-gemini';
  return vendor;
}

export function officialModelPolicy(models: GatewayModel[]) {
  // Account catalog availability does not override OpenCreator's adapter compatibility.
  return models.filter(model => model.vendor?.toLowerCase() !== 'anthropic' && !/^claude-/i.test(model.id) && modelAccessGroup(model) !== 'anthropic'
    && !model.id.endsWith(':batch')
    && !(model.modality === 'text' && modelAccessGroup(model) === 'openrouter'));
}

export function withModelCatalog(bootstrap: GatewayBootstrap, models: GatewayModel[]): GatewayBootstrap {
  if (bootstrap.transport === 'gateway') {
    const defaults = Object.fromEntries(Object.entries(bootstrap.defaults).filter(([key]) => !['textProcessing', 'subtitle'].includes(key)));
    return { ...bootstrap, models: officialModelPolicy(models).filter(gatewayModelCompatible), defaults };
  }
  const defaults: Record<string, string> = {};
  for (const model of models) {
    if (model.modality === 'text' && !model.capabilities.includes('responses')) continue;
    if (!defaults[model.modality] || bootstrap.defaults[model.modality] === model.id) defaults[model.modality] = model.id;
  }
  return { ...bootstrap, models, defaults };
}

// Only model access failures affect admission. Quota, content policy and outages do not.
export function isModelAccessFailure(facts: PublicErrorFacts): boolean {
  const status = facts.httpStatus && facts.httpStatus >= 400 ? facts.httpStatus : Number(facts.upstreamCode);
  const message = facts.upstreamMessage ?? '';
  if (/key limit|balance|credits|quota|rate limit|moderation|content policy|safety filter/i.test(message)) return false;
  const regionOrTerms = /provider terms of service|(?:country|region|location).{0,80}(?:not supported|restricted|not allowed|unavailable|prohibited)|(?:not available|unavailable|unsupported|restricted).{0,80}(?:country|region|location)/i.test(message);
  if (facts.kind === 'provider-failed' && (!Number.isFinite(status) || status < 400) && regionOrTerms) return true;
  if (![400, 403, 404].includes(status)) return false;
  return regionOrTerms || /no (?:available )?endpoints found|(?:model|provider).{0,80}(?:permission denied|not allowed|not found|not available|unavailable)|(?:permission denied|not allowed).{0,80}(?:model|provider)/i.test(message);
}

export function createOfficialModelAccess(input: {
  dataDir: string; fetcher: typeof fetch; readProxy(): Promise<string>;
}) {
  const path = join(input.dataDir, 'config', 'gateway-model-access.json');
  let cache = emptyCache();
  let loaded: Promise<void> | undefined;
  let saving = Promise.resolve();
  let metadataWork: { controller: AbortController; promise: Promise<void> } | undefined;
  let networkCheckedAt = 0;
  let catalogRetryAt = 0;
  let catalogDirty = true;
  let catalogUnauthorized = false;
  let preparedAccount = '';
  let generation = 0;
  let sequence = 0;
  let appliedSequence = 0;
  const context = () => preparedAccount ? digest([cache.base, cache.network, generation]) : '';
  function save() {
    const snapshot = structuredClone(cache);
    saving = saving.catch(() => undefined).then(() => writePrivateJsonFile(path, snapshot));
    return saving;
  }
  async function prepare(bootstrap: GatewayBootstrap, signal?: AbortSignal) {
    const invocation = ++sequence;
    const originalGeneration = generation;
    loaded ??= (async () => {
      try {
        const value = await readPrivateJsonFile(path);
        if (generation !== originalGeneration) return;
        const parsed = cacheSchema.safeParse(value);
        if (parsed.success) cache = parsed.data;
        else {
          const legacy = legacyCacheSchema.safeParse(value);
          if (legacy.success) cache = { ...legacy.data, version: 3, successes: {}, models: Object.fromEntries(
            Object.entries(legacy.data.models).filter(([, entry]) => entry.status === 'blocked' && entry.nextCheck > Date.now())
              .map(([key, entry]) => [key, { profile: entry.profile, blockedUntil: Math.min(entry.nextCheck, Date.now() + blockedTTL) }])
          ) };
        }
      } catch { /* A broken cache must not prevent sign-in. */ }
    })();
    await loaded;
    const base = digest([accountScope(bootstrap), await input.readProxy()]);
    if (signal?.aborted || (generation !== originalGeneration && invocation < appliedSequence)) return filter(bootstrap);
    if (invocation < appliedSequence) { await metadataWork?.promise; return filter(bootstrap); }
    appliedSequence = invocation;
    if (cache.base !== base) {
      metadataWork?.controller.abort(); metadataWork = undefined;
      cache = emptyCache(base); generation++; networkCheckedAt = 0; catalogRetryAt = 0; catalogDirty = true; catalogUnauthorized = false;
    }
    preparedAccount = accountScope(bootstrap);
    if (metadataWork) await metadataWork.promise;
    if (cache.base !== base || signal?.aborted) return filter(bootstrap);
    const expiredFailure = Object.values(cache.models).some(entry => entry.blockedUntil <= Date.now());
    if (networkCheckedAt === 0 || Date.now() - networkCheckedAt >= 60_000 || (Date.now() >= catalogRetryAt
      && (catalogDirty || cache.catalogExpiresAt <= Date.now() || expiredFailure))) {
      const expectedBase = cache.base;
      let expectedGeneration = generation;
      const controller = new AbortController();
      const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      const current = () => cache.base === expectedBase && generation === expectedGeneration && !requestSignal.aborted;
      const work = { controller, promise: Promise.resolve() };
      work.promise = (async () => {
        if (bootstrap.supplier === '88api' || bootstrap.supplier === 'chatanywhere') {
          networkCheckedAt = Date.now();
          if (Date.now() < catalogRetryAt || (!catalogDirty && cache.catalogExpiresAt > Date.now())) return;
          try {
            const response = await input.fetcher(`${bootstrap.baseUrl}/models`, { redirect: 'error',
              signal: AbortSignal.any([requestSignal, AbortSignal.timeout(8000)]), headers: { Authorization: `Bearer ${bootstrap.modelKey}` } });
            if (!response.ok) {
              if (current() && [401, 403].includes(response.status)) { catalogUnauthorized = response.status === 401; cache.catalogExpiresAt = 0; }
              throw new Error('Unknown supplier account catalog');
            }
            const value = z.object({ data: z.array(z.object({ id: z.string().min(1) })) }).parse(await response.json());
            if (!current()) return;
            const ids = new Set(value.data.map(model => model.id));
            cache.catalogIDs = [...ids];
            cache.catalogModels = bootstrap.models.filter(model => ids.has(model.id));
            cache.catalogExpiresAt = Date.now() + catalogTTL;
            cache.models = Object.fromEntries(Object.entries(cache.models).filter(([, entry]) => entry.blockedUntil > Date.now()));
            catalogRetryAt = 0; catalogDirty = false; catalogUnauthorized = false;
            await save();
          } catch { if (current()) { catalogRetryAt = Date.now() + retryTTL; await save(); } }
          return;
        }
        if (networkCheckedAt === 0 || Date.now() - networkCheckedAt >= 60_000) {
          networkCheckedAt = Date.now();
          try {
            const response = await input.fetcher('https://openrouter.ai/cdn-cgi/trace', {
              redirect: 'error', signal: AbortSignal.any([requestSignal, AbortSignal.timeout(1500)])
            });
            const fields = new URLSearchParams((await response.text()).replace(/\r?\n/g, '&'));
            const ip = fields.get('ip') ?? ''; const country = fields.get('loc') ?? '';
            if (current() && response.ok && isIP(ip) && /^[A-Z]{2}$/.test(country)) {
              const network = digest([ip, country]);
              if (cache.network && cache.network !== network) {
                cache = { ...emptyCache(expectedBase), network, country }; catalogRetryAt = 0; catalogDirty = true;
                expectedGeneration = ++generation;
              } else cache = { ...cache, network, country };
            }
          } catch { /* Exit detection is optional; the account catalog remains authoritative. */ }
        }
        if (!current() || Date.now() < catalogRetryAt || (!catalogDirty && cache.catalogExpiresAt > Date.now()
          && !Object.values(cache.models).some(entry => entry.blockedUntil <= Date.now()))) return;
        try {
          const catalogSignal = AbortSignal.any([requestSignal, AbortSignal.timeout(8000)]);
          const entries: z.infer<typeof openRouterModelSchema>[] = [];
          let total: number | undefined;
          let offset = 0;
          for (let page = 0; page < 10; page++) {
            const response = await input.fetcher(`https://openrouter.ai/api/v1/models/user?output_modalities=all&limit=1000&offset=${offset}`, {
              redirect: 'error', signal: catalogSignal, headers: { Authorization: `Bearer ${bootstrap.modelKey}` }
            });
            if (!response.ok) {
              if (current()) {
                catalogUnauthorized = response.status === 401;
                if ([401, 403].includes(response.status)) cache.catalogExpiresAt = 0;
              }
              throw new Error('Unknown account catalog');
            }
            const value = z.object({ data: z.array(openRouterModelSchema),
              total_count: z.number().int().nonnegative().optional(),
              links: z.object({ next: z.string().nullable().optional() }).optional() }).parse(await response.json());
            if (total !== undefined && value.total_count !== undefined && total !== value.total_count) throw new Error('Account catalog changed during pagination');
            total ??= value.total_count;
            entries.push(...value.data);
            if (!value.links?.next) break;
            const next = new URL(value.links.next, 'https://openrouter.ai');
            const nextOffset = Number(next.searchParams.get('offset'));
            // The shared response schema also uses /models links; only reuse its offset.
            if (next.origin !== 'https://openrouter.ai' || !['/api/v1/models/user', '/api/v1/models'].includes(next.pathname) || !Number.isInteger(nextOffset) || nextOffset <= offset || page === 9 || !value.data.length) throw new Error('Invalid account catalog pagination');
            offset = nextOffset;
          }
          const ids = entries.map(model => model.id);
          if (total !== undefined && new Set(ids).size !== total) throw new Error('Incomplete account catalog');
          async function metadata<T extends z.ZodTypeAny>(resource: string, schema: T, modality: GatewayModel['modality']): Promise<z.infer<T> | undefined> {
            if (!bootstrap.models.some(model => model.modality === modality && ids.includes(model.id))) return undefined;
            try {
              const response = await input.fetcher(`https://openrouter.ai/api/v1/${resource}/models`, {
                redirect: 'error', signal: AbortSignal.any([requestSignal, AbortSignal.timeout(3000)]),
                headers: { Authorization: `Bearer ${bootstrap.modelKey}` }
              });
              if (response.ok) return schema.parse(await response.json());
            } catch { /* Keep the gateway's existing capability metadata if discovery is unavailable. */ }
            return undefined;
          }
          const [images, videos] = await Promise.all([
            metadata('images', imageModelsSchema, 'image'), metadata('videos', videoModelsSchema, 'video')
          ]);
          if (!current()) return;
          cache.catalogModels = officialCatalogModels(bootstrap.models, entries, images?.data, videos?.data);
          cache.catalogIDs = [...new Set(ids)]; cache.catalogExpiresAt = Date.now() + catalogTTL;
          cache.models = Object.fromEntries(Object.entries(cache.models).filter(([, entry]) => entry.blockedUntil > Date.now()));
          catalogRetryAt = 0; catalogDirty = false; catalogUnauthorized = false;
          await save();
        } catch {
          if (current()) { catalogRetryAt = Date.now() + retryTTL; await save(); }
        }
      })();
      metadataWork = work;
      try { await work.promise; } finally { if (metadataWork === work) metadataWork = undefined; }
    }
    return filter(bootstrap);
  }
  function compatibleModels(bootstrap: GatewayBootstrap) {
    const ids = new Set(cache.catalogExpiresAt > Date.now() ? cache.catalogIDs : []);
    const profiles = cache.catalogModels && new Map(cache.catalogModels.map(model => [modelKey(model), model]));
    const models = bootstrap.models.flatMap(model => {
      const profile = profiles?.get(modelKey(model));
      return profiles && !profile ? [] : [model.modality === 'text' ? model : profile ?? model];
    });
    return officialModelPolicy(models).filter(model => {
      if (preparedAccount !== accountScope(bootstrap) || !ids.has(model.id)) return false;
      return model.modality !== 'text' || model.capabilities.includes('responses');
    });
  }
  function findModel(bootstrap: GatewayBootstrap, id: string, modality: GatewayModel['modality']) {
    return compatibleModels(bootstrap).find(model => model.id === id && model.modality === modality);
  }
  function filter(bootstrap: GatewayBootstrap) {
    return withModelCatalog(bootstrap, compatibleModels(bootstrap).filter(model => {
      const entry = cache.models[modelKey(model)];
      const current = entry?.profile === profileKey(model) ? entry : undefined;
      if (current) return false;
      if (model.modality === 'text') return model.capabilities.includes('responses');
      return true;
    }));
  }
  async function recordFailure(expectedContext: string, model: GatewayModel, facts: PublicErrorFacts) {
    if (!expectedContext || expectedContext !== context()) return false;
    const previousSuccesses = Object.keys(cache.successes).length;
    for (const [key, entry] of Object.entries(cache.successes)) if (entry.profile === profileKey(model)) delete cache.successes[key];
    if (!isModelAccessFailure(facts)) {
      if (Object.keys(cache.successes).length !== previousSuccesses) await save();
      return false;
    }
    cache.models[modelKey(model)] = { profile: profileKey(model), blockedUntil: Date.now() + blockedTTL };
    catalogRetryAt = 0; catalogDirty = true;
    await save();
    return true;
  }
  async function recordSuccess(expectedContext: string, model: GatewayModel, operation: GatewayModelOperation) {
    if (!expectedContext || expectedContext !== context()) return false;
    // A parallel success must not erase a later explicit access rejection.
    if (cache.models[modelKey(model)]?.profile === profileKey(model)) return false;
    const now = Date.now();
    for (const [key, entry] of Object.entries(cache.successes)) if (entry.validUntil <= now) delete cache.successes[key];
    cache.successes[`${modelKey(model)}:${operation}`] = { profile: profileKey(model), operation, checkedAt: now, validUntil: now + successTTL };
    await save();
    return true;
  }
  function availability(bootstrap: GatewayBootstrap): GatewayModelAvailability[] {
    return compatibleModels(bootstrap).map(model => {
      const profile = profileKey(model);
      const blocked = cache.models[modelKey(model)];
      if (blocked?.profile === profile) return { model: model.id, modality: model.modality, status: 'restricted' };
      const success = Object.values(cache.successes).filter(entry => entry.profile === profile && entry.validUntil > Date.now())
        .sort((a, b) => b.checkedAt - a.checkedAt)[0];
      return { model: model.id, modality: model.modality, status: success ? 'recent_success' : 'unverified',
        ...(success ? { operation: success.operation, checkedAt: new Date(success.checkedAt).toISOString() } : {}) };
    });
  }
  async function refresh(bootstrap: GatewayBootstrap, signal: AbortSignal, onChange: () => Promise<void>) {
    await prepare(bootstrap, signal);
    if (!signal.aborted) await onChange();
  }
  function reset() {
    generation++; appliedSequence = ++sequence;
    metadataWork?.controller.abort(); metadataWork = undefined;
    cache = emptyCache(); preparedAccount = ''; networkCheckedAt = 0; catalogRetryAt = 0; catalogDirty = true; catalogUnauthorized = false;
    loaded = Promise.resolve();
  }
  function invalidateCatalog() { catalogRetryAt = 0; catalogDirty = true; }
  const catalogAvailable = () => Boolean(preparedAccount && cache.catalogExpiresAt > Date.now());
  const needsKeyRefresh = () => catalogUnauthorized && !catalogAvailable();
  return { prepare, filter, refresh, context, recordFailure, recordSuccess, availability, findModel, reset, invalidateCatalog, catalogAvailable, needsKeyRefresh };
}

export type OfficialModelAccess = ReturnType<typeof createOfficialModelAccess>;
