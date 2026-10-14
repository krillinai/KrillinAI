import type { GatewayAccountState, GatewayBalanceSnapshot, GatewayBalanceState, GatewayModel, PublicErrorFacts, ServiceSource } from '@opencreator/protocol';
import { z } from 'zod';
import { createGatewayConfigStore, type GatewayCredentials } from './config-store.js';
import { accountSchema, bootstrapSchema, cachedModelUsePolicy, catalogSchema, probeCredentialsSchema, GatewayError, type GatewayBootstrap, type GatewayClient, type GatewayDeviceGrant, type GatewayProbeCredentials } from './client.js';
import { officialModelPolicy, withModelCatalog, type OfficialModelAccess } from './model-access.js';

export function createGatewayAccountService(input: {
  dataDir: string; client: GatewayClient;
  activateRuntime(bootstrap: GatewayBootstrap): Promise<void>;
  closeRuntime(): Promise<void>;
  hasActiveTasks(): boolean;
  hasPendingTasks?(): boolean;
  automaticPolling?: boolean;
  modelAccess?: OfficialModelAccess;
  deferStartupActivation?: boolean;
}) {
  const store = createGatewayConfigStore(input.dataDir);
  let state: GatewayAccountState = { source: 'manual', authState: 'signed_out', activationState: 'inactive', account: null, bindingVersion: null, models: [], activationError: null };
  let credentials: GatewayCredentials | undefined;
  let attempt: (GatewayDeviceGrant & { generation: number; expiresAt: number; nextPollAt: number; previousAuthState: GatewayAccountState['authState'] }) | undefined;
  let generation = 0;
  let pollTimer: NodeJS.Timeout | undefined;
  let pollWork: { attempt: NonNullable<typeof attempt>; work: Promise<void> } | undefined;
  let initialization: Promise<void> | undefined;
  let startupRestoreWork: Promise<void> | undefined;
  let startupRestoreFinished = false;
  let stateRefreshWork: Promise<void> | undefined;
  let refreshWork: Promise<void> | undefined;
  let profileWork: Promise<void> | undefined;
  let profileUpdatedAt = 0;
  let catalogWork: Promise<void> | undefined;
  let catalogUpdatedAt = 0;
  let balance: GatewayBalanceSnapshot | null = null;
  let mutation = Promise.resolve();
  let selectedModels: Record<string, string> = {};
  let localUses = 0;
  let platformProbeCredentials: GatewayProbeCredentials | undefined;
  let platformProbeWork: Promise<GatewayProbeCredentials> | undefined;
  let accessWork: Promise<void> | undefined;
  let accessController: AbortController | undefined;
  let accessUpdatedAt = 0;
  let accessBlocked = false;
  let runtimeTextModel: string | undefined;
  let accessPaused = false;
  let closing = false;
  let usageMutation = Promise.resolve();
  let usageTimer: NodeJS.Timeout | undefined;
  let bindingSyncWork: Promise<void> | undefined;
  let maintenanceWork: Promise<void> | undefined;
  let maintenanceFailures = 0;
  let runtimeCloseWork: Promise<void> | undefined;
  const saveConfiguration = () => store.writeConfiguration({ source: state.source, bindingVersion: state.bindingVersion, selectedModels });
  function serialize<T>(work: () => Promise<T>): Promise<T> { const result = mutation.then(work); mutation = result.then(() => undefined, () => undefined); return result; }
  function fail(error: unknown) { state.activationState = 'blocked'; state.activationError = { code: error instanceof GatewayError ? error.code : 'services_not_ready', message: 'The official service is not ready. Try again.' }; }
  function assertIdle() { if (localUses > 0 || input.hasActiveTasks()) throw new GatewayError('active_tasks', 409); }
  function assertSignedIn() { if (!credentials || state.authState !== 'signed_in') throw new GatewayError('auth_required', 401); return credentials; }
  function usesCachedModelKey() { return credentials?.modelUsePolicy === cachedModelUsePolicy && credentials.transport === 'openrouter-direct' && credentials.keyRotation === false; }
  function restoreModelAccessError(code: NonNullable<GatewayCredentials['modelAccessError']>) {
    if (code === 'auth_required') state = { ...state, authState: 'expired', activationState: 'inactive', bindingVersion: null, activationError: null };
    else fail(new GatewayError(code, 403));
  }
  async function blockConfirmedModelAccess(error: unknown, expected: number, accountId: string | undefined) {
    if (!(error instanceof GatewayError) || !usesCachedModelKey() || closing || accessPaused || generation !== expected
      || state.authState !== 'signed_in' || credentials?.account?.id !== accountId) return false;
    const code = error.status === 401 ? 'auth_required' : error.status === 403 && ['account_disabled', 'payment_review_required'].includes(error.code) ? error.code as NonNullable<GatewayCredentials['modelAccessError']> : undefined;
    if (!code) return false;
    generation++;
    credentials = { ...credentials!, modelAccessError: code };
    restoreModelAccessError(code);
    runtimeTextModel = undefined; accessController?.abort();
    clearInterval(usageTimer); usageTimer = undefined;
    // An async image worker may itself be waiting for this recovery to return.
    runtimeCloseWork ??= input.closeRuntime().catch(() => undefined).finally(() => { runtimeCloseWork = undefined; });
    await store.writeCredentials(credentials);
    return true;
  }
  async function withAccountAccess<T>(work: () => Promise<T>): Promise<T> {
    const expected = generation; const accountId = credentials?.account?.id;
    try { return await work(); }
    catch (error) { await blockConfirmedModelAccess(error, expected, accountId); throw error; }
  }
  async function visibleBootstrap(bootstrap: GatewayBootstrap) {
    const eligible = withModelCatalog(bootstrap, officialModelPolicy(bootstrap.models));
    return input.modelAccess && eligible.transport === 'openrouter-direct' ? input.modelAccess.prepare(eligible) : eligible;
  }
  async function applyVisibleCatalog(next: GatewayBootstrap) {
    if (!credentials) return;
    if (JSON.stringify(state.models) !== JSON.stringify(next.models) || JSON.stringify(state.selectedModels) !== JSON.stringify(next.defaults)) {
      credentials = { ...credentials, defaults: next.defaults };
      selectedModels = { ...next.defaults }; state.selectedModels = { ...selectedModels }; state.models = next.models;
      await store.writeCredentials(credentials); await saveConfiguration();
    }
  }
  async function refreshVisibleCatalog() {
    if (!input.modelAccess || closing || accessPaused || credentials?.modelAccessError || credentials?.transport !== 'openrouter-direct' || state.authState !== 'signed_in') return;
    const original = bootstrapSchema.parse(credentials); const expected = generation;
    await visibleBootstrap(original);
    if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') return;
    await serialize(async () => {
      if (generation === expected && state.authState === 'signed_in' && credentials?.account?.id === original.account.id && credentials.keyVersion === original.keyVersion) await applyVisibleCatalog(input.modelAccess!.filter(bootstrapSchema.parse(credentials)));
    });
  }
  async function reportModelFailure(scope: { accountId: string; keyVersion: string; accessContext?: string; models?: GatewayModel[] }, id: string, modality: GatewayModel['modality'], facts: PublicErrorFacts) {
    if (closing || accessPaused || state.authState !== 'signed_in') return;
    await serialize(async () => {
      if (!input.modelAccess || state.authState !== 'signed_in' || credentials?.transport !== 'openrouter-direct'
        || credentials.account?.id !== scope.accountId || credentials.keyVersion !== scope.keyVersion) return;
      const bootstrap = bootstrapSchema.parse(credentials);
      const model = bootstrap.models.find(candidate => candidate.id === id && candidate.modality === modality);
      const submitted = scope.models?.find(candidate => candidate.id === id && candidate.modality === modality);
      if (scope.models && JSON.stringify(submitted) !== JSON.stringify(model)) return;
      if (model && await input.modelAccess.recordFailure(scope.accessContext ?? '', model, facts)) await applyVisibleCatalog(input.modelAccess.filter(bootstrap));
    });
  }
  function needsAccessibleRuntime() {
    return credentials?.transport === 'openrouter-direct' && !credentials.modelAccessError && state.authState === 'signed_in'
      && state.source === 'gateway' && !closing && !accessPaused && (state.activationState === 'ready' || accessBlocked)
      && (!credentials.defaults?.text || accessBlocked || runtimeTextModel !== credentials.defaults.text);
  }
  async function synchronizeAccessibleRuntime() {
    if (!needsAccessibleRuntime() || !credentials) return;
    if (!credentials.defaults?.text) { accessBlocked = true; fail(new GatewayError('services_not_ready')); return; }
    if ((!accessBlocked && runtimeTextModel === credentials.defaults.text) || localUses > 0 || input.hasActiveTasks() || input.hasPendingTasks?.()) return;
    const next = { ...bootstrapSchema.parse(credentials), models: state.models };
    try {
      await input.activateRuntime(next);
      runtimeTextModel = next.defaults.text; accessBlocked = false;
      state.bindingVersion = next.bindingVersion; state.activationState = 'ready'; state.activationError = null;
      await saveConfiguration();
    } catch (error) { accessBlocked = true; runtimeTextModel = undefined; fail(error); await input.closeRuntime(); }
  }
  function scheduleModelAccess() {
    if (!input.modelAccess || closing || accessPaused || accessWork || credentials?.modelAccessError || credentials?.transport !== 'openrouter-direct' || state.authState !== 'signed_in'
      || (state.activationState !== 'ready' && !accessBlocked) || Date.now() - accessUpdatedAt < 30_000) return;
    accessUpdatedAt = Date.now();
    const controller = new AbortController(); accessController = controller;
    accessWork = (async () => {
      const original = bootstrapSchema.parse(assertSignedIn()); const expected = generation;
      await input.modelAccess!.refresh(original, controller.signal, async () => {
        await serialize(async () => {
          if (controller.signal.aborted || closing || generation !== expected || state.authState !== 'signed_in'
            || credentials?.account?.id !== original.account.id || credentials.keyVersion !== original.keyVersion) return;
          const next = input.modelAccess!.filter(withModelCatalog(bootstrapSchema.parse(credentials), officialModelPolicy(credentials.models ?? [])));
          await applyVisibleCatalog(next);
          await synchronizeAccessibleRuntime();
        });
      });
    })().catch(() => undefined).finally(() => { if (accessController === controller) accessController = undefined; accessWork = undefined; });
  }
  function initialize(): Promise<void> {
    initialization ??= load();
    return initialization;
  }
  async function load() {
    try {
      const config = await store.readConfiguration();
      selectedModels = config.selectedModels ?? {};
      state.selectedModels = { ...selectedModels };
      credentials = await store.readCredentials();
      state.source = credentials ? 'gateway' : 'manual';
      await saveConfiguration();
      if (!credentials) return;
      state.account = credentials.account ?? null; state.authState = 'signed_in'; state.models = credentials.models ?? [];
      if (credentials.modelAccessError) { restoreModelAccessError(credentials.modelAccessError); return; }
      if (input.deferStartupActivation) {
        const cached = bootstrapSchema.safeParse(credentials);
        if (cached.success) state.models = (await visibleBootstrap(cached.data)).models;
        state.activationState = 'loading';
        return;
      }
      if (!usesCachedModelKey()) await refresh();
      await activateCurrent();
    } catch (error) { fail(error); }
  }
  function startBackgroundRestore(): Promise<void> {
    if (!input.deferStartupActivation || closing) return Promise.resolve();
    startupRestoreWork ??= (async () => {
      await initialize();
      if (!credentials || state.authState !== 'signed_in') return;
      await serialize(async () => {
        if (!closing && !accessPaused && state.authState === 'signed_in' && state.activationState === 'loading') {
          await activateCurrent();
        }
      });
    })().catch(error => { if (!closing) fail(error); }).finally(() => { startupRestoreFinished = true; });
    return startupRestoreWork;
  }
  async function refresh() {
    if (refreshWork) return refreshWork;
    refreshWork = (async () => {
      const original = assertSignedIn(); const expected = generation;
      if (Date.parse(original.accessExpiresAt) > Date.now() + 60_000) return;
      try {
        const tokens = await input.client.refresh(original.refreshToken);
        if (closing || accessPaused || generation !== expected || credentials?.refreshToken !== original.refreshToken || state.authState !== 'signed_in') return;
        // 同一登录会话内只更新令牌，保留并发同步的模型凭据。
        credentials = { ...assertSignedIn(), ...tokens, accessExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString() };
        await store.writeCredentials(credentials);
      } catch (error) {
        if (await blockConfirmedModelAccess(error, expected, original.account?.id)) throw error;
        if (!closing && !accessPaused && error instanceof GatewayError && error.status === 401 && generation === expected && credentials?.refreshToken === original.refreshToken && state.authState === 'signed_in') {
          state = { ...state, authState: 'expired', activationState: 'inactive', bindingVersion: null, activationError: null };
          runtimeTextModel = undefined; accessController?.abort();
          clearInterval(usageTimer); usageTimer = undefined;
          await input.closeRuntime();
        }
        throw error;
      }
    })();
    try { await refreshWork; } finally { refreshWork = undefined; }
  }
  async function activateCurrent() {
    await runtimeCloseWork;
    // Connecting a new session must not wait for unrelated or persisted jobs.
    if (state.activationState === 'ready') assertIdle();
    const cached = usesCachedModelKey() && !credentials?.modelAccessError ? bootstrapSchema.safeParse(credentials) : undefined;
    if (!cached?.success) await refresh();
    if (closing || accessPaused) return;
    const original = assertSignedIn(); const expected = generation;
    state.activationState = 'loading'; state.activationError = null;
    try {
      state.source = 'gateway'; state.bindingVersion = null;
      await saveConfiguration();
      await reportUsage();
      if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') return;
      const bootstrap = cached?.success ? cached.data : await input.client.bootstrap(original.accessToken, { rotate: !input.hasPendingTasks?.(), modelUsePolicy: cachedModelUsePolicy });
      if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') return;
      if (original.account && bootstrap.account.id !== original.account.id) throw new GatewayError('account_mismatch');
      state.account = bootstrap.account;
      for (const [modality, model] of Object.entries(selectedModels)) {
        if (bootstrap.models.some(candidate => candidate.modality === modality && candidate.id === model)) bootstrap.defaults[modality] = model;
      }
      const visible = await visibleBootstrap(bootstrap);
      if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') return;
      selectedModels = { ...visible.defaults }; state.selectedModels = { ...selectedModels };
      credentials = { ...original, ...bootstrap, defaults: visible.defaults, modelAccessError: undefined };
      await store.writeCredentials(credentials);
      if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') return;
      state.account = bootstrap.account; state.models = visible.models;
      accessBlocked = !visible.defaults.text;
      if (accessBlocked) throw new GatewayError('services_not_ready');
      await input.activateRuntime(visible);
      runtimeTextModel = visible.defaults.text;
      if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') { await input.closeRuntime(); return; }
      state.bindingVersion = bootstrap.bindingVersion;
      catalogUpdatedAt = Date.now();
      await saveConfiguration();
      if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') { await input.closeRuntime(); return; }
      state = { ...state, source: 'gateway', activationState: 'ready', account: bootstrap.account, models: visible.models, bindingVersion: bootstrap.bindingVersion, activationError: null };
      await reportUsage();
      startUsageHeartbeat();
    } catch (error) {
      runtimeTextModel = undefined;
      if (await blockConfirmedModelAccess(error, expected, original.account?.id)) return;
      if (!closing && !accessPaused) fail(error);
      await input.closeRuntime();
    }
    scheduleModelAccess();
  }
  async function readProfile() {
    if (closing || accessPaused || !credentials || state.authState !== 'signed_in') return;
    if (profileWork) return profileWork;
    if (Date.now() - profileUpdatedAt < 30_000) return;
    profileUpdatedAt = Date.now();
    profileWork = (async () => {
      await refresh();
      if (closing || accessPaused) return;
      const original = assertSignedIn(); const expected = generation;
      const profile = z.object({ account: accountSchema }).parse(await withAccountAccess(() => input.client.request('/api/v1/me', original.accessToken)));
      await serialize(async () => {
        if (closing || accessPaused || expected !== generation || credentials !== original || state.authState !== 'signed_in') return;
        if (original.account && profile.account.id !== original.account.id) throw new GatewayError('account_mismatch');
        const next = { ...original, account: profile.account };
        await store.writeCredentials(next);
        if (closing || accessPaused || expected !== generation || credentials !== original || state.authState !== 'signed_in') return;
        credentials = next; state.account = profile.account;
      });
    })().catch(() => undefined);
    try { await profileWork; }
    finally { profileWork = undefined; }
  }
  async function readCatalog() {
    if (closing || accessPaused || !credentials || state.authState !== 'signed_in' || state.source !== 'gateway' || state.activationState !== 'ready') return;
    if (catalogWork) return catalogWork;
    if (input.hasActiveTasks() || input.hasPendingTasks?.() || Date.now() - catalogUpdatedAt < 30_000) return;
    catalogUpdatedAt = Date.now();
    catalogWork = (async () => {
      await refresh();
      if (closing || accessPaused) return;
      const original = assertSignedIn(); const expected = generation;
      const catalog = catalogSchema.parse(await withAccountAccess(() => input.client.request('/api/v1/client/models', original.accessToken)));
      await serialize(async () => {
        if (closing || accessPaused || generation !== expected || credentials !== original || state.source !== 'gateway' || state.authState !== 'signed_in' || input.hasActiveTasks() || input.hasPendingTasks?.()) return;
        if (original.rotationPending || JSON.stringify(catalog.models) !== JSON.stringify(original.models)) {
          if (usesCachedModelKey()) { await synchronizeBinding(); await synchronizeAccessibleRuntime(); }
          else await activateCurrent();
        }
      });
    })().catch(() => undefined);
    try { await catalogWork; } finally { catalogWork = undefined; }
  }
  function refreshState(): Promise<void> {
    stateRefreshWork ??= (async () => {
      await readProfile(); await readCatalog();
      await refreshVisibleCatalog();
      if (needsAccessibleRuntime()) await serialize(synchronizeAccessibleRuntime);
      scheduleModelAccess();
    })().finally(() => { stateRefreshWork = undefined; });
    return stateRefreshWork;
  }
  function schedulePoll(id: string, seconds: number) {
    if (attempt?.attemptId !== id) return;
    attempt.nextPollAt = Date.now() + Math.max(5, seconds) * 1000;
    if (input.automaticPolling === false) return;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => { void pollAuthorization(id).catch(() => undefined); }, Math.max(0, attempt.nextPollAt - Date.now())); pollTimer.unref();
  }
  function checkAuthorization() {
    if (attempt && Date.now() >= attempt.nextPollAt) void pollAuthorization(attempt.attemptId).catch(() => undefined);
  }
  async function cancelAuthorization() {
    clearTimeout(pollTimer); const old = attempt; attempt = undefined; generation++;
    if (old) await input.client.cancelDevice(old.attemptId, old.deviceSecret).catch(() => undefined);
    if (state.authState === 'authorizing') {
      state.authState = old?.previousAuthState ?? (credentials ? 'expired' : 'signed_out');
      state.source = credentials ? 'gateway' : 'manual';
      state.activationState = credentials ? 'blocked' : 'inactive';
      await saveConfiguration();
    }
  }
  async function startAuthorization() {
    await initialize();
    if (credentials && state.authState === 'expired') {
      if (!input.hasPendingTasks?.()) await logout();
    }
    else if (credentials) throw new GatewayError('already_signed_in', 409);
    await cancelAuthorization();
    const expected = generation;
    const grant = await input.client.startDevice();
    const url = new URL(grant.authorizationUrl);
    if (url.origin !== input.client.origin || url.pathname !== '/device') throw new GatewayError('invalid_authorization_url');
    if (generation !== expected) { await input.client.cancelDevice(grant.attemptId, grant.deviceSecret); throw new GatewayError('authorization_canceled'); }
    attempt = { ...grant, generation: expected, expiresAt: Date.now() + grant.expiresIn * 1000, nextPollAt: Date.now(), previousAuthState: state.authState };
    state.source = 'gateway'; state.authState = 'authorizing'; state.activationState = 'loading'; state.activationError = null;
    await saveConfiguration();
    schedulePoll(grant.attemptId, grant.interval);
    return { attemptId: grant.attemptId, authorizationUrl: grant.authorizationUrl, expiresAt: new Date(attempt.expiresAt).toISOString() };
  }
  async function pollAuthorization(id: string) {
    const current = attempt; if (!current || current.attemptId !== id) return;
    if (pollWork?.attempt === current) return pollWork.work;
    clearTimeout(pollTimer);
    current.nextPollAt = Date.now() + Math.max(5, current.interval) * 1000;
    const work = performAuthorizationPoll(current);
    const pending = { attempt: current, work }; pollWork = pending;
    try { await work; } finally { if (pollWork === pending) pollWork = undefined; }
  }
  async function performAuthorizationPoll(current: NonNullable<typeof attempt>) {
    const id = current.attemptId;
    if (current.expiresAt <= Date.now()) { await cancelAuthorization(); state.activationError = { code: 'device_expired', message: 'Sign-in authorization expired. Sign in again.' }; return; }
    try {
      const tokens = await input.client.pollDevice(id, current.deviceSecret);
      if (generation !== current.generation || attempt !== current) { await input.client.logout(tokens.accessToken).catch(() => undefined); return; }
      await serialize(async () => {
        if (generation !== current.generation || attempt !== current) return;
        if (credentials?.account && input.hasPendingTasks?.()) {
          const profile = z.object({ account: accountSchema }).parse(await input.client.request('/api/v1/me', tokens.accessToken));
          if (profile.account.id !== credentials.account.id) {
            await input.client.logout(tokens.accessToken).catch(() => undefined);
            throw new GatewayError('account_mismatch', 409);
          }
        }
        credentials = { ...tokens, accessExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString() };
        platformProbeCredentials = undefined; platformProbeWork = undefined;
        await store.writeCredentials(credentials);
        if (generation !== current.generation || attempt !== current) return;
        state.source = 'gateway'; state.authState = 'signed_in'; attempt = undefined;
        await saveConfiguration();
        await activateCurrent();
      });
    } catch (error) {
      if (generation !== current.generation) return;
      if (error instanceof GatewayError && ['authorization_pending', 'slow_down', 'gateway_unavailable'].includes(error.code)) {
        if (error.code === 'slow_down') current.interval += 5;
        schedulePoll(id, current.interval); return;
      }
      fail(error); await cancelAuthorization();
    }
  }
  async function readModelCredentials(recovery = false): Promise<{ accountId: string; modelKey: string; keyVersion: string; bindingVersion: string; baseUrl: string; transport?: GatewayBootstrap['transport']; models: GatewayBootstrap['models']; defaults: Record<string, string>; accessContext?: string }> {
    await initialize();
    if (!usesCachedModelKey()) await refresh();
    await refreshVisibleCatalog();
    return currentModelCredentials(recovery);
  }
  function currentModelCredentials(recovery = false): Awaited<ReturnType<typeof readModelCredentials>> {
    if (closing || accessPaused) throw new GatewayError('auth_required', 401);
    const value = assertSignedIn();
    if (value.modelAccessError) throw new GatewayError(value.modelAccessError, value.modelAccessError === 'auth_required' ? 401 : 403);
    if (state.source !== 'gateway' || (!recovery && state.activationState !== 'ready') || !value.account || !value.modelKey || !value.keyVersion || !value.bindingVersion || !value.baseUrl || !value.models || !value.defaults) throw new GatewayError('services_not_ready');
    return { accountId: value.account.id, modelKey: value.modelKey, keyVersion: value.keyVersion, bindingVersion: value.bindingVersion, baseUrl: value.baseUrl, transport: value.transport, models: structuredClone(state.models), defaults: { ...value.defaults }, accessContext: input.modelAccess?.context() };
  }
  const modelCredentials = () => readModelCredentials();
  async function probeCredentials(): Promise<GatewayProbeCredentials> {
    await initialize(); await refresh();
    const current = assertSignedIn(); const expected = generation;
    if (platformProbeCredentials && Date.parse(platformProbeCredentials.expiresAt) > Date.now() + 60_000) return platformProbeCredentials;
    if (platformProbeWork) return platformProbeWork;
    const work = (async () => {
      const value = probeCredentialsSchema.parse(await withAccountAccess(() => input.client.request('/api/v1/client/probe-credentials', current.accessToken, {})));
      if (generation !== expected || state.authState !== 'signed_in' || credentials?.account?.id !== current.account?.id) throw new GatewayError('auth_required', 401);
      if (value.modelKey === credentials?.modelKey || Date.parse(value.expiresAt) <= Date.now()) throw new GatewayError('services_not_ready');
      platformProbeCredentials = value;
      return value;
    })();
    platformProbeWork = work;
    try { return await work; } finally { if (platformProbeWork === work) platformProbeWork = undefined; }
  }
  function reportUsage(allowClosing = false) {
    const result = usageMutation.then(async () => {
      if ((closing && !allowClosing) || usesCachedModelKey() || !credentials?.keyRotation || !credentials.keyVersion || state.authState !== 'signed_in') return undefined;
      await refresh();
      if (closing && !allowClosing) return undefined;
      const current = assertSignedIn(); const expected = generation;
      const installationId = await store.readDeviceID();
      if (closing && !allowClosing) return undefined;
      const value = z.object({ keyVersion: z.string().min(1) }).parse(await input.client.request('/api/v1/client/usage', current.accessToken, {
        keyVersion: current.keyVersion, installationId, busy: localUses > 0 || input.hasActiveTasks(), pending: input.hasPendingTasks?.() === true
      }));
      if (generation !== expected || state.authState !== 'signed_in') throw new GatewayError('auth_required', 401);
      return value.keyVersion;
    });
    usageMutation = result.then(() => undefined, () => undefined);
    return result;
  }
  function startUsageHeartbeat() {
    if (closing || accessPaused || usageTimer || input.automaticPolling === false) return;
    if (usesCachedModelKey()) { scheduleMaintenance(60_000); return; }
    if (!credentials?.keyRotation) return;
    usageTimer = setInterval(() => { void reportUsage().catch(() => undefined); }, 10_000);
    usageTimer.unref();
  }
  function scheduleMaintenance(milliseconds: number) {
    if (closing || accessPaused || state.authState !== 'signed_in' || state.activationState !== 'ready' || !usesCachedModelKey() || input.automaticPolling === false) return;
    usageTimer = setTimeout(() => {
      usageTimer = undefined;
      maintenanceWork = (async () => { await refresh(); await synchronizeBinding(); await serialize(synchronizeAccessibleRuntime); maintenanceFailures = 0; })()
        .catch(() => { maintenanceFailures++; })
        .finally(() => {
          maintenanceWork = undefined;
          const delay = Math.min(300_000, 60_000 * 2 ** Math.min(maintenanceFailures, 3));
          scheduleMaintenance(Math.round(delay * (0.9 + Math.random() * 0.2)));
        });
    }, milliseconds);
    usageTimer.unref();
  }
  function synchronizeBinding(): Promise<void> {
    bindingSyncWork ??= performBindingSync().finally(() => { bindingSyncWork = undefined; });
    return bindingSyncWork;
  }
  async function performBindingSync() {
    const current = assertSignedIn(); const expected = generation;
    let bootstrap: GatewayBootstrap;
    try { bootstrap = await input.client.bootstrap(current.accessToken, { rotate: false }); }
    catch (error) { await blockConfirmedModelAccess(error, expected, current.account?.id); throw error; }
    if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') throw new GatewayError('auth_required', 401);
    if (bootstrap.account.id !== current.account?.id) throw new GatewayError('account_mismatch');
    for (const [modality, model] of Object.entries(selectedModels)) {
      if (bootstrap.models.some(candidate => candidate.modality === modality && candidate.id === model)) bootstrap.defaults[modality] = model;
    }
    const visible = await visibleBootstrap(bootstrap);
    if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') throw new GatewayError('auth_required', 401);
    const deferCatalog = usesCachedModelKey() && (localUses > 0 || input.hasActiveTasks() || input.hasPendingTasks?.());
    const latest = assertSignedIn();
    credentials = { ...latest, ...bootstrap, defaults: deferCatalog ? latest.defaults : visible.defaults, models: deferCatalog ? latest.models : bootstrap.models };
    await store.writeCredentials(credentials);
    if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in') throw new GatewayError('auth_required', 401);
    state.bindingVersion = bootstrap.bindingVersion;
    if (!deferCatalog) {
      state.models = visible.models; catalogUpdatedAt = Date.now();
      selectedModels = { ...visible.defaults }; state.selectedModels = { ...selectedModels };
    }
    await saveConfiguration();
  }
  async function acquireModelUse(recovery = false) {
    const snapshot = await readModelCredentials(recovery);
    const cached = usesCachedModelKey();
    localUses++;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true; localUses--;
      if (!cached) await reportUsage().catch(() => undefined);
    };
    if (cached) return { credentials: snapshot, release };
    try {
      let version: string | undefined;
      try { version = await reportUsage(); }
      catch (error) {
        if (!(error instanceof GatewayError) || error.code !== 'binding_rotation_pending') throw error;
        await synchronizeBinding();
        version = await reportUsage();
      }
      if (version && version !== credentials?.keyVersion) await synchronizeBinding();
      return { credentials: await readModelCredentials(recovery), release };
    } catch (error) { await release(); throw error; }
  }
  const beginModelUse = (options?: { recovery: boolean }) => acquireModelUse(options?.recovery);
  async function recoverModelCredentials(keyVersion: string) {
    await initialize();
    if (!usesCachedModelKey()) throw new GatewayError('model_auth_required', 401);
    if (currentModelCredentials(true).keyVersion !== keyVersion) return currentModelCredentials(true);
    await refresh();
    await synchronizeBinding();
    return currentModelCredentials(true);
  }
  async function logout() {
    await initialize();
    accessPaused = true;
    input.client.cancelPendingRequests?.();
    accessController?.abort(); await accessWork;
    await serialize(async () => {
      await reportUsage().catch(() => undefined);
      state.authState = 'signing_out'; state.activationState = 'inactive';
      clearInterval(usageTimer); usageTimer = undefined;
      await cancelAuthorization();
      await refreshWork?.catch(() => undefined);
      await runtimeCloseWork;
      await input.closeRuntime();
      runtimeTextModel = undefined;
      if (credentials) await input.client.logout(credentials.accessToken).catch(() => undefined);
      await store.deleteCredentials(); state.source = 'manual'; state.bindingVersion = null; await saveConfiguration();
      credentials = undefined; platformProbeCredentials = undefined; balance = null; profileUpdatedAt = 0; catalogUpdatedAt = 0; accessUpdatedAt = 0; accessBlocked = false;
      state = { ...state, authState: 'signed_out', activationState: 'inactive', account: null, models: [], bindingVersion: null, activationError: null };
    }).finally(() => { accessPaused = false; });
  }
  async function billing(path: string, body?: unknown) { await initialize(); await refresh(); const current = assertSignedIn(); return withAccountAccess(() => input.client.request(path, current.accessToken, body)); }
  async function readBalance(): Promise<GatewayBalanceState> {
    try {
      const value = z.object({ balance: z.object({ availableUnits: z.string().regex(/^\d+$/), reservedUnits: z.string().regex(/^\d+$/), periodEnd: z.string().nullable(), asOf: z.string() }) }).parse(await billing('/api/v1/billing/summary'));
      balance = value.balance; return { status: 'ready', value: balance };
    } catch (error) { return { status: 'unavailable', lastKnown: balance, code: error instanceof GatewayError ? error.code : 'gateway_unavailable' }; }
  }
  return {
    initialize, startBackgroundRestore,
    peekState() { return structuredClone(state); },
    startAuthorization, cancelAuthorization, pollAuthorization, checkAuthorization, refresh, logout, modelCredentials, beginModelUse, recoverModelCredentials, probeCredentials, readBalance, billing, reportModelFailure,
    readPlans() { return input.client.request('/api/v1/plans', ''); },
    async readAvatar(accountId: string) {
      await initialize(); await refresh();
      const current = assertSignedIn(); const expected = generation;
      if (!current.account?.avatarUrl || current.account.id !== accountId) throw new GatewayError('avatar_unavailable', 404);
      const image = await withAccountAccess(() => input.client.avatar(current.accessToken, accountId));
      if (expected !== generation || state.authState !== 'signed_in' || credentials?.account?.id !== accountId) throw new GatewayError('avatar_unavailable', 404);
      return image;
    },
    async activate() { await initialize(); const expected = generation; await serialize(async () => { if (expected === generation) await activateCurrent(); }); },
    async readState() {
      await initialize();
      // Login is visible while model preparation still owns the mutation queue.
      if (closing || state.activationState === 'loading' || state.authState === 'signing_out') return structuredClone(state);
      const work = refreshState();
      if (input.deferStartupActivation) void work.catch(() => undefined);
      else await work;
      return structuredClone(state);
    },
    async setSource(source: ServiceSource) {
      await initialize(); await serialize(async () => {
        if (source === 'manual' && (credentials || state.authState !== 'signed_out')) throw new GatewayError('logout_required', 409);
        if (source === 'gateway') { assertSignedIn(); assertIdle(); await activateCurrent(); return; }
        state.source = 'manual'; await saveConfiguration();
      });
    },
    async selectModel(modality: import('@opencreator/protocol').GatewayModel['modality'], model: string) {
      await initialize(); await refreshVisibleCatalog(); await serialize(async () => {
        assertIdle(); const current = assertSignedIn(); const expected = generation;
        if (state.source !== 'gateway' || state.activationState !== 'ready' || !current.defaults || !state.models.some(candidate => candidate.modality === modality && candidate.id === model && (modality !== 'text' || candidate.capabilities.includes('responses')))) throw new GatewayError('invalid_model', 400);
        if (input.hasPendingTasks?.()) throw new GatewayError('active_tasks', 409);
        const next = { ...current, defaults: { ...current.defaults, [modality]: model } };
        if (modality === 'text') { await input.activateRuntime(bootstrapSchema.parse(next)); runtimeTextModel = model; }
        if (closing || accessPaused || generation !== expected || state.authState !== 'signed_in' || credentials?.modelAccessError) {
          runtimeTextModel = undefined; await input.closeRuntime(); throw new GatewayError('auth_required', 401);
        }
        // Runtime 激活期间可能更新凭据，只合并本次模型选择。
        const latest = assertSignedIn();
        credentials = { ...latest, defaults: { ...latest.defaults, [modality]: model } };
        selectedModels = { ...credentials.defaults }; state.selectedModels = { ...selectedModels };
        await store.writeCredentials(credentials); await saveConfiguration();
      });
      return structuredClone(state);
    },
    async close() {
      const restoring = startupRestoreWork !== undefined && !startupRestoreFinished;
      closing = true; input.client.cancelPendingRequests?.(); accessController?.abort();
      clearTimeout(pollTimer); clearInterval(usageTimer); usageTimer = undefined;
      await initialization; await startupRestoreWork; await stateRefreshWork?.catch(() => undefined);
      await maintenanceWork; await bindingSyncWork?.catch(() => undefined);
      await accessWork; await profileWork; await catalogWork; await mutation; await refreshWork?.catch(() => undefined);
      await runtimeCloseWork;
      await input.closeRuntime();
      if (!restoring && state.activationState === 'ready') await reportUsage(true).catch(() => undefined);
      await usageMutation; generation++;
    }
  };
}
export type GatewayAccountService = ReturnType<typeof createGatewayAccountService>;
