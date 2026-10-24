import type { CodexProviderConfig } from '@opencreator/protocol';
import { readLocalCodexModelConfiguration } from '../codex/local-provider.js';
import type { CreatorTextModelFallbackProvider, TextModelFallbackConfig } from './config-store.js';

/** Resolve local credentials when used; detecting them never saves a user override. */
export function createLocalCodexTextModelDefaults(input: {
  codexHome: string;
  env?: NodeJS.ProcessEnv;
  readGatewayConfig(): TextModelFallbackConfig | undefined;
}): CreatorTextModelFallbackProvider & { readStatus(): Promise<CodexProviderConfig> } {
  const readLocal = () => readLocalCodexModelConfiguration(input);
  return {
    async readStatus() {
      const local = await readLocal();
      return local.authentication === 'chatgpt'
        ? { authentication: 'chatgpt', apiKeyConfigured: false, baseUrl: '', model: local.model }
        : { authentication: 'api_key', apiKeyConfigured: true,
            baseUrl: local.provider.baseUrl, model: local.provider.model };
    },
    async read() {
      const local = await readLocal();
      // Chat-compatible API keys can be used by Krillin directly. Responses-only
      // providers need the HTTP adapter; only ChatGPT login needs the Codex runtime.
      if (local.authentication === 'api_key' && local.wireApi !== 'responses') return local.provider;
      const gateway = input.readGatewayConfig();
      if (gateway === undefined) throw new Error('Local Codex text service is not listening');
      return { ...gateway, model: local.authentication === 'chatgpt' ? local.model : local.provider.model };
    }
  };
}
