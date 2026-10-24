import { parse } from '@iarna/toml';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type TomlValue = ReturnType<typeof parse>[string];

export type LocalCodexProvider = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type LocalCodexImageConfiguration =
  | { authentication: 'api_key'; provider: LocalCodexProvider }
  | { authentication: 'chatgpt' };

export type LocalCodexModelConfiguration =
  | { authentication: 'api_key'; provider: LocalCodexProvider; wireApi?: 'responses' }
  | { authentication: 'chatgpt'; model: string };

export async function readLocalCodexModelConfiguration(input: {
  codexHome: string;
  env?: NodeJS.ProcessEnv;
}): Promise<LocalCodexModelConfiguration> {
  const image = await readLocalCodexImageConfiguration(input);
  const config = await readToml(join(input.codexHome, 'config.toml'), true);
  const model = readString(config.model) || 'codex';
  const providers = readRecord(config.model_providers);
  const provider = readRecord(providers?.[readString(config.model_provider)]);
  return image.authentication === 'chatgpt'
    ? { authentication: 'chatgpt', model }
    : { authentication: 'api_key', provider: { ...image.provider, model },
        ...(provider?.wire_api === 'responses' ? { wireApi: 'responses' as const } : {}) };
}

export class LocalCodexProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalCodexProviderError';
  }
}

export async function readLocalCodexImageConfiguration(input: {
  codexHome: string;
  env?: NodeJS.ProcessEnv;
}): Promise<LocalCodexImageConfiguration> {
  const auth = await readJson(join(input.codexHome, 'auth.json'), true);
  const tokens = readRecord(auth?.tokens);
  if (auth?.auth_mode !== 'apikey' && (auth?.auth_mode === 'chatgpt' || readString(tokens?.access_token))) {
    if (!readString(tokens?.access_token)) {
      throw new LocalCodexProviderError('Local Codex ChatGPT credentials are incomplete. Sign in again in local Codex.');
    }
    return { authentication: 'chatgpt' };
  }
  return { authentication: 'api_key', provider: await readLocalCodexProvider(input) };
}

export async function readLocalCodexProvider(input: {
  codexHome: string;
  env?: NodeJS.ProcessEnv;
}): Promise<LocalCodexProvider> {
  const env = input.env ?? process.env;
  const config = await readToml(join(input.codexHome, 'config.toml'), true);
  const providerId = readString(config.model_provider);
  const providers = readRecord(config.model_providers);
  const provider = providerId.length === 0
    ? undefined
    : readRecord(providers?.[providerId]);
  const baseUrl = readString(provider?.base_url) || readString(config.openai_base_url)
    || ((!providerId || providerId === 'openai') ? 'https://api.openai.com/v1' : '');
  const model = readString(config.model);
  const providerToken = readString(provider?.experimental_bearer_token);
  const envKey = readString(provider?.env_key);
  const envToken = envKey.length === 0
    ? ((!providerId || providerId === 'openai') ? env.OPENAI_API_KEY?.trim() ?? '' : '')
    : (env[envKey]?.trim() ?? '');
  const auth = await readJson(join(input.codexHome, 'auth.json'));
  const authToken = readString(auth?.OPENAI_API_KEY);
  const apiKey = providerToken || envToken || authToken;

  if (!baseUrl) {
    throw new LocalCodexProviderError('Local Codex has no Base URL configured for image generation');
  }
  if (!apiKey) {
    throw new LocalCodexProviderError(
      'Local Codex has no API key for image generation. Check its configuration.'
    );
  }
  return {
    baseUrl,
    apiKey,
    model: imageModel(model)
  };
}

async function readToml(path: string, optional = false): Promise<Record<string, TomlValue>> {
  try {
    return parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (isNotFound(error)) {
      if (optional) return {};
      throw new LocalCodexProviderError('Local Codex configuration not found');
    }
    throw new LocalCodexProviderError('Could not read local Codex configuration');
  }
}

async function readJson(path: string, strict = false): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as unknown;
    const record = readRecord(value);
    if (strict && record === undefined) throw new Error('Invalid auth document');
    return record;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    if (strict) throw new LocalCodexProviderError('Could not read local Codex credentials. Sign in again or configure an API key.');
    return undefined;
  }
}

function imageModel(textModel: string): string {
  return /^gpt-image-/i.test(textModel) ? textModel : 'gpt-image-1';
}

function readRecord(value: unknown): Record<string, TomlValue> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, TomlValue>
    : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}
