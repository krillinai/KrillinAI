import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GatewayAccountService } from './account-service.js';
import { createGatewayRuntimeBindings } from './runtime-bindings.js';

export async function preparePlatformProbe(input: {
  account: Pick<GatewayAccountService, 'readState' | 'probeCredentials'>;
  readProxy(): Promise<string>;
}) {
  const state = await input.account.readState();
  if (state.authState !== 'signed_in') return undefined;
  const model = state.models.find(candidate => candidate.id === state.selectedModels?.text
    && candidate.modality === 'text' && candidate.capabilities.includes('responses'));
  if (!model) return undefined;
  const credentials = await input.account.probeCredentials();
  const home = await mkdtemp(join(tmpdir(), 'opencreator-platform-probe-'));
  const bindings = createGatewayRuntimeBindings({
    codexHome: home, baseUrl: credentials.baseUrl, model: model.id, direct: true,
    readProxy: input.readProxy,
    readCredentials: async () => ({ accountId: state.account!.id, modelKey: credentials.modelKey, keyVersion: credentials.keyVersion }),
    closeRuntime: async () => undefined
  });
  const cleanup = async () => {
    try { await bindings.close(); } finally { await rm(home, { recursive: true, force: true }); }
  };
  try { return { ...await bindings.prepare(), cleanup }; }
  catch (error) { await cleanup(); throw error; }
}
