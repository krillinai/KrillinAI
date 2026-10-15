import { isDirectTransport } from './supplier.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GatewayAccountService } from './account-service.js';
import { createGatewayRuntimeBindings } from './runtime-bindings.js';

export async function prepareOfficialRuntimeProbe(input: {
  account: Pick<GatewayAccountService, 'readState' | 'beginModelUse'>;
  readProxy(): Promise<string>;
}) {
  const state = await input.account.readState();
  if (state.authState !== 'signed_in') return undefined;
  const model = state.models.find(candidate => candidate.id === state.selectedModels?.text
    && candidate.modality === 'text' && candidate.capabilities.includes('responses'));
  if (!model) return undefined;
  const use = await input.account.beginModelUse();
  let home: string;
  try { home = await mkdtemp(join(tmpdir(), 'opencreator-runtime-probe-')); }
  catch (error) { await use.release(); throw error; }
  const credentials = use.credentials;
  const bindings = createGatewayRuntimeBindings({
    codexHome: home, baseUrl: credentials.baseUrl, model: model.id, direct: isDirectTransport(credentials.transport), gateway: credentials.transport === 'gateway',
    readProxy: input.readProxy,
    readCredentials: async () => credentials,
    closeRuntime: async () => undefined
  });
  const cleanup = async () => {
    try { await bindings.close(); }
    finally { try { await rm(home, { recursive: true, force: true }); } finally { await use.release(); } }
  };
  try { return { ...await bindings.prepare(), cleanup }; }
  catch (error) { await cleanup(); throw error; }
}
