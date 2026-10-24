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
import { readLocalCodexModelConfiguration } from '../../src/codex/local-provider.js';

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
      expect((await store.read()).llm).toMatchObject(authentication === 'chatgpt'
        ? { apiKey: 'bridge-key' }
        : { baseUrl: 'https://local.example/v1', apiKey: 'local-key' });

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

  it.each(['chatgpt', 'api_key'] as const)('runs a regular text task using %s before any save, and never persists local credentials', async authentication => {
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
    const upstream = vi.fn(async () => ({ choices: [{ message: { content: '# Outline' } }] }));
    server.post('/provider/v1/chat/completions', upstream);
    await gateway.register(server);
    const origin = await server.listen({ port: 0, host: '127.0.0.1' });
    await writeFile(join(root, 'config.toml'), `model = "local-model"\nopenai_base_url = "${origin}/provider/v1"\n`);
    const raw = createFileCreatorServicesConfigStore(join(root, 'creator-services.json'));
    const store = createCreatorServicesConfigStoreWithTextModelFallback(raw, createLocalCodexTextModelDefaults({ codexHome: root, readGatewayConfig: () => gateway.config(origin) }));
    try {
      const model = createWechatArticleModel({ configStore: store });
      await expect(model.generateOutline({ sources: [], topic: { id: 'topic', title: 'Title', angle: '', summary: '' }, writingPrompt: '', templatePrompt: '', signal: new AbortController().signal })).resolves.toBe('# Outline');
      expect(run).toHaveBeenCalledTimes(authentication === 'chatgpt' ? 1 : 0);
      expect(createHost).toHaveBeenCalledTimes(authentication === 'chatgpt' ? 1 : 0);
      expect(upstream).toHaveBeenCalledTimes(authentication === 'api_key' ? 1 : 0);
      await store.write(await store.read());
      const persisted = await readFile(join(root, 'creator-services.json'), 'utf8');
      expect(persisted).not.toContain('ocllm_');
      expect(persisted).not.toContain(origin);
      expect(persisted).not.toContain('oauth-secret');
      expect(persisted).not.toContain('local-api-secret');
    } finally { await gateway.close(); await server.close(); }
  });

  it('resolves an API key before the local gateway starts, and follows changes without persisting copies', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-direct-local-'));
    await writeFile(join(root, 'config.toml'), 'model = "first-model"\nopenai_base_url = "https://first.example/v1"\n');
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'first-key' }));
    const defaults = createLocalCodexTextModelDefaults({ codexHome: root, readGatewayConfig: () => undefined });
    expect(await defaults.read()).toEqual({ baseUrl: 'https://first.example/v1', apiKey: 'first-key', model: 'first-model' });
    await writeFile(join(root, 'config.toml'), 'model = "second-model"\nopenai_base_url = "https://second.example/v1"\n');
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'second-key' }));
    expect(await defaults.read()).toEqual({ baseUrl: 'https://second.example/v1', apiKey: 'second-key', model: 'second-model' });
  });

  it('uses HTTP for a Responses provider with no Codex host, and uses low reasoning for Krillin subtitles', async () => {
    root = await mkdtemp(join(tmpdir(), 'creator-local-responses-'));
    await writeFile(join(root, 'config.toml'), 'model = "local-model"\nmodel_provider = "local"\n[model_providers.local]\nbase_url = "https://local.example/v1"\nwire_api = "responses"\n');
    await writeFile(join(root, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'local-api-secret' }));
    const createHost = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: 'response-1', model: 'local-model', status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: '你好' }] }],
      usage: { input_tokens: 18, output_tokens: 2, total_tokens: 20, output_tokens_details: { reasoning_tokens: 0 } } }));
    const gateway = createKrillinCodexLlmGateway({ codexBin: '/fake/codex', codexHome: root, cwd: root, createHost, fetcher,
      readLocalConfiguration: () => readLocalCodexModelConfiguration({ codexHome: root }) });
    const server = Fastify();
    await gateway.register(server);
    const origin = await server.listen({ port: 0, host: '127.0.0.1' });
    const raw = createFileCreatorServicesConfigStore(join(root, 'creator-services.json'));
    const store = createCreatorServicesConfigStoreWithTextModelFallback(raw, createLocalCodexTextModelDefaults({ codexHome: root, readGatewayConfig: () => gateway.config(origin) }));
    try {
      const config = await store.read();
      const messages = [{ role: 'system', content: 'You are an assistant that helps with subtitle translation.' }, { role: 'user', content: 'Hello' }];
      const response = await fetch(`${config.llm.baseUrl}/chat/completions`, { method: 'POST',
        headers: { authorization: `Bearer ${config.llm.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.llm.model, messages, max_tokens: 512, reasoning_effort: 'none' }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ model: 'local-model', choices: [{ message: { content: '你好' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 18, completion_tokens: 2, total_tokens: 20, completion_tokens_details: { reasoning_tokens: 0 } } });
      expect(createHost).not.toHaveBeenCalled();
      const [endpoint, request] = fetcher.mock.calls[0]!;
      expect(String(endpoint)).toBe('https://local.example/v1/responses');
      expect(request?.headers).toMatchObject({ authorization: 'Bearer local-api-secret' });
      expect(JSON.parse(String(request?.body))).toEqual({ model: 'local-model', input: messages, store: false, stream: true, max_output_tokens: 512, reasoning: { effort: 'low' } });
      for (const effort of [undefined, 'none', 'high']) {
        await fetch(`${config.llm.baseUrl}/chat/completions`, { method: 'POST',
          headers: { authorization: `Bearer ${config.llm.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: config.llm.model, messages: [{ role: 'user', content: 'Write an outline.' }], reasoning_effort: effort }) });
        const sent = JSON.parse(String(fetcher.mock.calls.at(-1)![1]?.body));
        expect(sent.reasoning).toEqual(effort === undefined ? undefined : { effort });
      }
      expect(createHost).not.toHaveBeenCalled();
      await store.write(config);
      const persisted = await readFile(join(root, 'creator-services.json'), 'utf8');
      expect(persisted).not.toContain('local-api-secret');
      expect(persisted).not.toContain('ocllm_');
    } finally { await gateway.close(); await server.close(); }
  });
});
