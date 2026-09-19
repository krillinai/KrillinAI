import {
  readPrivateJsonFile,
  writePrivateJsonFile
} from '../config/private-json-file.js';
import {
  readOpenCreatorCredentials,
  updateOpenCreatorCredentials
} from '../config/credentials-file.js';

type CredentialEntry = {
  getPassword(): Promise<string | null | undefined>;
  setPassword(value: string): Promise<void>;
};

export type CodexProviderCredentialStore = {
  readApiKey(provider?: CodexProviderIdentity): Promise<string | undefined>;
  writeApiKey(apiKey: string, provider?: CodexProviderIdentity): Promise<void>;
};

export type CodexProviderIdentity = {
  baseUrl: string;
  model: string;
};

export function createCodexProviderCredentialStore(
  entry: CredentialEntry
): CodexProviderCredentialStore {
  return {
    async readApiKey() {
      const apiKey = (await entry.getPassword())?.trim();
      return apiKey === undefined || apiKey.length === 0 ? undefined : apiKey;
    },
    async writeApiKey(apiKey) {
      await entry.setPassword(apiKey);
    }
  };
}

export function createFileCodexProviderCredentialStore(
  path: string
): CodexProviderCredentialStore {
  return {
    async readApiKey(provider) {
      const value = await readPrivateJsonFile(path);
      if (value === undefined) return undefined;
      if (
        !isRecord(value)
        || value.version !== 1
        || typeof value.apiKey !== 'string'
      ) {
        throw new Error('CODEX_PROVIDER_CONFIG_INVALID');
      }
      if (
        provider !== undefined
        && value.baseUrl !== normalizeBaseUrl(provider.baseUrl)
      ) return undefined;
      const apiKey = value.apiKey.trim();
      return apiKey.length === 0 ? undefined : apiKey;
    },
    async writeApiKey(apiKey, provider) {
      await writePrivateJsonFile(path, {
        version: 1,
        apiKey,
        ...(provider === undefined ? {} : { baseUrl: normalizeBaseUrl(provider.baseUrl) })
      });
    }
  };
}

export function createOpenCreatorCodexProviderCredentialStore(
  path: string
): CodexProviderCredentialStore {
  return {
    async readApiKey(provider) {
      const document = await readOpenCreatorCredentials(path);
      const current = document.codexProvider?.apiKey.trim();
      if (
        provider !== undefined
        && document.codexProvider?.baseUrl !== normalizeBaseUrl(provider.baseUrl)
      ) return undefined;
      return current === undefined || current.length === 0 ? undefined : current;
    },
    async writeApiKey(apiKey, provider) {
      await updateOpenCreatorCredentials(path, value => ({
        ...value,
        codexProvider: {
          apiKey,
          ...(provider === undefined ? {} : { baseUrl: normalizeBaseUrl(provider.baseUrl) })
        }
      }));
    }
  };
}

export async function readCodexProviderApiKey(input: {
  store: CodexProviderCredentialStore;
  provider: CodexProviderIdentity;
  readLegacy(): Promise<{
    baseUrl: string;
    model: string;
    apiKey: string;
  }>;
}): Promise<string | undefined> {
  let apiKey: string | undefined;
  try {
    apiKey = await input.store.readApiKey(input.provider);
  } catch {
    apiKey = undefined;
  }
  if (apiKey !== undefined) return apiKey;

  const legacy = await input.readLegacy();
  const legacyApiKey = (
    legacy.baseUrl === input.provider.baseUrl
    && legacy.model === input.provider.model
    && legacy.apiKey.trim().length > 0
  )
    ? legacy.apiKey
    : undefined;
  if (legacyApiKey !== undefined) {
    try {
      await input.store.writeApiKey(legacyApiKey, input.provider);
    } catch {
      // Keep using the legacy value until file migration succeeds.
    }
  }
  return legacyApiKey;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
