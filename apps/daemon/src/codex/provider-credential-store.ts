import {
  deletePrivateJsonFile,
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
  readApiKey(): Promise<string | undefined>;
  writeApiKey(apiKey: string): Promise<void>;
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
    async readApiKey() {
      const value = await readPrivateJsonFile(path);
      if (value === undefined) return undefined;
      if (
        !isRecord(value)
        || value.version !== 1
        || typeof value.apiKey !== 'string'
      ) {
        throw new Error('CODEX_PROVIDER_CONFIG_INVALID');
      }
      const apiKey = value.apiKey.trim();
      return apiKey.length === 0 ? undefined : apiKey;
    },
    async writeApiKey(apiKey) {
      await writePrivateJsonFile(path, {
        version: 1,
        apiKey
      });
    }
  };
}

export function createOpenCreatorCodexProviderCredentialStore(
  path: string,
  legacyPath?: string
): CodexProviderCredentialStore {
  const legacy = legacyPath === undefined
    ? undefined
    : createFileCodexProviderCredentialStore(legacyPath);
  return {
    async readApiKey() {
      const document = await readOpenCreatorCredentials(path);
      const current = document.codexProvider?.apiKey.trim();
      if (current !== undefined && current.length > 0) return current;
      const legacyApiKey = await legacy?.readApiKey().catch(() => undefined);
      if (legacyApiKey !== undefined) {
        await updateOpenCreatorCredentials(path, value => ({
          ...value,
          codexProvider: { apiKey: legacyApiKey }
        }));
        await deletePrivateJsonFile(legacyPath!);
      }
      return legacyApiKey;
    },
    async writeApiKey(apiKey) {
      await updateOpenCreatorCredentials(path, value => ({
        ...value,
        codexProvider: { apiKey }
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
    apiKey = await input.store.readApiKey();
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
      await input.store.writeApiKey(legacyApiKey);
    } catch {
      // Keep using the legacy value until file migration succeeds.
    }
  }
  return legacyApiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
