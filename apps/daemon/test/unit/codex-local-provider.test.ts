import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LocalCodexProviderError,
  readLocalCodexProvider,
  readLocalCodexImageConfiguration,
  readLocalCodexModelConfiguration
} from '../../src/codex/local-provider.js';

describe('local Codex provider', () => {
  let root = '';

  it('uses the standard API endpoint with a local key and preserves the text model', async () => {
    root = await codexHome(['model = "local-text-model"']);
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'local-key' }));
    await expect(readLocalCodexModelConfiguration({ codexHome: root, env: {} })).resolves.toEqual({
      authentication: 'api_key', provider: { baseUrl: 'https://api.openai.com/v1', apiKey: 'local-key', model: 'local-text-model' }
    });
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = '';
  });

  it('preserves API key image configuration', async () => {
    root = await codexHome(['openai_base_url = "https://api.example.test/v1"']);
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'api-secret' }));
    await expect(readLocalCodexImageConfiguration({ codexHome: root })).resolves.toMatchObject({
      authentication: 'api_key', provider: { apiKey: 'api-secret', model: 'gpt-image-1' }
    });
  });

  it('honors an explicitly selected API mode even if an old OAuth token remains', async () => {
    root = await codexHome(['openai_base_url = "https://api.example.test/v1"']);
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'api-secret', tokens: { access_token: 'old-oauth-secret' } }));
    await expect(readLocalCodexImageConfiguration({ codexHome: root })).resolves.toMatchObject({ authentication: 'api_key', provider: { apiKey: 'api-secret' } });
  });

  it('does not silently route corrupted authentication to a configured API provider', async () => {
    root = await codexHome(['openai_base_url = "https://api.example.test/v1"']);
    await writeFile(join(root, 'auth.json'), '{corrupt');
    await expect(readLocalCodexImageConfiguration({ codexHome: root })).rejects.toThrow('无法读取本机 Codex 登录凭据');
  });

  it.each(['chatgpt', undefined])('recognizes OAuth credentials without treating them as API keys (%s)', async authMode => {
    root = await codexHome([]);
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: authMode, tokens: { access_token: 'oauth-secret' }, OPENAI_API_KEY: 'old-secret' }));
    const configuration = await readLocalCodexImageConfiguration({ codexHome: root });
    expect(configuration).toEqual({ authentication: 'chatgpt' });
    expect(JSON.stringify(configuration)).not.toContain('secret');
  });

  it('does not fall back to an old key when the selected ChatGPT login is incomplete', async () => {
    root = await codexHome(['openai_base_url = "https://api.example.test/v1"']);
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', OPENAI_API_KEY: 'old-secret' }));
    await expect(readLocalCodexImageConfiguration({ codexHome: root })).rejects.toThrow('重新登录');
  });

  it('reads the selected provider base URL and bearer token', async () => {
    root = await codexHome([
      'model = "gpt-5.6-sol"',
      'model_provider = "gateway"',
      '',
      '[model_providers.gateway]',
      'base_url = "https://forward.example.test/v1"',
      'experimental_bearer_token = "gateway-secret"'
    ]);

    await expect(readLocalCodexProvider({ codexHome: root })).resolves.toEqual({
      baseUrl: 'https://forward.example.test/v1',
      apiKey: 'gateway-secret',
      model: 'gpt-image-1'
    });
  });

  it('supports provider environment keys and configured image models', async () => {
    root = await codexHome([
      'model = "gpt-image-2"',
      'model_provider = "gateway"',
      '',
      '[model_providers.gateway]',
      'base_url = "https://forward.example.test/v1"',
      'env_key = "TEST_CODEX_PROVIDER_KEY"'
    ]);

    await expect(readLocalCodexProvider({
      codexHome: root,
      env: { TEST_CODEX_PROVIDER_KEY: 'environment-secret' }
    })).resolves.toEqual({
      baseUrl: 'https://forward.example.test/v1',
      apiKey: 'environment-secret',
      model: 'gpt-image-2'
    });
  });

  it('uses the API key credential stored by Codex', async () => {
    root = await codexHome([
      'model = "text-model"',
      'openai_base_url = "https://api.example.test/v1"'
    ]);
    await writeFile(join(root, 'auth.json'), JSON.stringify({
      auth_mode: 'apikey',
      OPENAI_API_KEY: 'stored-secret'
    }));

    await expect(readLocalCodexProvider({ codexHome: root })).resolves.toEqual({
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'stored-secret',
      model: 'gpt-image-1'
    });
  });

  it('does not treat a ChatGPT login token as an image API key', async () => {
    root = await codexHome(['model = "gpt-5"']);
    await writeFile(join(root, 'auth.json'), JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'oauth-secret' }
    }));

    await expect(readLocalCodexProvider({ codexHome: root }))
      .rejects.toBeInstanceOf(LocalCodexProviderError);
  });

  async function codexHome(lines: string[]): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'opencreator-local-provider-'));
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'config.toml'), `${lines.join('\n')}\n`);
    return path;
  }
});
