import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultCreatorServicesConfig } from '@opencreator/protocol';
import { createFileCreatorServicesConfigStore, createCreatorServicesConfigStoreWithTextModelFallback } from '../../src/creator-services/config-store.js';
import { createLocalCodexTextModelDefaults } from '../../src/creator-services/local-codex-defaults.js';
import { createKrillinCodexLlmGateway } from '../../src/creator/krillin/codex-llm-gateway.js';
import { registerCreatorServicesRoutes } from '../../src/api/routes.creator-services.js';
import { createWechatArticleModel } from '../../src/creator/article/model.js';

let root = '';
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ''; });

describe('local Codex defaults', () => {
  it.each(['chatgpt', 'api_key'] as const)('enables detected %s services without a settings write and preserves saved overrides after reopening', async authentication => {
    root = await mkdtemp(join(tmpdir(), 'creator-local-defaults-'));
    await writeFile(join(root, 'config.toml'), 'model = "local-model"\nopenai_base_url = "https://local.example/v1"\n');
    await writeFile(join(root, 'auth.json'), JSON.stringify(authentication === 'chatgpt'
      ? { auth_mode: 'chatgpt', tokens: { access_token: 'oauth-secret' } }
      : { auth_mode: 'apikey', OPENAI_API_KEY: 'local-key' }));
    const raw = createFileCreatorServicesConfigStore(join(root, 'creator-services.json'));
    const write = vi.spyOn(raw, 'write');
    const defaults = createLocalCodexTextModelDefaults({ codexHome: root,
      readGatewayConfig: () => ({ baseUrl: 'http://127.0.0.1:1234/internal/krillin-llm/v1', apiKey: 'bridge-key', model: 'codex' }) });
    let store = createCreatorServicesConfigStoreWithTextModelFallback(raw, defaults);
    let server = Fastify();
    await registerCreatorServicesRoutes(server, store, undefined, undefined, undefined, undefined, defaults.readStatus);
    try {
      expect((await server.inject('/creator-services/model/codex/status')).json()).toMatchObject({ authentication, model: 'local-model' });
      const response = await server.inject('/creator-services/config');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ config: { llm: { source: 'codex', model: 'local-model' }, image: { provider: 'codex-native' } } });
      expect(response.body).not.toMatch(/oauth-secret|local-key|bridge-key/);
      expect(write).not.toHaveBeenCalled();
      expect((await store.read()).llm).toMatchObject({ apiKey: 'bridge-key' });

      const custom = createDefaultCreatorServicesConfig();
      custom.llm = { source: 'custom', baseUrl: 'https://manual.example/v1', apiKey: 'manual-key', model: 'manual-model', jsonMode: true };
      custom.image.provider = 'gemini';
      custom.image.gemini.apiKey = 'manual-image-key';
      expect((await server.inject({ method: 'PATCH', url: '/creator-services/config', payload: custom })).statusCode).toBe(200);
      await server.close();
      await writeFile(join(root, 'config.toml'), 'model = "changed-local-model"\n');
      store = createCreatorServicesConfigStoreWithTextModelFallback(createFileCreatorServicesConfigStore(join(root, 'creator-services.json')), defaults);
      server = Fastify();
      await registerCreatorServicesRoutes(server, store);
      expect(await store.read()).toMatchObject({ llm: custom.llm, image: { provider: 'gemini', gemini: { apiKey: 'manual-image-key' } } });
      expect((await server.inject('/creator-services/config')).json().config.image.provider).toBe('gemini');
      expect((await server.inject({ method: 'DELETE', url: '/creator-services/config' })).json().config.image.provider).toBe('codex-native');
      expect((await store.read()).llm.source).toBe('codex');
    } finally { await server.close(); }
  });

  it.each(['chatgpt', 'api_key'] as const)('runs a regular text task through %s before any save, and never persists temporary bridge credentials', async authentication => {
    root = await mkdtemp(join(tmpdir(), 'creator-local-chatgpt-'));
    await writeFile(join(root, 'auth.json'), JSON.stringify(authentication === 'chatgpt'
      ? { auth_mode: 'chatgpt', tokens: { access_token: 'oauth-secret' } }
      : { auth_mode: 'apikey', OPENAI_API_KEY: 'local-api-secret' }));
    const run = vi.fn((request: { onNotification?(value: Record<string, unknown>): void }) => {
      request.onNotification?.({ method: 'item/completed', params: { item: { id: 'answer', type: 'agentMessage', text: '# Outline' } } });
      return { cancel() {}, result: Promise.resolve({ threadId: 'thread', turnId: 'turn', turnStatus: 'completed' as const,
        stderr: '', terminationReason: 'completed' as const, outputTruncation: { stderr: { truncated: false, droppedBytes: 0, droppedItems: 0 }, frames: { truncated: false, droppedBytes: 0, droppedItems: 0 } } }) };
    });
    const createHost = vi.fn(() => ({ pid: 1, started: Promise.resolve(1), run, isReusable: () => true, close: vi.fn(async () => undefined) }));
    const gateway = createKrillinCodexLlmGateway({ codexBin: '/fake/codex', codexHome: root, cwd: root, createHost });
    const server = Fastify();
    await gateway.register(server);
    const origin = await server.listen({ port: 0, host: '127.0.0.1' });
    const raw = createFileCreatorServicesConfigStore(join(root, 'creator-services.json'));
    const store = createCreatorServicesConfigStoreWithTextModelFallback(raw, createLocalCodexTextModelDefaults({ codexHome: root, readGatewayConfig: () => gateway.config(origin) }));
    try {
      const model = createWechatArticleModel({ configStore: store });
      await expect(model.generateOutline({ sources: [], topic: { id: 'topic', title: 'Title', angle: '', summary: '' }, writingPrompt: '', templatePrompt: '', signal: new AbortController().signal })).resolves.toBe('# Outline');
      expect(run).toHaveBeenCalledOnce();
      await store.write(await store.read());
      const persisted = await readFile(join(root, 'creator-services.json'), 'utf8');
      expect(persisted).not.toContain('ocllm_');
      expect(persisted).not.toContain(origin);
      expect(persisted).not.toContain('oauth-secret');
      expect(persisted).not.toContain('local-api-secret');
    } finally { await gateway.close(); await server.close(); }
  });
});
