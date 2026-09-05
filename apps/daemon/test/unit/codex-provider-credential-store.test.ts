import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCodexProviderCredentialStore,
  createFileCodexProviderCredentialStore,
  createOpenCreatorCodexProviderCredentialStore,
  readCodexProviderApiKey
} from '../../src/codex/provider-credential-store.js';

describe('CodexProviderCredentialStore', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('stores the fallback API key without exposing another configuration', async () => {
    let saved: string | undefined;
    const store = createCodexProviderCredentialStore({
      getPassword: vi.fn(async () => saved),
      setPassword: vi.fn(async value => {
        saved = value;
      })
    });

    await expect(store.readApiKey()).resolves.toBeUndefined();
    await store.writeApiKey('sk-codex');
    await expect(store.readApiKey()).resolves.toBe('sk-codex');
  });

  it('migrates a matching legacy text model key', async () => {
    const store = {
      readApiKey: vi.fn(async () => undefined),
      writeApiKey: vi.fn(async () => undefined)
    };

    await expect(readCodexProviderApiKey({
      store,
      provider: {
        baseUrl: 'https://gateway.example.test/v1',
        model: 'gpt-codex'
      },
      readLegacy: async () => ({
        baseUrl: 'https://gateway.example.test/v1',
        apiKey: 'sk-legacy',
        model: 'gpt-codex'
      })
    })).resolves.toBe('sk-legacy');
    expect(store.writeApiKey).toHaveBeenCalledWith('sk-legacy');
  });

  it('persists the Codex API key in a local JSON configuration file', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-codex-provider-'));
    const path = join(root, 'config', 'codex-provider.json');
    const store = createFileCodexProviderCredentialStore(path);

    await store.writeApiKey('sk-file');

    await expect(store.readApiKey()).resolves.toBe('sk-file');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      version: 1,
      apiKey: 'sk-file'
    });
  });

  it('migrates the Codex API key into the shared OpenCreator credentials file', async () => {
    root = mkdtempSync(join(tmpdir(), 'opencreator-codex-provider-'));
    const credentialsFile = join(root, 'credentials.json');
    const legacyFile = join(root, 'data', 'config', 'codex-provider.json');
    await createFileCodexProviderCredentialStore(legacyFile).writeApiKey('sk-legacy-file');

    const store = createOpenCreatorCodexProviderCredentialStore(
      credentialsFile,
      legacyFile
    );

    await expect(store.readApiKey()).resolves.toBe('sk-legacy-file');
    expect(existsSync(legacyFile)).toBe(false);
    expect(JSON.parse(readFileSync(credentialsFile, 'utf8'))).toMatchObject({
      codexProvider: { apiKey: 'sk-legacy-file' }
    });
  });
});
